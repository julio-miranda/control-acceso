// js/controllers/Empleado.controller.js
(function (global) {
  "use strict";

  function logError(context, error, extra = {}) {
    console.log(`[EmpleadoController] ${context}`, {
      message: error?.message,
      error,
      ...extra
    });
  }

  class EmpleadoController {
    constructor(model) {
      this.model = model;
      this.ModelClass = global.EmpleadoModel || null;

      this.currentEditingEmployeeId = null;
      this.adminEmpresa = this.ModelClass?.UNICA_EMPRESA_ID || "UNICA EMPRESA";
      this.adminSucursal = "";
      this.adminEmpresaNombre = this.ModelClass?.UNICA_EMPRESA_NOMBRE || "Vértigo";

      this.currentUser = null;
      this.els = {};
      this.dataTable = null;

      this.sucursalMap = new Map();

      this.refreshInterval = null;
      this.reloadTimer = null;
      this.isLoadingEmployees = false;

      this._delegatedTableClickBound = false;
      this._menuOutsideClickBound = false;

      this._layoutAdjustScheduled = false;
      this._isAdjustingLayout = false;
    }

    cacheElements() {
      this.els = {
        containerForm: document.getElementById("empleado-container"),
        tableContainer: document.getElementById("tabla-empleados"),
        form: document.getElementById("empleado-form"),
        tituloForm: document.getElementById("titulo-form-empleado"),
        table: document.getElementById("empleadosTable"),
        jornadaSelect: document.getElementById("empleado-jornada"),

        nombre: document.getElementById("empleado-nombre"),
        email: document.getElementById("empleado-email"),
        identificacionNombre: document.getElementById("empleado-identificacionNombre"),
        identificacion: document.getElementById("empleado-identificacion"),
        direccion: document.getElementById("empleado-direccion"),
        isss: document.getElementById("empleado-isss"),
        afp: document.getElementById("empleado-afp"),
        salario: document.getElementById("empleado-salario"),
        nacimiento: document.getElementById("empleado-nacimiento"),
        descripcion: document.getElementById("descripcion"),
        pass1: document.getElementById("register-password"),
        pass2: document.getElementById("register-password2"),

        seccionPassword: document.getElementById("seccion-contraseña"),
        cambiarPasswordContainer: document.getElementById("cambiar-contrasena-empleado-container"),
        cambiarPasswordCheck: document.getElementById("cambiar-contrasena-empleado"),
        nuevaPasswordContainer: document.getElementById("nueva-contrasena-empleado-container"),
        nuevaPassword: document.getElementById("nueva-contrasena-empleado"),

        btnAgregar: document.getElementById("btn-agregar-empleado"),
        btnCancelar: document.getElementById("btn-cancelar-empleado"),
        btnLogout: document.getElementById("logout-button"),
        btnQr: document.getElementById("btnDescargarQr"),
        qrContainer: document.getElementById("qr-container"),
        menuToggle: document.getElementById("menu-toggle"),
        navbarLinks: document.getElementById("navbar-links"),
        empleadosTableBody: document.querySelector("#empleadosTable tbody")
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

    formatDateTime(dateStr) {
      if (!dateStr) return "";
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? String(dateStr) : d.toLocaleString();
    }

    formatMoney(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return "0.00";
      return n.toFixed(2);
    }

    setValue(el, value) {
      if (el) el.value = (value === null || typeof value === "undefined") ? "" : value;
    }

    getSucursalNombre(id) {
      if (!id) return "";
      return this.sucursalMap.get(id) || id;
    }

    async loadSucursales() {
      try {
        if (!window.supabase) return;

        const { data, error } = await window.supabase
          .from("sucursales")
          .select("id,nombre,codigo,empresa_id")
          .order("nombre", { ascending: true });

        if (error) {
          logError("loadSucursales", error);
          return;
        }

        this.sucursalMap.clear();
        (data || []).forEach((s) => {
          this.sucursalMap.set(s.id, s.nombre || s.codigo || s.id);
        });
      } catch (e) {
        logError("loadSucursales(catch)", e);
      }
    }

    async resolveSucursalId({ empresaId = null, preferredSucursalId = null } = {}) {
      const preferred = preferredSucursalId ? String(preferredSucursalId).trim() : "";

      if (preferred) {
        if (this.sucursalMap.has(preferred)) return preferred;

        try {
          const { data, error } = await window.supabase
            .from("sucursales")
            .select("id,empresa_id")
            .eq("id", preferred)
            .maybeSingle();

          if (!error && data?.id) {
            if (!empresaId || !data.empresa_id || String(data.empresa_id) === String(empresaId)) {
              return data.id;
            }
          }
        } catch (e) {
          logError("resolveSucursalId(preferred)", e, { preferred, empresaId });
        }
      }

      try {
        let ids = [];

        if (typeof this.model?.getSucursalIdsByEmpresa === "function" && empresaId) {
          ids = await this.model.getSucursalIdsByEmpresa(empresaId);
        } else if (window.supabase) {
          const { data, error } = await window.supabase
            .from("sucursales")
            .select("id")
            .eq("empresa_id", empresaId || "UNICA EMPRESA")
            .order("nombre", { ascending: true });

          if (!error) {
            ids = (data || []).map((r) => r.id).filter(Boolean);
          }
        }

        if (Array.isArray(ids) && ids.length > 0) {
          return ids[0];
        }
      } catch (e) {
        logError("resolveSucursalId(fallback)", e, { empresaId, preferredSucursalId });
      }

      return preferred || null;
    }

    openMobileMenu() {
      if (!this.els.navbarLinks) return;
      this.els.navbarLinks.classList.add("menu-open");
      this.els.navbarLinks.classList.add("active");
      document.body.classList.add("menu-open-active");

      if (this.els.menuToggle) {
        this.els.menuToggle.setAttribute("aria-expanded", "true");
        this.els.menuToggle.innerHTML = "&#10005;";
      }
    }

    closeMobileMenu() {
      if (!this.els.navbarLinks) return;
      this.els.navbarLinks.classList.remove("menu-open");
      this.els.navbarLinks.classList.remove("active");
      document.body.classList.remove("menu-open-active");

      if (this.els.menuToggle) {
        this.els.menuToggle.setAttribute("aria-expanded", "false");
        this.els.menuToggle.innerHTML = "&#9776;";
      }
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

    startAutoRefresh() {
      try {
        if (this.refreshInterval) return;

        this.refreshInterval = setInterval(() => {
          this.scheduleReloadEmployees();
        }, 12000);
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

    scheduleReloadEmployees() {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        this.loadEmployees().catch((err) => logError("scheduleReloadEmployees -> loadEmployees", err));
      }, 150);
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
          destroy: true,
          responsive: false,
          scrollX: false,
          scrollCollapse: false,
          autoWidth: false,
          deferRender: true,
          searching: true,
          paging: true,
          info: true,
          lengthChange: true,
          pageLength: 10,
          order: [[0, "asc"]],
          orderCellsTop: true,
          stateSave: false,
          dom: "lfrtip",
          columnDefs: [
            {
              targets: -1,
              orderable: false,
              searchable: false,
              className: "dt-center"
            }
          ],
          language: {
            emptyTable: "No hay empleados",
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
        if (!this.els.table || !this.dataTable) return;
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
          requestAnimationFrame(() => {
            requestAnimationFrame(finish);
          });
        } else {
          setTimeout(finish, 0);
        }
      } catch (e) {
        this._isAdjustingLayout = false;
        logError("syncTableLayout", e);
      }
    }

    async init() {
      try {
        this.cacheElements();
        this.bindEvents();

        const ok = await this.ensureAuthenticatedAndRole();
        if (!ok) return;

        await this.loadSucursales();
        this.applyDefaultDates();
        await this.loadEmployees();
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
                await this.loadEmployees();
              } catch (e) {
                logError("onAuthStateChange -> ensureAuthenticatedAndRole", e);
              }
            }
          });
        }

        window.addEventListener("focus", () => {
          this.scheduleReloadEmployees();
        });

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            this.scheduleReloadEmployees();
          }
        });

        window.addEventListener("resize", () => {
          this.syncTableLayout();
        });
      } catch (err) {
        logError("init", err);
        alert("Error inicializando el módulo:\n\n" + (err?.message || JSON.stringify(err)));
        await this.safeSignOutAndRedirect("init(catch)");
      }
    }

    bindEvents() {
      if (this.els.btnAgregar) {
        this.els.btnAgregar.addEventListener("click", () => this.agregarEmpleado());
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
          console.log("[EmpleadoController] Logout solicitado");
          await this.safeSignOutAndRedirect("logout-click");
        });
      }

      if (this.els.btnQr) {
        this.els.btnQr.addEventListener("click", () => this.generarQrEmpresa());
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
          item.addEventListener("click", () => {
            this.closeMobileMenu();
          });
        });
      }

      if (!this._delegatedTableClickBound) {
        document.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-action][data-id]");
          if (!btn) return;
          if (this.els.table && !this.els.table.contains(btn)) return;

          const action = btn.dataset.action;
          const id = btn.dataset.id;

          if (action === "edit") this.editarEmpleado(id);
          if (action === "delete") this.eliminarEmpleado(id);
        });

        this._delegatedTableClickBound = true;
      }

      if (this.els.cambiarPasswordCheck && this.els.nuevaPasswordContainer) {
        this.els.cambiarPasswordCheck.addEventListener("change", () => {
          this.els.nuevaPasswordContainer.style.display =
            this.els.cambiarPasswordCheck.checked ? "block" : "none";
        });
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
        console.log(`[EmpleadoController] Cerrando sesión (${reason})`);

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

    async getCurrentAuthenticatedUser() {
      try {
        if (window.AuthModel?.getCurrentUser) {
          const { user, error } = await window.AuthModel.getCurrentUser();

          if (error) {
            const msg = String(error?.message || "");
            if (msg.includes("Auth session missing")) {
              console.log("[EmpleadoController] No existe sesión activa.");
              return null;
            }
            logError("getCurrentAuthenticatedUser(AuthModel)", error);
            throw error;
          }

          return user;
        }

        if (window.supabase?.auth?.getUser) {
          const { data, error } = await window.supabase.auth.getUser();

          if (error) {
            const msg = String(error?.message || "");
            if (msg.includes("Auth session missing")) {
              console.log("[EmpleadoController] No existe sesión activa.");
              return null;
            }
            logError("getCurrentAuthenticatedUser(supabase)", error);
            throw error;
          }

          return data?.user ?? null;
        }

        throw new Error("No hay autenticación Supabase disponible.");
      } catch (err) {
        logError("getCurrentAuthenticatedUser catch", err);
        throw err;
      }
    }

    async ensureAuthenticatedAndRole() {
      const user = await this.getCurrentAuthenticatedUser();

      if (!user) {
        console.log("[EmpleadoController] No hay usuario autenticado.");
        await this.safeSignOutAndRedirect("no-session");
        return false;
      }

      this.currentUser = user;

      if (!window.supabase) {
        const err = new Error("Supabase no está inicializado.");
        logError("ensureAuthenticatedAndRole(supabase missing)", err, { userId: user.id });
        await this.safeSignOutAndRedirect("supabase-missing");
        return false;
      }

      let userData = null;

      const fromView = await window.supabase
        .from("v_usuarios")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (fromView.error) {
        logError("ensureAuthenticatedAndRole -> v_usuarios", fromView.error, { userId: user.id });
      }

      userData = fromView.data || null;

      if (!userData) {
        const fromTable = await window.supabase
          .from("usuarios")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (fromTable.error) {
          logError("ensureAuthenticatedAndRole -> usuarios", fromTable.error, { userId: user.id });
          throw fromTable.error;
        }

        userData = fromTable.data || null;
      }

      const sessionData = typeof window.AuthModel?.getSessionData === "function"
        ? await window.AuthModel.getSessionData()
        : null;

      const resolvedRole = String(
        userData?.role ||
        sessionData?.app_metadata?.role ||
        sessionData?.user_metadata?.role ||
        ""
      ).toLowerCase();

      if (!resolvedRole) {
        const err = new Error("No se pudo determinar el rol del usuario.");
        logError("ensureAuthenticatedAndRole -> role missing", err, { userId: user.id, userData, sessionData });
        await this.safeSignOutAndRedirect("role-missing");
        return false;
      }

      if (resolvedRole !== "admin") {
        console.log("[EmpleadoController] No tienes permisos de administrador.", userData);
        await this.safeSignOutAndRedirect("not-admin");
        return false;
      }

      this.adminEmpresa =
        (userData?.empresa_id ||
          sessionData?.app_metadata?.empresa_id ||
          sessionData?.user_metadata?.empresa_id ||
          "UNICA EMPRESA") + "";

      this.adminSucursal = await this.resolveSucursalId({
        empresaId: this.adminEmpresa,
        preferredSucursalId:
          userData?.sucursal_id ||
          sessionData?.app_metadata?.sucursal_id ||
          sessionData?.user_metadata?.sucursal_id ||
          null
      });

      if (!this.adminSucursal) {
        const err = new Error("No se encontró una sucursal válida para este usuario.");
        logError("ensureAuthenticatedAndRole -> sucursal missing", err, {
          userId: user.id,
          adminEmpresa: this.adminEmpresa,
          userData,
          sessionData
        });
        alert("No se encontró una sucursal válida. Debe existir al menos una sucursal registrada.");
        await this.safeSignOutAndRedirect("sucursal-missing");
        return false;
      }

      const emp = await this.model.getEmpresaById(this.adminEmpresa).catch((err) => {
        logError("ensureAuthenticatedAndRole -> getEmpresaById", err, { adminEmpresa: this.adminEmpresa });
        return null;
      });

      this.adminEmpresaNombre = userData?.empresa_nombre || emp?.nombre || "Vértigo";
      return true;
    }

    applyDefaultDates() {
      const sem = this.obtenerSemanaActual();

      const fechaInicioA = document.getElementById("fechaInicioa");
      const fechaFina = document.getElementById("fechaFina");
      const fechaInicio = document.getElementById("fechaInicio");
      const fechaFin = document.getElementById("fechaFin");

      if (fechaInicioA && !fechaInicioA.value) fechaInicioA.value = sem.inicio;
      if (fechaFina && !fechaFina.value) fechaFina.value = sem.fin;
      if (fechaInicio && !fechaInicio.value) fechaInicio.value = sem.inicio;
      if (fechaFin && !fechaFin.value) fechaFin.value = sem.fin;
    }

    obtenerSemanaActual() {
      const hoy = new Date();
      const d = hoy.getDay() || 7;
      const inicio = new Date(hoy);
      inicio.setDate(hoy.getDate() - d + 1);
      const fin = new Date(inicio);
      fin.setDate(inicio.getDate() + 6);
      return {
        inicio: inicio.toISOString().split("T")[0],
        fin: fin.toISOString().split("T")[0]
      };
    }

    showTable() {
      if (this.els.tableContainer) this.els.tableContainer.style.display = "block";
      if (this.els.containerForm) this.els.containerForm.style.display = "none";
      this.syncTableLayout();
    }

    showForm(mode = "create") {
      if (this.els.tableContainer) this.els.tableContainer.style.display = "none";
      if (this.els.containerForm) this.els.containerForm.style.display = "block";
      if (this.els.tituloForm) {
        this.els.tituloForm.textContent = mode === "edit" ? "Editar Empleado" : "Agregar Empleado";
      }

      if (this.els.seccionPassword) {
        this.els.seccionPassword.style.display = mode === "create" ? "block" : "none";
      }

      if (this.els.cambiarPasswordContainer) {
        this.els.cambiarPasswordContainer.style.display = mode === "edit" ? "block" : "none";
      }

      if (this.els.nuevaPasswordContainer) {
        this.els.nuevaPasswordContainer.style.display = "none";
      }

      if (this.els.cambiarPasswordCheck) {
        this.els.cambiarPasswordCheck.checked = false;
      }
    }

    resetForm() {
      if (this.els.form) this.els.form.reset();
      if (this.els.nuevaPasswordContainer) this.els.nuevaPasswordContainer.style.display = "none";
    }

    fillForm(u) {
      this.setValue(this.els.nombre, u.nombre);
      this.setValue(this.els.email, u.email);
      this.setValue(this.els.identificacionNombre, u.identificacion_nombre || u.identificacionNombre);
      this.setValue(this.els.identificacion, u.identificacion);
      this.setValue(this.els.direccion, u.direccion);
      this.setValue(this.els.isss, u.isss);
      this.setValue(this.els.afp, u.afp);
      this.setValue(this.els.salario, u.salario_h || u.salarioH || 0);
      this.setValue(this.els.nacimiento, u.nacimiento ? new Date(u.nacimiento).toISOString().slice(0, 10) : "");
      this.setValue(this.els.descripcion, u.descripcion);
    }

    getFormData() {
      const getVal = (el) => (el ? el.value.trim() : "");

      return {
        nombre: getVal(this.els.nombre),
        email: getVal(this.els.email),
        identificacionNombre: getVal(this.els.identificacionNombre),
        identificacion: getVal(this.els.identificacion),
        direccion: getVal(this.els.direccion),
        isss: getVal(this.els.isss),
        afp: getVal(this.els.afp),
        salarioH: parseFloat(getVal(this.els.salario)) || 0,
        nacimiento: getVal(this.els.nacimiento),
        descripcion: getVal(this.els.descripcion),
        password1: getVal(this.els.pass1),
        password2: getVal(this.els.pass2),
        nuevaPassword: getVal(this.els.nuevaPassword),
        cambiarPassword: !!this.els.cambiarPasswordCheck?.checked,
        jornadas: this.getSelectedJornadas()
      };
    }

    getSelectedJornadas() {
      const sel = this.els.jornadaSelect;
      if (!sel) return [];
      return Array.from(sel.selectedOptions).map((o) => o.value);
    }

    renderJornadas(jornadas, selectedIds = []) {
      if (!this.els.jornadaSelect) return;

      if (!jornadas || jornadas.length === 0) {
        this.els.jornadaSelect.innerHTML = "<option disabled>No hay jornadas disponibles</option>";
        return;
      }

      this.els.jornadaSelect.innerHTML = "";
      jornadas.forEach((j) => {
        const opt = document.createElement("option");
        opt.value = j.id;
        opt.textContent = j.nombre || j.id;
        opt.selected = selectedIds.includes(j.id);
        this.els.jornadaSelect.appendChild(opt);
      });
    }

    renderEmployees(empleados) {
      this.destroyDataTable();

      const rowsHtml = (empleados || []).map((u) => {
        const nombre = this.escapeHtml(u.nombre);
        const email = this.escapeHtml(u.email);
        const telefono = this.escapeHtml(u.telefono);
        const identificacion = this.escapeHtml(u.identificacion);
        const direccion = this.escapeHtml(u.direccion);
        const tipoDocumento = this.escapeHtml(u.identificacion_nombre || u.identificacionNombre);
        const nacimiento = this.escapeHtml(this.formatDate(u.nacimiento));
        const afp = this.escapeHtml(u.afp);
        const isss = this.escapeHtml(u.isss);
        const salario = this.escapeHtml(this.formatMoney(u.salario_h || u.salarioH || 0));
        const sucursal = this.escapeHtml(u.sucursal_nombre || this.getSucursalNombre(u.sucursal_id));
        const role = this.escapeHtml(u.role || "");
        const createdAt = this.escapeHtml(this.formatDateTime(u.created_at));
        const updatedAt = this.escapeHtml(this.formatDateTime(u.updated_at));
        const id = this.escapeHtml(u.id);

        return `
          <tr>
            <td>${nombre}</td>
            <td>${email}</td>
            <td>${telefono}</td>
            <td>${identificacion}</td>
            <td>${direccion}</td>
            <td>${tipoDocumento}</td>
            <td>${nacimiento}</td>
            <td>${afp}</td>
            <td>${isss}</td>
            <td>${salario}</td>
            <td>${sucursal}</td>
            <td>${role}</td>
            <td>${createdAt}</td>
            <td>${updatedAt}</td>
            <td>
              <div class="actions-cell">
                <button
                  type="button"
                  data-action="edit"
                  data-id="${id}"
                  class="btn-edit"
                >Editar</button>
                <button
                  type="button"
                  data-action="delete"
                  data-id="${id}"
                  class="btn-delete"
                >Eliminar</button>
              </div>
            </td>
          </tr>
        `;
      }).join("");

      if (this.els.empleadosTableBody) {
        this.els.empleadosTableBody.innerHTML = rowsHtml;
      }

      this.initDataTable();
      this.syncTableLayout();
    }

    async loadEmployees() {
      if (this.isLoadingEmployees) return;

      this.isLoadingEmployees = true;
      try {
        if (!this.sucursalMap.size) {
          await this.loadSucursales();
        }

        const empleados = await this.model.getEmpleados({
          empresaId: this.adminEmpresa || "UNICA EMPRESA",
          sucursalId: this.adminSucursal || null
        });

        this.renderEmployees(empleados);
      } catch (e) {
        logError("loadEmployees", e, {
          empresaId: this.adminEmpresa,
          sucursalId: this.adminSucursal
        });
        alert("Error cargando empleados: " + (e?.message || e));
      } finally {
        this.isLoadingEmployees = false;
      }
    }

    async agregarEmpleado() {
      try {
        this.currentEditingEmployeeId = null;
        this.resetForm();
        this.showForm("create");

        const jornadas = await this.model.getJornadas({
          empresaId: this.adminEmpresa || "UNICA EMPRESA",
          sucursalId: this.adminSucursal || null
        });

        this.renderJornadas(jornadas, []);
      } catch (e) {
        logError("agregarEmpleado", e);
        alert("Error preparando el formulario: " + (e?.message || e));
      }
    }

    async cancelarFormulario() {
      try {
        this.currentEditingEmployeeId = null;
        this.resetForm();
        this.showTable();
      } catch (e) {
        logError("cancelarFormulario", e);
      }
    }

    async editarEmpleado(id) {
      try {
        this.currentEditingEmployeeId = id;

        const u = await this.model.getEmpleadoById(id);
        if (!u) {
          console.log("[EmpleadoController] Empleado no encontrado", { id });
          alert("Empleado no encontrado");
          return;
        }

        this.fillForm(u);

        const jornadasEmpleado = await this.model.getJornadasEmpleado(id);
        const jornadas = await this.model.getJornadas({
          empresaId: this.adminEmpresa || "UNICA EMPRESA",
          sucursalId: this.adminSucursal || null
        });

        this.renderJornadas(jornadas, jornadasEmpleado);
        this.showForm("edit");
      } catch (e) {
        logError("editarEmpleado", e, { id });
        alert("Error cargando empleado: " + (e?.message || e));
      }
    }

    async eliminarEmpleado(id) {
      if (!confirm("¿Eliminar empleado también de autenticación y tabla?")) return;

      try {
        await this.model.deleteEmpleado(id);
        await this.loadEmployees();
        this.showTable();
        alert("Empleado eliminado correctamente.");
      } catch (e) {
        logError("eliminarEmpleado", e, { id });
        alert("Error al eliminar: " + (e?.message || e));
      }
    }

    async handleSubmit(ev) {
      ev.preventDefault();

      const form = this.getFormData();

      if (
        !form.nombre ||
        !form.email ||
        !form.identificacionNombre ||
        !form.identificacion ||
        !form.direccion ||
        !form.salarioH ||
        !form.nacimiento
      ) {
        console.log("[EmpleadoController] Validación fallida en handleSubmit", form);
        alert("Completa los campos obligatorios.");
        return;
      }

      try {
        const resolvedSucursalId = await this.resolveSucursalId({
          empresaId: this.adminEmpresa,
          preferredSucursalId: this.adminSucursal
        });

        if (!resolvedSucursalId) {
          alert("No se encontró una sucursal válida para guardar el empleado.");
          return;
        }

        this.adminSucursal = resolvedSucursalId;

        const commonData = {
          nombre: form.nombre,
          email: form.email,
          identificacion_nombre: form.identificacionNombre || null,
          identificacion: form.identificacion,
          direccion: form.direccion || null,
          salario_h: form.salarioH,
          nacimiento: form.nacimiento || null,
          descripcion: form.descripcion || null,
          isss: form.isss || null,
          afp: form.afp || null,
          sucursal_id: resolvedSucursalId,
          empresa_id: this.adminEmpresa || "UNICA EMPRESA"
        };

        if (this.currentEditingEmployeeId) {
          await this.model.updateEmpleado(
            this.currentEditingEmployeeId,
            commonData,
            form.jornadas
          );
          alert("Empleado actualizado");
        } else {
          if (!form.password1 || form.password1 !== form.password2) {
            console.log("[EmpleadoController] Contraseñas no coinciden", form);
            alert("Contraseñas no coinciden");
            return;
          }

          if (typeof this.model.createEmpleado === "function") {
            await this.model.createEmpleado({
              email: form.email,
              password: form.password1,
              data: {
                role: "empleado",
                ...commonData
              },
              jornadas: form.jornadas
            });
          } else {
            throw new Error("El modelo no tiene createEmpleado");
          }

          alert("Empleado creado con éxito");
        }

        this.currentEditingEmployeeId = null;
        this.resetForm();
        this.showTable();
        await this.loadEmployees();
      } catch (err) {
        logError("handleSubmit", err, { form, currentEditingEmployeeId: this.currentEditingEmployeeId });
        alert("Error: " + (err?.message || err));
      }
    }

    sanitizeFileName(name) {
      if (!name) return "empresa";
      return String(name)
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
    }

    generarQrEmpresa() {
      const text = this.adminEmpresaNombre || this.adminEmpresa || "Vértigo";
      if (!text) {
        console.log("[EmpleadoController] No hay empresa asignada para generar QR.");
        alert("No hay empresa asignada para generar QR.");
        return;
      }

      if (!this.els.qrContainer) return;

      this.els.qrContainer.innerHTML = "";

      try {
        new QRCode(this.els.qrContainer, {
          text,
          width: 400,
          height: 400
        });
      } catch (e) {
        logError("generarQrEmpresa(QRCode)", e, { text });
        alert("Error generando QR");
        return;
      }

      setTimeout(() => {
        let href = null;
        const img = this.els.qrContainer.querySelector("img");
        if (img && img.src) href = img.src;

        if (!href) {
          const canvas = this.els.qrContainer.querySelector("canvas");
          if (canvas && typeof canvas.toDataURL === "function") {
            href = canvas.toDataURL("image/png");
          }
        }

        if (!href) {
          console.log("[EmpleadoController] No se pudo generar imagen del QR");
          this.els.qrContainer.innerHTML = "";
          alert("No se pudo generar imagen del QR");
          return;
        }

        const a = document.createElement("a");
        a.href = href;
        a.download = this.sanitizeFileName(this.adminEmpresaNombre || this.adminEmpresa) + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();

        this.els.qrContainer.innerHTML = "";
      }, 150);
    }
  }

  global.EmpleadoController = EmpleadoController;

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const ModelClass = global.EmpleadoModel;

      if (!ModelClass) {
        throw new Error("EmpleadoModel no está cargado. Verifica el orden de los scripts.");
      }

      const supabaseClient = global.supabase;
      if (!supabaseClient) {
        throw new Error("Supabase no está inicializado.");
      }

      const model = new ModelClass(supabaseClient);
      const controller = new EmpleadoController(model);
      global.empleadoController = controller;

      await controller.init();
    } catch (e) {
      logError("DOMContentLoaded", e);
    }
  });
})(window);