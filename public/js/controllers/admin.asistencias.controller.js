// js/controllers/admin.asistencia.controller.js
(function (global) {
  class AdminAsistenciasController {
    constructor(model) {
      this.model = model;
      this.supabase = window.supabase;
      this.currentEditingJornadaId = null;

      this.adminEmpresa = "";
      this.adminSucursal = "";
      this.adminEmpresaNombre = "";
    }

    getSemanaActual() {
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

    sanitizeFileName(name) {
      if (!name) return "empresa";
      return String(name)
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "_");
    }

    escapeHtml(str) {
      if (str === null || typeof str === "undefined") return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    formatDateShort(d) {
      if (!d) return "";
      try {
        const date = new Date(d);
        if (isNaN(date)) return String(d);
        return date.toLocaleDateString();
      } catch (e) {
        return String(d);
      }
    }

    async init() {
      try {
        this.bindGlobals();
        this.initDates();
        this.bindEvents();
        await this.requireSessionAndLoad();
      } catch (err) {
        console.error("Error inicializando controlador:", err);
        await this.safeSignOutAndRedirect("init-catch");
      }
    }

    bindGlobals() {
      window.cargarAsistencias = this.cargarAsistencias.bind(this);
      window.cargarJornadas = this.cargarJornadas.bind(this);
      window.cargarJornadasEnSelect = this.cargarJornadasEnSelect.bind(this);
      window.eliminarAsistencia = this.eliminarAsistencia.bind(this);
      window.consentirSinEntrada = this.consentirSinEntrada.bind(this);
      window.consentirSinSalida = this.consentirSinSalida.bind(this);
      window.editarJornada = this.editarJornada.bind(this);
      window.eliminarJornada = this.eliminarJornada.bind(this);
    }

    initDates() {
      const sem = this.getSemanaActual();

      const fechaInicioA = document.getElementById("fechaInicioa");
      const fechaFina = document.getElementById("fechaFina");

      if (fechaInicioA && !fechaInicioA.value) fechaInicioA.value = sem.inicio;
      if (fechaFina && !fechaFina.value) fechaFina.value = sem.fin;
    }

    bindEvents() {
      const logoutBtn = document.getElementById("logout-button");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.safeSignOutAndRedirect("logout-click");
        });
      }

      const filtrarA = document.getElementById("filtrarA");
      if (filtrarA) {
        filtrarA.addEventListener("click", async () => {
          const inicio = document.getElementById("fechaInicioa")?.value;
          const fin = document.getElementById("fechaFina")?.value;

          if (!inicio || !fin) {
            alert("Selecciona ambas fechas para filtrar");
            return;
          }

          filtrarA.disabled = true;
          try {
            await this.cargarAsistencias(inicio, fin);
          } finally {
            filtrarA.disabled = false;
          }
        });
      }

      const btnQr = document.getElementById("btnDescargarQr");
      if (btnQr) {
        btnQr.addEventListener("click", async () => {
          const cont = document.getElementById("qr-container");
          if (!cont) return alert("Contenedor de QR no encontrado");

          const text = this.adminEmpresaNombre || this.adminEmpresa || "";
          if (!text) return alert("No hay empresa asignada para generar QR.");

          cont.innerHTML = "";
          try {
            new QRCode(cont, { text, width: 400, height: 400 });
          } catch (e) {
            console.error("Error generando QR:", e);
            return alert("Error generando QR");
          }

          setTimeout(() => {
            let href = null;
            const img = cont.querySelector("img");
            if (img && img.src) href = img.src;

            if (!href) {
              const canvas = cont.querySelector("canvas");
              if (canvas && typeof canvas.toDataURL === "function") {
                href = canvas.toDataURL("image/png");
              }
            }

            if (!href) {
              cont.innerHTML = "";
              return alert("No se pudo generar imagen del QR");
            }

            const a = document.createElement("a");
            a.href = href;
            a.download = this.sanitizeFileName(this.adminEmpresaNombre || this.adminEmpresa) + ".png";
            document.body.appendChild(a);
            a.click();
            a.remove();
            cont.innerHTML = "";
          }, 150);
        });
      }

      const menuToggle = document.getElementById("menu-toggle");
      const navLinks = document.getElementById("navbar-links");

      if (menuToggle && navLinks) {
        menuToggle.addEventListener("click", (e) => {
          e.stopPropagation();
          navLinks.classList.toggle("active");
        });

        navLinks.querySelectorAll("a, button").forEach(item => {
          item.addEventListener("click", () => {
            navLinks.classList.remove("active");
          });
        });

        document.addEventListener("click", (e) => {
          if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
            navLinks.classList.remove("active");
          }
        });
      }

      const jornadaForm = document.getElementById("jornada-form");
      if (jornadaForm) {
        jornadaForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          await this.guardarJornada();
        });
      }
    }

    async requireSessionAndLoad() {
      const checkFn = typeof window.checkUserSession === "function"
        ? window.checkUserSession
        : async (cb) => cb(null);

      await checkFn(async (uid, sessionData) => {
        if (!uid) return;

        if (this.supabase) {
          try {
            const profile = await this.model.supabase
              .from("v_usuarios")
              .select("*")
              .eq("id", uid)
              .maybeSingle();

            if (!profile.error && profile.data) {
              const role = String(profile.data.role || "").toLowerCase();
              if (role !== "admin") {
                alert("No tienes permisos de administrador.");
                await this.safeSignOutAndRedirect("not-admin");
                return;
              }

              this.adminEmpresa = String(profile.data.empresa_id || "");
              this.adminSucursal = String(profile.data.sucursal_id || "");

              if (this.adminEmpresa) {
                try {
                  const { data: emp } = await this.supabase
                    .from("empresa")
                    .select("nombre")
                    .eq("id", this.adminEmpresa)
                    .maybeSingle();

                  if (emp?.nombre) this.adminEmpresaNombre = emp.nombre;
                } catch (e) {
                  console.warn("No se pudo obtener nombre de empresa:", e);
                }
              }
            } else {
              const roleFromSession = String(
                sessionData?.app_metadata?.role ||
                sessionData?.user_metadata?.role ||
                ""
              ).toLowerCase();

              if (roleFromSession !== "admin") {
                alert("No tienes permisos de administrador.");
                await this.safeSignOutAndRedirect("not-admin-session");
                return;
              }

              this.adminEmpresa = String(
                sessionData?.app_metadata?.empresa_id ||
                sessionData?.user_metadata?.empresa_id ||
                ""
              );

              this.adminSucursal = String(
                sessionData?.app_metadata?.sucursal_id ||
                sessionData?.user_metadata?.sucursal_id ||
                ""
              );

              this.adminEmpresaNombre = String(
                sessionData?.app_metadata?.empresa_nombre ||
                sessionData?.user_metadata?.empresa_nombre ||
                ""
              );
            }
          } catch (e) {
            console.warn("Error al obtener datos de usuario:", e);
          }
        }

        await this.loadInitialData();
      }, { redirectOnFail: false });
    }

    async loadInitialData() {
      const sem = this.getSemanaActual();
      const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
      const fin = document.getElementById("fechaFina")?.value || sem.fin;

      await this.cargarAsistencias(inicio, fin);

      if (document.getElementById("jornadasTable")) {
        await this.cargarJornadas();
      }
    }

    getDataTable(selector, order = [[1, "desc"]]) {
      try {
        const tbl = $(selector).DataTable({
          responsive: false,
          scrollX: true,
          autoWidth: false,
          order
        });
        tbl.clear();
        return tbl;
      } catch (e) {
        console.warn("No se pudo inicializar DataTable:", e);
        return null;
      }
    }

    async cargarAsistencias(fechaInicio, fechaFin) {
      const tableEl = document.getElementById("asistenciasTable");
      if (!tableEl) return;

      const tbl = this.getDataTable("#asistenciasTable", [[1, "desc"]]);

      try {
        const asistencias = await this.model.getAsistencias({
          fechaInicio,
          fechaFin,
          empresaId: this.adminEmpresa || window.adminEmpresa || null,
          sucursalId: this.adminSucursal || window.adminSucursal || null
        });

        if (tbl) tbl.clear();

        asistencias.forEach(d => {
          const row = [
            this.escapeHtml(d.usuario_nombre || "Sin nombre"),
            d.fecha ? this.formatDateShort(d.fecha) : "---",
            `<span class="badge ${d.status === "Presente" ? "bg-success" : "bg-warning"}">${this.escapeHtml(d.status || "Pendiente")}</span>`,
            this.escapeHtml(d.entrada_time || d.entrada_raw || "--:--"),
            this.escapeHtml(d.salida_time || d.salida_raw || "--:--"),
            this.escapeHtml(d.justificacion || ""),
            `<div class="btn-group">
              <button class="btn btn-sm btn-outline-danger" onclick="eliminarAsistencia('${d.id}')">
                <i class="fas fa-trash"></i> Eliminar
              </button>
            </div>`
          ];

          if (tbl) tbl.row.add(row);
        });

        if (tbl) {
          tbl.draw();
        } else {
          const tbody = tableEl.querySelector("tbody");
          if (tbody) {
            tbody.innerHTML = "";
            asistencias.forEach(d => {
              const tr = document.createElement("tr");
              tr.innerHTML = `
                <td>${this.escapeHtml(d.usuario_nombre || "Sin nombre")}</td>
                <td>${d.fecha ? this.formatDateShort(d.fecha) : "---"}</td>
                <td><span class="badge ${d.status === "Presente" ? "bg-success" : "bg-warning"}">${this.escapeHtml(d.status || "Pendiente")}</span></td>
                <td>${this.escapeHtml(d.entrada_time || d.entrada_raw || "--:--")}</td>
                <td>${this.escapeHtml(d.salida_time || d.salida_raw || "--:--")}</td>
                <td>${this.escapeHtml(d.justificacion || "")}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-sm btn-outline-danger" onclick="eliminarAsistencia('${d.id}')">
                      <i class="fas fa-trash"></i> Eliminar
                    </button>
                  </div>
                </td>
              `;
              tbody.appendChild(tr);
            });
          }
        }
      } catch (err) {
        console.error("Error cargando asistencias:", err);
        alert("No se pudieron cargar las asistencias.");
      }
    }

    async consentirSinEntrada(id) {
      try {
        await this.model.consentirEntrada(id);
        alert("Entrada consentida");
        const sem = this.getSemanaActual();
        const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
        const fin = document.getElementById("fechaFina")?.value || sem.fin;
        await this.cargarAsistencias(inicio, fin);
      } catch (err) {
        console.error("consentirSinEntrada error:", err);
        alert("Error al consentir entrada: " + (err.message || String(err)));
      }
    }

    async consentirSinSalida(id) {
      try {
        await this.model.consentirSalida(id);
        alert("Salida consentida");
        const sem = this.getSemanaActual();
        const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
        const fin = document.getElementById("fechaFina")?.value || sem.fin;
        await this.cargarAsistencias(inicio, fin);
      } catch (err) {
        console.error("consentirSinSalida error:", err);
        alert("Error al consentir salida: " + (err.message || String(err)));
      }
    }

    async eliminarAsistencia(id) {
      if (!confirm("¿Eliminar asistencia?")) return;

      try {
        await this.model.deleteAsistencia(id);
        const sem = this.getSemanaActual();
        const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
        const fin = document.getElementById("fechaFina")?.value || sem.fin;
        await this.cargarAsistencias(inicio, fin);
      } catch (e) {
        console.error("eliminarAsistencia error:", e);
        alert("Error al eliminar asistencia: " + (e.message || String(e)));
      }
    }

    async cargarJornadas() {
      const tableEl = document.getElementById("jornadasTable");
      if (!tableEl) return;

      const tbl = this.getDataTable("#jornadasTable", [[0, "asc"]]);

      try {
        const jornadas = await this.model.getJornadas({
          empresaId: this.adminEmpresa || window.adminEmpresa || null,
          sucursalId: this.adminSucursal || window.adminSucursal || null
        });

        if (tbl) tbl.clear();

        jornadas.forEach(j => {
          const row = [
            this.escapeHtml(j.nombre || ""),
            this.escapeHtml(j.hora_entrada || j.horaEntrada || "--:--"),
            this.escapeHtml(j.hora_salida || j.horaSalida || "--:--"),
            `<button onclick="editarJornada('${j.id}')" style="background-color:green;color:#fff;border:none;padding:6px 8px;border-radius:4px;margin-right:6px;">Editar</button>
             <button onclick="eliminarJornada('${j.id}')" style="background-color:red;color:#fff;border:none;padding:6px 8px;border-radius:4px;">Eliminar</button>`
          ];

          if (tbl) tbl.row.add(row);
          else {
            const tbody = tableEl.querySelector("tbody");
            if (tbody) {
              const tr = document.createElement("tr");
              tr.innerHTML = row.map(c => `<td>${c}</td>`).join("");
              tbody.appendChild(tr);
            }
          }
        });

        if (tbl) tbl.draw();
      } catch (e) {
        console.error("Error cargando jornadas:", e);
        alert("Error cargando jornadas: " + (e.message || String(e)));
      }
    }

    async editarJornada(id) {
      try {
        const data = await this.model.getJornadaById(id);
        if (!data) return alert("Jornada no encontrada");

        const setIf = (idEl, val) => {
          const el = document.getElementById(idEl);
          if (el) el.value = val || "";
        };

        setIf("jornada-nombre", data.nombre);
        setIf("jornada-hora-entrada", data.hora_entrada || data.horaEntrada);
        setIf("jornada-hora-salida", data.hora_salida || data.horaSalida);

        this.currentEditingJornadaId = id;
      } catch (e) {
        console.error("editarJornada error:", e);
        alert("Error al cargar jornada: " + (e.message || String(e)));
      }
    }

    async eliminarJornada(id) {
      if (!confirm("¿Eliminar jornada?")) return;

      try {
        await this.model.deleteJornada(id);
        await this.cargarJornadas();
      } catch (e) {
        console.error("eliminarJornada error:", e);
        alert("Error eliminando jornada: " + (e.message || String(e)));
      }
    }

    async cargarJornadasEnSelect(selected = []) {
      const sel = document.getElementById("empleado-jornada");
      if (!sel) return;

      sel.innerHTML = "";

      try {
        const jornadas = await this.model.getJornadas({
          empresaId: this.adminEmpresa || window.adminEmpresa || null,
          sucursalId: this.adminSucursal || window.adminSucursal || null
        });

        jornadas.forEach(j => {
          const opt = document.createElement("option");
          opt.value = j.id;
          opt.textContent = `${j.nombre} (${j.hora_entrada || j.horaEntrada || "00:00"}-${j.hora_salida || j.horaSalida || "00:00"})`;
          if (selected.includes(j.id)) opt.selected = true;
          sel.appendChild(opt);
        });
      } catch (e) {
        console.error("Error cargando jornadas en select:", e);
      }
    }

    async safeSignOutAndRedirect(reason = "logout") {
      try {
        console.log(`[AdminAsistenciasController] Cerrando sesión (${reason})`);

        if (window.AuthModel?.signOut) {
          await window.AuthModel.signOut({ redirect: false });
        } else if (window.supabase?.auth?.signOut) {
          await window.supabase.auth.signOut({ scope: "local" });
        } else if (typeof window.logout === "function") {
          await window.logout();
        }
      } catch (e) {
        console.error(`[AdminAsistenciasController] Error al cerrar sesión (${reason}):`, e);
      } finally {
        window.location.replace("index.html");
      }
    }

    async guardarJornada() {
      const jornada = {
        nombre: document.getElementById("jornada-nombre")?.value || "",
        hora_entrada: document.getElementById("jornada-hora-entrada")?.value || "",
        hora_salida: document.getElementById("jornada-hora-salida")?.value || "",
        sucursal_id: this.adminSucursal || null
      };

      try {
        await this.model.saveJornada(jornada, this.currentEditingJornadaId);
        this.currentEditingJornadaId = null;

        const jornadaForm = document.getElementById("jornada-form");
        if (jornadaForm) jornadaForm.reset();

        await this.cargarJornadas();
      } catch (err) {
        console.error("Error guardando jornada:", err);
        alert("Error guardando jornada: " + (err.message || String(err)));
      }
    }
  }

  global.AdminAsistenciasController = AdminAsistenciasController;

  document.addEventListener("DOMContentLoaded", () => {
    const supabaseClient = window.supabase;
    if (!supabaseClient) {
      console.warn("Supabase no inicializado.");
      return;
    }

    const model = new AdminAsistenciasModel(supabaseClient);
    const controller = new AdminAsistenciasController(model);
    controller.init();
  });
})(window);