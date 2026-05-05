//js/controllers/admin.asistencias_jornadas.controllers.js
(function () {
  const supabase = window.supabase;
  const Model = window.JornadasModel;

  if (!supabase) console.warn("Supabase no inicializado en admin.asistencias_jornadas.controller.js");
  if (!Model) console.warn("JornadasModel no disponible");

  window.adminEmpresa = window.adminEmpresa || "";
  window.adminSucursal = window.adminSucursal || "";
  window.adminEmpresaNombre = window.adminEmpresaNombre || "";
  window.currentEditingJornadaId = null;

  function obtenerSemanaActual() {
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

  function sanitizeFileName(name) {
    if (!name) return "empresa";
    return String(name)
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");
  }

  function escapeHtml(str) {
    if (str === null || typeof str === "undefined") return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDateShort(d) {
    if (!d) return "";
    try {
      const date = new Date(d);
      if (isNaN(date)) return String(d);
      return date.toLocaleDateString();
    } catch (e) {
      return String(d);
    }
  }

  function setIf(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  }

  function setDefaultDates() {
    const sem = obtenerSemanaActual();

    const fechaInicioA = document.getElementById("fechaInicioa");
    const fechaFina = document.getElementById("fechaFina");
    const fechaInicio = document.getElementById("fechaInicio");
    const fechaFin = document.getElementById("fechaFin");

    if (fechaInicioA && !fechaInicioA.value) fechaInicioA.value = sem.inicio;
    if (fechaFina && !fechaFina.value) fechaFina.value = sem.fin;
    if (fechaInicio && !fechaInicio.value) fechaInicio.value = sem.inicio;
    if (fechaFin && !fechaFin.value) fechaFin.value = sem.fin;
  }

  function getCtx() {
    return {
      empresaId: window.adminEmpresa || null,
      sucursalId: window.adminSucursal || null
    };
  }

  function getOrCreateDataTable(selector) {
    if (!window.$ || !$.fn || !$.fn.DataTable) return null;

    try {
      if ($.fn.dataTable.isDataTable(selector)) {
        return $(selector).DataTable();
      }
      return $(selector).DataTable({
        destroy: true,
        scrollX: true
      });
    } catch (e) {
      console.warn("No se pudo inicializar DataTable:", e);
      return null;
    }
  }

  function limpiarTablaManual(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const tbody = table.querySelector("tbody");
    if (tbody) tbody.innerHTML = "";
  }

  function renderJornadas(rows) {
    const table = document.getElementById("jornadasTable");
    if (!table) return;

    const dt = getOrCreateDataTable("#jornadasTable");

    if (dt) {
      dt.clear();
      rows.forEach(j => {
        dt.row.add([
          escapeHtml(j.nombre),
          escapeHtml(j.horaEntrada || j.hora_entrada || "--:--"),
          escapeHtml(j.horaSalida || j.hora_salida || "--:--"),
          `<button onclick="editarJornada('${j.id}')" class="btn btn-success btn-inline">Editar</button>
           <button onclick="eliminarJornada('${j.id}')" class="btn btn-danger btn-inline">Eliminar</button>`
        ]);
      });
      dt.draw();
      return;
    }

    limpiarTablaManual("jornadasTable");
    const tbody = table.querySelector("tbody");
    rows.forEach(j => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(j.nombre)}</td>
        <td>${escapeHtml(j.horaEntrada || j.hora_entrada || "--:--")}</td>
        <td>${escapeHtml(j.horaSalida || j.hora_salida || "--:--")}</td>
        <td>
          <button onclick="editarJornada('${j.id}')" class="btn btn-success btn-inline">Editar</button>
          <button onclick="eliminarJornada('${j.id}')" class="btn btn-danger btn-inline">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderAsistencias(rows) {
    const table = document.getElementById("asistenciasTable");
    if (!table) return;

    const dt = getOrCreateDataTable("#asistenciasTable");

    if (dt) {
      dt.clear();
      rows.forEach(d => {
        dt.row.add([
          escapeHtml(d.usuario_nombre || "Sin nombre"),
          d.fecha ? formatDateShort(d.fecha) : "---",
          `<span class="badge ${d.status === "Presente" ? "badge-success" : "badge-warning"}">${escapeHtml(d.status || "Pendiente")}</span>`,
          escapeHtml(d.entrada_time || d.entrada_raw || "--:--"),
          escapeHtml(d.salida_time || d.salida_raw || "--:--"),
          escapeHtml(d.justificacion || ""),
          `<div class="actions-cell">
            <button class="btn btn-outline btn-inline" onclick="consentirSinEntrada('${d.id}')">
              <i class="fas fa-sign-in-alt"></i> Consentir entrada
            </button>
            <button class="btn btn-outline btn-inline" onclick="consentirSinSalida('${d.id}')">
              <i class="fas fa-sign-out-alt"></i> Consentir salida
            </button>
            <button class="btn btn-danger btn-inline" onclick="eliminarAsistencia('${d.id}')">
              <i class="fas fa-trash"></i> Eliminar
            </button>
          </div>`
        ]);
      });
      dt.draw();
      return;
    }

    limpiarTablaManual("asistenciasTable");
    const tbody = table.querySelector("tbody");
    rows.forEach(d => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(d.usuario_nombre || "Sin nombre")}</td>
        <td>${d.fecha ? formatDateShort(d.fecha) : "---"}</td>
        <td><span>${escapeHtml(d.status || "Pendiente")}</span></td>
        <td>${escapeHtml(d.entrada_time || d.entrada_raw || "--:--")}</td>
        <td>${escapeHtml(d.salida_time || d.salida_raw || "--:--")}</td>
        <td>${escapeHtml(d.justificacion || "")}</td>
        <td>
          <button onclick="consentirSinEntrada('${d.id}')" class="btn btn-outline btn-inline">Consentir entrada</button>
          <button onclick="consentirSinSalida('${d.id}')" class="btn btn-outline btn-inline">Consentir salida</button>
          <button onclick="eliminarAsistencia('${d.id}')" class="btn btn-danger btn-inline">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function cargarJornadas() {
    try {
      const rows = await Model.getJornadas(getCtx());
      renderJornadas(rows);
    } catch (err) {
      console.error("Error cargando jornadas:", err);
      alert("Error cargando jornadas: " + (err.message || String(err)));
    }
  }

  async function cargarAsistencias(fechaInicio, fechaFin) {
    const tableEl = document.getElementById("asistenciasTable");
    if (!tableEl) return;

    try {
      const rows = await Model.getAsistencias(fechaInicio, fechaFin, getCtx());
      renderAsistencias(rows);
    } catch (err) {
      console.error("Error cargando asistencias:", err);
      alert("No se pudieron cargar las asistencias.");
    }
  }

  async function guardarJornadaDesdeFormulario() {
    const payload = {
      nombre: document.getElementById("jornada-nombre")?.value || "",
      horaEntrada: document.getElementById("jornada-hora-entrada")?.value || "",
      horaSalida: document.getElementById("jornada-hora-salida")?.value || "",
      sucursal_id: window.adminSucursal || null
    };

    await Model.saveJornada(payload, window.currentEditingJornadaId);
    window.currentEditingJornadaId = null;

    const form = document.getElementById("jornada-form");
    if (form) form.reset();

    await cargarJornadas();
  }

  async function editarJornada(id) {
    try {
      const data = await Model.getJornadaById(id);
      if (!data) return alert("Jornada no encontrada");

      setIf("jornada-nombre", data.nombre);
      setIf("jornada-hora-entrada", data.hora_entrada || data.horaEntrada);
      setIf("jornada-hora-salida", data.hora_salida || data.horaSalida);

      window.currentEditingJornadaId = id;
    } catch (e) {
      console.error("editarJornada error:", e);
      alert("Error al cargar jornada: " + (e.message || String(e)));
    }
  }

  async function eliminarJornada(id) {
    if (!confirm("¿Eliminar jornada?")) return;

    try {
      await Model.deleteJornada(id);
      await cargarJornadas();
    } catch (e) {
      console.error("eliminarJornada error:", e);
      alert("Error eliminando jornada: " + (e.message || String(e)));
    }
  }

  async function eliminarAsistencia(id) {
    if (!confirm("¿Eliminar asistencia?")) return;

    try {
      await Model.deleteAsistencia(id);
      const sem = obtenerSemanaActual();
      const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
      const fin = document.getElementById("fechaFina")?.value || sem.fin;
      await cargarAsistencias(inicio, fin);
    } catch (e) {
      console.error("eliminarAsistencia error:", e);
      alert("Error al eliminar asistencia: " + (e.message || String(e)));
    }
  }

  async function consentirSinEntrada(id) {
    try {
      await Model.consentirSinEntrada(id);
      alert("Entrada consentida");

      const sem = obtenerSemanaActual();
      const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
      const fin = document.getElementById("fechaFina")?.value || sem.fin;
      await cargarAsistencias(inicio, fin);
    } catch (err) {
      console.error("consentirSinEntrada error:", err);
      alert("Error al consentir entrada: " + (err.message || String(err)));
    }
  }

  async function consentirSinSalida(id) {
    try {
      await Model.consentirSinSalida(id);
      alert("Salida consentida");

      const sem = obtenerSemanaActual();
      const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
      const fin = document.getElementById("fechaFina")?.value || sem.fin;
      await cargarAsistencias(inicio, fin);
    } catch (err) {
      console.error("consentirSinSalida error:", err);
      alert("Error al consentir salida: " + (err.message || String(err)));
    }
  }

  async function cargarJornadasEnSelect(selected = []) {
    const sel = document.getElementById("empleado-jornada");
    if (!sel) return;

    sel.innerHTML = "";

    try {
      const jornadas = await Model.getJornadas(getCtx());

      jornadas.forEach(j => {
        const opt = document.createElement("option");
        opt.value = j.id;
        opt.textContent = `${j.nombre} (${j.horaEntrada || j.hora_entrada || "00:00"}-${j.horaSalida || j.hora_salida || "00:00"})`;
        if (selected.includes(j.id)) opt.selected = true;
        sel.appendChild(opt);
      });
    } catch (e) {
      console.error("Error cargando jornadas en select:", e);
    }
  }

  async function loadAdminContext() {
    const session = typeof window.AuthModel?.getSessionData === "function"
      ? await window.AuthModel.getSessionData()
      : null;

    if (!session) {
      await safeLogout("no-session");
      return false;
    }

    if (!supabase) return true;

    try {
      const { data: userData, error } = await supabase
        .from("v_usuarios")
        .select("*")
        .eq("id", session.uid)
        .maybeSingle();

      if (error) {
        console.error("Error cargando usuario:", error);
        return false;
      }

      if (!userData) {
        alert("No se encontró el usuario.");
        await safeLogout("user-not-found");
        return false;
      }

      if ((userData.role || "").toString().toLowerCase() !== "admin") {
        alert("No tienes permisos de administrador.");
        await safeLogout("not-admin");
        return false;
      }

      window.adminEmpresa =
        (userData.empresa_id || userData.sucursal_empresa_id || userData.empresa || "") + "";

      window.adminSucursal =
        (userData.sucursal_id || userData.sucursal || "") + "";

      if (window.adminEmpresa) {
        try {
          const { data: emp } = await supabase
            .from("empresa")
            .select("nombre")
            .eq("id", window.adminEmpresa)
            .maybeSingle();

          if (emp && emp.nombre) window.adminEmpresaNombre = emp.nombre;
        } catch (e) {
          console.warn("No se pudo obtener nombre de empresa:", e);
        }
      }

      return true;
    } catch (e) {
      console.error("Error en loadAdminContext:", e);
      return false;
    }
  }

  async function safeLogout(reason = "logout") {
    try {
      console.log(`[admin.asistencias_jornadas] Cerrando sesión (${reason})`);

      if (window.AuthModel?.signOut) {
        await window.AuthModel.signOut({ redirect: false });
      } else if (window.supabase?.auth?.signOut) {
        await window.supabase.auth.signOut({ scope: "local" });
      }
    } catch (e) {
      console.error("safeLogout error:", e);
    } finally {
      window.location.replace("index.html");
    }
  }

  function closeMobileMenu() {
    const navLinks = document.getElementById("navbar-links");
    if (!navLinks) return;
    navLinks.classList.remove("active");
    navLinks.classList.remove("menu-open");
    document.body.classList.remove("menu-open-active");
  }

  function toggleMobileMenu() {
    const navLinks = document.getElementById("navbar-links");
    if (!navLinks) return;

    const isOpen = navLinks.classList.contains("active") || navLinks.classList.contains("menu-open");
    navLinks.classList.toggle("active", !isOpen);
    navLinks.classList.toggle("menu-open", !isOpen);
    document.body.classList.toggle("menu-open-active", !isOpen);
  }

  function setupMenuToggle() {
    const menuToggle = document.getElementById("menu-toggle");
    const navLinks = document.getElementById("navbar-links");

    if (!menuToggle || !navLinks) return;

    menuToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMobileMenu();
    });

    navLinks.querySelectorAll("a, button").forEach(item => {
      item.addEventListener("click", () => {
        closeMobileMenu();
      });
    });

    document.addEventListener("click", (e) => {
      if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
        closeMobileMenu();
      }
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        closeMobileMenu();
      }
    });
  }

  function setupUI() {
    const logoutBtn = document.getElementById("logout-button");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await safeLogout("logout-click");
      });
    }

    const btnQr = document.getElementById("btnDescargarQr");
    if (btnQr) {
      btnQr.addEventListener("click", async () => {
        const cont = document.getElementById("qr-container");
        if (!cont) return alert("Contenedor de QR no encontrado");

        cont.innerHTML = "";

        const text = window.adminEmpresaNombre || window.adminEmpresa || "";
        if (!text) return alert("No hay empresa asignada para generar QR.");

        try {
          if (typeof QRCode === "undefined") {
            return alert("QRCode no está disponible.");
          }

          new QRCode(cont, {
            text,
            width: 400,
            height: 400
          });
        } catch (e) {
          console.error("Error generando QR:", e);
          return alert("Error generando QR");
        }

        setTimeout(() => {
          let href = null;
          const img = cont.querySelector("img");
          if (img && img.src) href = img.src;
          else {
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
          a.download = sanitizeFileName(window.adminEmpresaNombre || window.adminEmpresa) + ".png";
          document.body.appendChild(a);
          a.click();
          a.remove();

          cont.innerHTML = "";
        }, 150);
      });
    }

    const form = document.getElementById("jornada-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        try {
          await guardarJornadaDesdeFormulario();
        } catch (err) {
          console.error("Error guardando jornada:", err);
          alert("Error guardando jornada: " + (err.message || String(err)));
        }
      });
    }

    const filtrarA = document.getElementById("filtrarA");
    if (filtrarA) {
      filtrarA.addEventListener("click", async () => {
        const inicio = document.getElementById("fechaInicioa")?.value || "";
        const fin = document.getElementById("fechaFina")?.value || "";

        if (!inicio || !fin) {
          alert("Selecciona ambas fechas para filtrar");
          return;
        }

        try {
          filtrarA.disabled = true;
          await cargarAsistencias(inicio, fin);
        } catch (e) {
          console.error("Error al filtrar asistencias:", e);
        } finally {
          filtrarA.disabled = false;
        }
      });
    }

    const filtrarPlanillaBtn = document.getElementById("filtrar");
    if (filtrarPlanillaBtn) {
      filtrarPlanillaBtn.addEventListener("click", () => {
        const inicio = document.getElementById("fechaInicio")?.value || "";
        const fin = document.getElementById("fechaFin")?.value || "";

        if (!inicio || !fin) {
          alert("Selecciona ambas fechas para filtrar la planilla");
          return;
        }

        if (typeof window.mostrarPlanilla === "function") {
          filtrarPlanillaBtn.disabled = true;
          Promise.resolve(window.mostrarPlanilla()).finally(() => {
            filtrarPlanillaBtn.disabled = false;
          });
        }
      });
    }
  }

  async function init() {
    try {
      const ok = await loadAdminContext();
      if (!ok) return;

      setDefaultDates();
      setupMenuToggle();
      setupUI();

      const bodyPage = (document.body?.dataset?.page || "").toLowerCase();

      if (bodyPage === "jornadas" || document.getElementById("jornadasTable")) {
        await cargarJornadas();
      }

      if (document.getElementById("asistenciasTable")) {
        const sem = obtenerSemanaActual();
        const inicio = document.getElementById("fechaInicioa")?.value || sem.inicio;
        const fin = document.getElementById("fechaFina")?.value || sem.fin;
        await cargarAsistencias(inicio, fin);
      }

      window.cargarAsistencias = cargarAsistencias;
      window.cargarJornadas = cargarJornadas;
      window.editarJornada = editarJornada;
      window.eliminarJornada = eliminarJornada;
      window.eliminarAsistencia = eliminarAsistencia;
      window.consentirSinEntrada = consentirSinEntrada;
      window.consentirSinSalida = consentirSinSalida;
      window.cargarJornadasEnSelect = cargarJornadasEnSelect;
      window.obtenerSemanaActual = obtenerSemanaActual;
    } catch (err) {
      console.error("Error inicializando controller:", err);
      await safeLogout("init-error");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();