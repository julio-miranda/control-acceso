// js/controllers/ClienteVip.controller.js
(function (global) {
  "use strict";

  function logError(context, error, extra = {}) {
    console.log(`[ClienteVipController] ${context}`, {
      message: error?.message,
      error,
      ...extra
    });
  }

  class ClienteVipController {
    constructor(model) {
      this.model = model;

      this.currentEditingId = null;
      this.currentUser = null;
      this.adminEmpresa = ClienteVipModel.UNICA_EMPRESA_ID;
      this.adminSucursal = null;
      this.adminEmpresaNombre = "Vértigo";

      this.els = {};
      this.dataTable = null;
      this.tableRows = [];

      this.sucursalMap = new Map();
      this._delegatedTableClickBound = false;
      this._menuOutsideClickBound = false;

      this.refreshInterval = null;
      this.reloadTimer = null;
      this.isLoadingClientes = false;

      this._layoutAdjustScheduled = false;
      this._isAdjustingLayout = false;
    }

    cacheElements() {
      this.els = {
        containerForm: document.getElementById("cliente-vip-container"),
        tableContainer: document.getElementById("tabla-clientes-vip"),
        form: document.getElementById("cliente-vip-form"),
        tituloForm: document.getElementById("titulo-form-cliente-vip"),
        table: document.getElementById("clientesVipTable"),
        search: document.getElementById("vipSearch"),

        nombre: document.getElementById("cliente-vip-nombre"),
        telefono: document.getElementById("cliente-vip-telefono"),
        email: document.getElementById("cliente-vip-email"),
        identificacion: document.getElementById("cliente-vip-identificacion"),
        fechaAlta: document.getElementById("cliente-vip-fecha-alta"),
        direccion: document.getElementById("cliente-vip-direccion"),
        notas: document.getElementById("cliente-vip-notas"),
        activo: document.getElementById("cliente-vip-activo"),

        btnAgregar: document.getElementById("btn-agregar-cliente-vip"),
        btnCancelar: document.getElementById("btn-cancelar-cliente-vip"),
        btnLogout: document.getElementById("logout-button"),
        menuToggle: document.getElementById("menu-toggle"),
        navbarLinks: document.getElementById("navbar-links"),

        statTotal: document.getElementById("stat-total-vip"),
        statActivos: document.getElementById("stat-activos-vip"),
        statInactivos: document.getElementById("stat-inactivos-vip")
      };
    }

    escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    formatDate(dateStr) {
      if (!dateStr) return "";
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleDateString();
    }

    setValue(el, value) {
      if (el) el.value = (value === null || typeof value === "undefined") ? "" : value;
    }

    getSucursalNombre(id) {
      if (!id) return "Sin sucursal";
      return this.sucursalMap.get(id) || "Sin sucursal";
    }

    async loadSucursales() {
      try {
        const sucursales = await this.model.getSucursales(this.adminEmpresa);

        this.sucursalMap.clear();
        (sucursales || []).forEach((s) => {
          this.sucursalMap.set(s.id, s.nombre || s.codigo || s.id);
        });
      } catch (e) {
        logError("loadSucursales", e);
        alert("Error cargando sucursales: " + (e?.message || e));
      }
    }

    async getCurrentAuthenticatedUser() {
      try {
        if (window.AuthModel?.getCurrentUser) {
          const { user, error } = await window.AuthModel.getCurrentUser();
          if (error) throw error;
          return user;
        }

        if (window.supabase?.auth?.getUser) {
          const { data, error } = await window.supabase.auth.getUser();
          if (error) throw error;
          return data?.user ?? null;
        }

        throw new Error("No hay autenticación Supabase disponible.");
      } catch (err) {
        logError("getCurrentAuthenticatedUser", err);
        throw err;
      }
    }

    async getSessionData() {
      try {
        if (window.AuthModel?.getSessionData) {
          return await window.AuthModel.getSessionData();
        }

        const user = await this.getCurrentAuthenticatedUser();
        if (!user) return null;

        return {
          uid: user.id,
          email: user.email ?? null,
          app_metadata: user.app_metadata ?? {},
          user_metadata: user.user_metadata ?? {}
        };
      } catch (err) {
        logError("getSessionData", err);
        return null;
      }
    }

    async safeSignOutAndRedirect(reason = "signOut") {
      const targetUrl = new URL("index.html", window.location.href).toString();
      let redirected = false;

      const hardRedirect = () => {
        if (redirected) return;
        redirected = true;
        window.location.replace(targetUrl);
      };

      const fallbackTimer = setTimeout(hardRedirect, 500);

      try {
        this.stopAutoRefresh();

        if (window.AuthModel?.signOut) {
          await window.AuthModel.signOut({ redirect: false });
        } else if (window.supabase?.auth?.signOut) {
          await window.supabase.auth.signOut({ scope: "local" });
        }

        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {
          logError("safeSignOutAndRedirect(clearStorage)", e);
        }
      } catch (e) {
        logError(`safeSignOutAndRedirect(${reason})`, e);
      } finally {
        clearTimeout(fallbackTimer);
        hardRedirect();
      }
    }

    async ensureAuthenticatedAndRole() {
      const user = await this.getCurrentAuthenticatedUser();
      if (!user) {
        await this.safeSignOutAndRedirect("no-session");
        return false;
      }

      this.currentUser = user;
      const session = await this.getSessionData();

      let userData = null;

      try {
        const fromView = await window.supabase
          .from("v_usuarios")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (fromView.error) {
          logError("ensureAuthenticatedAndRole -> v_usuarios", fromView.error, { userId: user.id });
        }

        userData = fromView.data || null;
      } catch (e) {
        logError("ensureAuthenticatedAndRole(v_usuarios catch)", e, { userId: user.id });
      }

      if (!userData) {
        try {
          const fromTable = await window.supabase
            .from("usuarios")
            .select("id,role,sucursal_id,contacto_id,created_at,updated_at")
            .eq("id", user.id)
            .maybeSingle();

          if (fromTable.error) {
            logError("ensureAuthenticatedAndRole -> usuarios", fromTable.error, { userId: user.id });
          }

          userData = fromTable.data || null;
        } catch (e) {
          logError("ensureAuthenticatedAndRole(usuarios catch)", e, { userId: user.id });
        }
      }

      const sessionRole = String(
        session?.app_metadata?.role ||
        session?.user_metadata?.role ||
        user?.app_metadata?.role ||
        user?.user_metadata?.role ||
        ""
      ).toLowerCase();

      const profileRole = String(userData?.role || "").toLowerCase();
      const role = profileRole || sessionRole;

      if (role !== "admin") {
        await this.safeSignOutAndRedirect("not-admin");
        return false;
      }

      this.adminEmpresa =
        userData?.empresa_id ||
        session?.app_metadata?.empresa_id ||
        session?.user_metadata?.empresa_id ||
        ClienteVipModel.UNICA_EMPRESA_ID;

      this.adminSucursal =
        userData?.sucursal_id ||
        session?.app_metadata?.sucursal_id ||
        session?.user_metadata?.sucursal_id ||
        null;

      this.adminEmpresaNombre =
        userData?.empresa_nombre ||
        session?.app_metadata?.empresa_nombre ||
        session?.user_metadata?.empresa_nombre ||
        "Vértigo";

      return true;
    }

    startAutoRefresh() {
      try {
        if (this.refreshInterval) return;

        this.refreshInterval = setInterval(() => {
          this.scheduleReloadClientes();
        }, 5000);
      } catch (e) {
        logError("startAutoRefresh", e);
      }
    }

    stopAutoRefresh() {
      try {
        if (this.refreshInterval) {
          clearInterval(this.refreshInterval);
          this.refreshInterval = null;
        }

        if (this.reloadTimer) {
          clearTimeout(this.reloadTimer);
          this.reloadTimer = null;
        }
      } catch (e) {
        logError("stopAutoRefresh", e);
      }
    }

    scheduleReloadClientes() {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        this.loadClientes().catch((err) => logError("scheduleReloadClientes -> loadClientes", err));
      }, 120);
    }

    setCurrentDate() {
      if (this.els.fechaAlta && !this.els.fechaAlta.value) {
        this.els.fechaAlta.value = new Date().toISOString().slice(0, 10);
      }
    }

    showTable() {
      if (this.els.tableContainer) this.els.tableContainer.style.display = "block";
      if (this.els.containerForm) this.els.containerForm.style.display = "none";
    }

    showForm(mode = "create") {
      if (this.els.tableContainer) this.els.tableContainer.style.display = "none";
      if (this.els.containerForm) this.els.containerForm.style.display = "block";

      if (this.els.tituloForm) {
        this.els.tituloForm.textContent = mode === "edit" ? "Editar Cliente VIP" : "Agregar Cliente VIP";
      }
    }

    resetForm() {
      if (this.els.form) this.els.form.reset();
      if (this.els.activo) this.els.activo.checked = true;
      this.setCurrentDate();
    }

    fillForm(c) {
      this.setValue(this.els.nombre, c.nombre);
      this.setValue(this.els.telefono, c.telefono);
      this.setValue(this.els.email, c.email);
      this.setValue(this.els.identificacion, c.identificacion);
      this.setValue(this.els.direccion, c.direccion);
      this.setValue(this.els.notas, c.notas);
      if (this.els.activo) this.els.activo.checked = !!c.activo;
      if (this.els.fechaAlta) {
        this.els.fechaAlta.value = c.fecha_alta
          ? String(c.fecha_alta).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
      }
    }

    getFormData() {
      const getVal = (el) => (el ? el.value.trim() : "");

      return {
        nombre: getVal(this.els.nombre),
        telefono: getVal(this.els.telefono),
        email: getVal(this.els.email),
        identificacion: getVal(this.els.identificacion),
        direccion: getVal(this.els.direccion),
        notas: getVal(this.els.notas),
        fecha_alta: getVal(this.els.fechaAlta),
        activo: !!this.els.activo?.checked
      };
    }

    showError(message) {
      alert(message);
    }

    destroyDataTable() {
      try {
        if (this.dataTable) {
          this.dataTable.destroy();
          this.dataTable = null;
        } else if (window.$ && $.fn && $.fn.DataTable && this.els.table && $.fn.DataTable.isDataTable(this.els.table)) {
          $(this.els.table).DataTable().destroy();
        }
      } catch (e) {
        logError("destroyDataTable", e);
        this.dataTable = null;
      }
    }

    buildTableRows(clientes) {
      return (clientes || []).map((c) => ({
        nombre: this.escapeHtml(c.nombre || "Sin nombre"),
        sucursal: this.escapeHtml(this.getSucursalNombre(c.sucursal_id)),
        telefono: this.escapeHtml(c.telefono || ""),
        email: this.escapeHtml(c.email || ""),
        identificacion: this.escapeHtml(c.identificacion || ""),
        fechaAlta: this.escapeHtml(this.formatDate(c.fecha_alta || c.created_at)),
        estadoHtml: c.activo !== false
          ? '<span class="badge-active">Activo</span>'
          : '<span class="badge-inactive">Inactivo</span>',
        notas: this.escapeHtml(c.notas || ""),
        accionesHtml: `
          <div class="actions-cell">
            <button type="button" class="action-btn action-edit" data-action="edit" data-id="${this.escapeHtml(c.id)}">Editar</button>
            <button type="button" class="action-btn action-toggle" data-action="toggle" data-id="${this.escapeHtml(c.id)}">
              ${c.activo !== false ? "Inactivar" : "Activar"}
            </button>
            <button type="button" class="action-btn action-delete" data-action="delete" data-id="${this.escapeHtml(c.id)}">Eliminar</button>
          </div>
        `
      }));
    }

    initDataTable() {
      const $jq = window.jQuery || window.$;
      const canUseDataTable = !!($jq && $jq.fn && $jq.fn.DataTable);

      if (!canUseDataTable || !this.els.table) return null;

      try {
        if (this.dataTable) {
          this.dataTable.destroy();
          this.dataTable = null;
        }

        if ($jq.fn.DataTable.isDataTable(this.els.table)) {
          $jq(this.els.table).DataTable().destroy();
        }

        this.dataTable = $jq(this.els.table).DataTable({
          responsive: false,
          scrollX: true,
          autoWidth: false,
          destroy: true,
          data: this.tableRows,
          deferRender: true,
          searching: false,
          paging: true,
          info: true,
          lengthChange: true,
          pageLength: 10,
          order: [[0, "asc"]],
          dom: "lfrtip",
          columns: [
            { data: "nombre", defaultContent: "" },
            { data: "sucursal", defaultContent: "" },
            { data: "telefono", defaultContent: "" },
            { data: "email", defaultContent: "" },
            { data: "identificacion", defaultContent: "" },
            { data: "fechaAlta", defaultContent: "" },
            { data: "estadoHtml", defaultContent: "" },
            { data: "notas", defaultContent: "" },
            { data: "accionesHtml", defaultContent: "" }
          ],
          language: {
            emptyTable: "No hay clientes VIP",
            zeroRecords: "No se encontraron registros",
            search: "Buscar:",
            lengthMenu: "Mostrar _MENU_ registros",
            info: "Mostrando _START_ a _END_ de _TOTAL_",
            infoEmpty: "Mostrando 0 a 0 de 0",
            infoFiltered: "(filtrado de _MAX_ registros)",
            paginate: {
              first: "Primero",
              last: "Último",
              next: "→",
              previous: "←"
            }
          },
          initComplete: () => {
            this.syncTableLayout();
          }
        });

        return this.dataTable;
      } catch (e) {
        logError("initDataTable", e);
        this.dataTable = null;
        return null;
      }
    }

    syncTableLayout() {
      try {
        if (!this.els.table) return;
        if (this._isAdjustingLayout) return;

        this._isAdjustingLayout = true;

        const finish = () => {
          try {
            if (this.dataTable && typeof this.dataTable.columns?.adjust === "function") {
              this.dataTable.columns.adjust();
            }
          } catch (e) {
            logError("syncTableLayout(adjust)", e);
          } finally {
            this._isAdjustingLayout = false;
          }
        };

        if (window.requestAnimationFrame) {
          requestAnimationFrame(() => requestAnimationFrame(finish));
        } else {
          setTimeout(finish, 0);
        }
      } catch (e) {
        this._isAdjustingLayout = false;
        logError("syncTableLayout", e);
      }
    }

    renderClientes(clientes) {
      this.tableRows = this.buildTableRows(clientes);

      if (this.dataTable) {
        try {
          this.dataTable.clear();
          this.dataTable.rows.add(this.tableRows);
          this.dataTable.draw(false);
          this.syncTableLayout();
          return;
        } catch (e) {
          logError("renderClientes(update DataTable)", e);
          this.destroyDataTable();
        }
      }

      if (this.els.table) {
        const tbody = this.els.table.querySelector("tbody");
        if (tbody) {
          tbody.innerHTML = this.tableRows.map((r) => `
            <tr>
              <td>${r.nombre}</td>
              <td>${r.sucursal}</td>
              <td>${r.telefono}</td>
              <td>${r.email}</td>
              <td>${r.identificacion}</td>
              <td>${r.fechaAlta}</td>
              <td>${r.estadoHtml}</td>
              <td>${r.notas}</td>
              <td>${r.accionesHtml}</td>
            </tr>
          `).join("");
        }
      }

      this.initDataTable();
      this.syncTableLayout();
    }

    async loadClientes() {
      if (this.isLoadingClientes) return;

      this.isLoadingClientes = true;
      try {
        const clientes = await this.model.getClientesVip({
          empresaId: this.adminEmpresa,
          sucursalId: this.adminSucursal
        });

        this.renderClientes(clientes);
        this.renderStats(clientes);
      } catch (e) {
        logError("loadClientes", e);
        alert("Error cargando clientes VIP: " + (e?.message || e));
      } finally {
        this.isLoadingClientes = false;
      }
    }

    renderStats(clientes) {
      const total = Array.isArray(clientes) ? clientes.length : 0;
      const activos = (clientes || []).filter((c) => c.activo !== false).length;
      const inactivos = total - activos;

      if (this.els.statTotal) this.els.statTotal.textContent = String(total);
      if (this.els.statActivos) this.els.statActivos.textContent = String(activos);
      if (this.els.statInactivos) this.els.statInactivos.textContent = String(inactivos);
    }

    async agregarClienteVip() {
      try {
        this.currentEditingId = null;
        this.resetForm();
        this.showForm("create");
      } catch (e) {
        logError("agregarClienteVip", e);
        alert("Error preparando el formulario: " + (e?.message || e));
      }
    }

    async cancelarFormulario() {
      try {
        this.currentEditingId = null;
        this.resetForm();
        this.showTable();
      } catch (e) {
        logError("cancelarFormulario", e);
      }
    }

    async editarClienteVip(id) {
      try {
        const cliente = await this.model.getClienteVipById(id);
        if (!cliente) {
          alert("Cliente VIP no encontrado");
          return;
        }

        this.currentEditingId = id;
        this.fillForm(cliente);
        this.showForm("edit");
      } catch (e) {
        logError("editarClienteVip", e, { id });
        alert("Error cargando cliente VIP: " + (e?.message || e));
      }
    }

    async toggleClienteVip(id) {
      try {
        const cliente = await this.model.getClienteVipById(id);
        if (!cliente) {
          alert("Cliente VIP no encontrado");
          return;
        }

        const nuevoEstado = !(cliente.activo !== false);
        const confirmText = nuevoEstado
          ? "¿Activar este cliente VIP?"
          : "¿Inactivar este cliente VIP?";

        if (!confirm(confirmText)) return;

        if (nuevoEstado) {
          await this.model.activarClienteVip(id);
        } else {
          await this.model.inactivarClienteVip(id);
        }

        await this.loadClientes();
      } catch (e) {
        logError("toggleClienteVip", e, { id });
        alert("Error al cambiar el estado: " + (e?.message || e));
      }
    }

    async eliminarClienteVip(id) {
      if (!confirm("¿Eliminar definitivamente este cliente VIP?")) return;

      try {
        await this.model.deleteClienteVip(id);
        await this.loadClientes();
        alert("Cliente VIP eliminado correctamente.");
      } catch (e) {
        logError("eliminarClienteVip", e, { id });
        alert("Error al eliminar: " + (e?.message || e));
      }
    }

    getFormData() {
      const getVal = (el) => (el ? el.value.trim() : "");

      return {
        nombre: getVal(this.els.nombre),
        telefono: getVal(this.els.telefono),
        email: getVal(this.els.email),
        identificacion: getVal(this.els.identificacion),
        direccion: getVal(this.els.direccion),
        notas: getVal(this.els.notas),
        fecha_alta: getVal(this.els.fechaAlta),
        activo: !!this.els.activo?.checked
      };
    }

    async handleSubmit(ev) {
      ev.preventDefault();

      const form = this.getFormData();

      if (!form.nombre) {
        alert("El nombre es obligatorio.");
        return;
      }

      try {
        if (this.currentEditingId) {
          await this.model.updateClienteVip(this.currentEditingId, form);
          alert("Cliente VIP actualizado correctamente.");
        } else {
          await this.model.createClienteVip({
            ...form,
            sucursal_id: this.adminSucursal || null
          });
          alert("Cliente VIP creado correctamente.");
        }

        this.currentEditingId = null;
        this.resetForm();
        this.showTable();
        await this.loadClientes();
      } catch (err) {
        logError("handleSubmit", err, { form, currentEditingId: this.currentEditingId });
        alert("Error: " + (err?.message || err));
      }
    }

    openMobileMenu() {
      if (!this.els.navbarLinks) return;
      this.els.navbarLinks.classList.add("menu-open");
      this.els.navbarLinks.classList.add("active");
      document.body.classList.add("menu-open-active");
    }

    closeMobileMenu() {
      if (!this.els.navbarLinks) return;
      this.els.navbarLinks.classList.remove("menu-open");
      this.els.navbarLinks.classList.remove("active");
      document.body.classList.remove("menu-open-active");
    }

    toggleMobileMenu() {
      if (!this.els.navbarLinks) return;

      const isOpen =
        this.els.navbarLinks.classList.contains("menu-open") ||
        this.els.navbarLinks.classList.contains("active");

      if (isOpen) {
        this.closeMobileMenu();
      } else {
        this.openMobileMenu();
      }
    }

    bindEvents() {
      if (this.els.btnAgregar) {
        this.els.btnAgregar.addEventListener("click", () => this.agregarClienteVip());
      }

      if (this.els.btnCancelar) {
        this.els.btnCancelar.addEventListener("click", () => this.cancelarFormulario());
      }

      if (this.els.form) {
        this.els.form.addEventListener("submit", (ev) => this.handleSubmit(ev));
      }

      if (this.els.btnLogout) {
        this.els.btnLogout.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeMobileMenu();
          await this.safeSignOutAndRedirect("logout-click");
        });
      }

      if (this.els.menuToggle && this.els.navbarLinks) {
        this.els.menuToggle.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.toggleMobileMenu();
        });

        if (!this._menuOutsideClickBound) {
          document.addEventListener("click", (e) => {
            if (!this.els.navbarLinks || !this.els.menuToggle) return;

            const clickedInsideMenu = this.els.navbarLinks.contains(e.target);
            const clickedToggle = this.els.menuToggle.contains(e.target);

            if (!clickedInsideMenu && !clickedToggle) {
              this.closeMobileMenu();
            }
          });

          this._menuOutsideClickBound = true;
        }

        this.els.navbarLinks.querySelectorAll("a, button").forEach((item) => {
          item.addEventListener("click", () => this.closeMobileMenu());
        });
      }

      if (this.els.search) {
        this.els.search.addEventListener("input", () => this.filterTable(this.els.search.value));
      }

      if (!this._delegatedTableClickBound) {
        document.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-action][data-id]");
          if (!btn) return;
          if (this.els.table && !this.els.table.contains(btn)) return;

          const action = btn.dataset.action;
          const id = btn.dataset.id;

          if (action === "edit") this.editarClienteVip(id);
          if (action === "toggle") this.toggleClienteVip(id);
          if (action === "delete") this.eliminarClienteVip(id);
        });

        this._delegatedTableClickBound = true;
      }

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.scheduleReloadClientes();
        }
      });

      window.addEventListener("focus", () => {
        this.scheduleReloadClientes();
      });

      window.addEventListener("resize", () => {
        this.syncTableLayout();
      });
    }

    filterTable(term) {
      if (this.dataTable) {
        this.dataTable.search(term).draw();
        return;
      }

      const tbody = this.els.table?.querySelector("tbody");
      if (!tbody) return;

      const rows = Array.from(tbody.querySelectorAll("tr"));
      const q = String(term || "").toLowerCase().trim();

      rows.forEach((row) => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(q) ? "" : "none";
      });
    }

    async init() {
      try {
        this.cacheElements();
        this.bindEvents();

        const ok = await this.ensureAuthenticatedAndRole();
        if (!ok) return;

        await this.loadSucursales();
        this.setCurrentDate();
        await this.loadClientes();
        this.startAutoRefresh();

        if (window.supabase?.auth?.onAuthStateChange) {
          window.supabase.auth.onAuthStateChange(async (event) => {
            if (event === "SIGNED_OUT") {
              this.stopAutoRefresh();
              return;
            }

            if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
              try {
                await this.ensureAuthenticatedAndRole();
                await this.loadSucursales();
                await this.loadClientes();
              } catch (e) {
                logError("onAuthStateChange -> ensureAuthenticatedAndRole", e);
              }
            }
          });
        }
      } catch (err) {
        logError("init", err);
        alert("Error inicializando el módulo:\n\n" + (err?.message || JSON.stringify(err)));
        await this.safeSignOutAndRedirect("init(catch)");
      }
    }
  }

  global.ClienteVipController = ClienteVipController;

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const ModelClass = global.ClienteVipModel;
      if (!ModelClass) {
        throw new Error("ClienteVipModel no está cargado. Verifica el orden de los scripts.");
      }

      if (!window.supabase) {
        throw new Error("Supabase no está inicializado.");
      }

      const model = new ModelClass(window.supabase);
      const controller = new ClienteVipController(model);
      window.clienteVipController = controller;

      await controller.init();
    } catch (e) {
      logError("DOMContentLoaded", e);
    }
  });
})(window);