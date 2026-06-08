// js/controllers/admin.planilla.controller.js
(function (global) {
  let initialized = false;
  let retryCount = 0;
  const MAX_RETRIES = 100;
  const RETRY_DELAY_MS = 100;

  function getModel() {
    return global.PlanillaModel || null;
  }

  function getAuth() {
    return global.AuthModel || null;
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function getFechaInicio() {
    const model = getModel();
    return getEl("fechaInicio")?.value || model?.obtenerSemanaActual().inicio;
  }

  function getFechaFin() {
    const model = getModel();
    return getEl("fechaFin")?.value || model?.obtenerSemanaActual().fin;
  }

  function getAplicarNocturno() {
    return !!getEl("aplicar-nocturno")?.checked;
  }

  function formatMoney(value) {
    return `$${Number(value || 0).toFixed(2)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseMoneyInput(value) {
    const n = Number(String(value || "0").replace(",", "."));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }

  async function editarAjustesPlanilla(uid, nombre) {
    const model = getModel();
    if (!model || !uid) return;

    const inicio = getFechaInicio();
    const fin = getFechaFin();
    const current = model.getPayrollAdjustment
      ? model.getPayrollAdjustment(inicio, fin, uid)
      : { bonificacion: 0, ayudaEconomica: 0, nota: "" };

    const bonificacion = prompt(
      `Bonificación gravada para ${nombre}`,
      Number(current.bonificacion || 0).toFixed(2)
    );
    if (bonificacion === null) return;

    const ayudaEconomica = prompt(
      `Ayuda económica no gravada para ${nombre}`,
      Number(current.ayudaEconomica || 0).toFixed(2)
    );
    if (ayudaEconomica === null) return;

    const nota = prompt(
      `Nota de ajuste para ${nombre}`,
      current.nota || ""
    );
    if (nota === null) return;

    model.setPayrollAdjustment(inicio, fin, uid, {
      bonificacion: parseMoneyInput(bonificacion),
      ayudaEconomica: parseMoneyInput(ayudaEconomica),
      nota
    });

    await calcularPlanillaSemanal(
      inicio,
      fin,
      getAplicarNocturno(),
      global.__planillaCache?.jornadasMap || null
    );
  }

  function ocultarSecciones() {
    const ids = [
      "perfil-container",
      "empleado-container",
      "tabla-empleados",
      "tabla-asistencias",
      "planilla-container",
      "jornadas-container"
    ];

    ids.forEach((id) => {
      const el = getEl(id);
      if (el) el.style.display = "none";
    });
  }

  function mostrarPlanillaContainer() {
    const cont = getEl("planilla-container");
    if (cont) cont.style.display = "block";
  }

  function renderPlanillaLegacy(rows = []) {
    const tbody = document.querySelector("#planillaTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="16" style="text-align:center;">No hay datos para mostrar</td>`;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.nombre ?? "—"}</td>
        <td>${Number(r.horasNormales || 0).toFixed(2)}</td>
        <td>${Number(r.horasExtras || 0).toFixed(2)}</td>
        <td>${Number(r.totalHoras || 0).toFixed(2)}</td>
        <td>$${Number(r.totalBruto || 0).toFixed(2)}</td>
        <td>$${Number(r.isss || 0).toFixed(2)}</td>
        <td>$${Number(r.afp || 0).toFixed(2)}</td>
        <td>$${Number(r.totalNeto || 0).toFixed(2)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderPlanilla(rows = []) {
    const tbody = document.querySelector("#planillaTable tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="16" style="text-align:center;">No hay datos para mostrar</td>`;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      const noteTitle = r.ajusteNota ? ` title="${escapeHtml(r.ajusteNota)}"` : "";

      tr.innerHTML = `
        <td${noteTitle}>${escapeHtml(r.nombre || "-")}</td>
        <td>${formatMoney(r.salarioHora)}</td>
        <td>${Number(r.horasNormales || 0).toFixed(2)}</td>
        <td>${Number(r.horasExtras || 0).toFixed(2)}</td>
        <td>${Number(r.totalHoras || 0).toFixed(2)}</td>
        <td>${formatMoney(r.salarioBase)}</td>
        <td>${formatMoney(r.pagoHorasExtras)}</td>
        <td>${formatMoney(r.bonificacion)}</td>
        <td>${formatMoney(r.ayudaEconomica)}</td>
        <td>${formatMoney(r.totalBruto)}</td>
        <td>${formatMoney(r.isss)}</td>
        <td>${formatMoney(r.afp)}</td>
        <td>${formatMoney(r.renta)}</td>
        <td>${formatMoney(r.deducciones)}</td>
        <td>${formatMoney(r.totalNeto)}</td>
        <td><button type="button" class="btn-outline planilla-ajuste-btn" data-uid="${escapeHtml(r.uid)}">Ajustar</button></td>
      `;

      const btn = tr.querySelector(".planilla-ajuste-btn");
      if (btn) {
        btn.addEventListener("click", () => editarAjustesPlanilla(r.uid, r.nombre || "-"));
      }

      tbody.appendChild(tr);
    });
  }

  async function calcularPlanillaSemanal(fechaInicio, fechaFin, aplicarNocturno = false, jornadasMap = null) {
    const model = getModel();
    if (!model) {
      console.error("PlanillaModel no está disponible.");
      renderPlanilla([]);
      return [];
    }

    try {
      const resultado = await model.calcularPlanillaSemanalData(
        fechaInicio,
        fechaFin,
        aplicarNocturno,
        jornadasMap
      );

      global.__planillaCache = resultado;
      renderPlanilla(resultado.rows || []);
      return resultado.rows || [];
    } catch (e) {
      console.error("Error calculando planilla:", e);
      alert("Error calculando planilla: " + (e.message || e));
      renderPlanilla([]);
      return [];
    }
  }

  async function cerrarSesionYRedirigir(origen = "planilla") {
    try {
      console.log(`[PlanillaController] Cerrando sesión (${origen})`);

      const auth = getAuth();

      if (typeof global.logout === "function") {
        await global.logout();
        return;
      }

      if (auth?.signOut) {
        await auth.signOut();
        window.location.replace("index.html");
        return;
      }

      window.location.replace("index.html");
    } catch (e) {
      console.error(`[PlanillaController] Error cerrando sesión (${origen}):`, e);
      window.location.replace("index.html");
    }
  }

  async function mostrarPlanilla() {
    const model = getModel();
    if (!model) {
      console.error("PlanillaModel no está disponible.");
      return [];
    }

    ocultarSecciones();
    mostrarPlanillaContainer();

    const inicio = getFechaInicio();
    const fin = getFechaFin();
    const chk = getEl("aplicar-nocturno");

    const jornadasMap = await model.cargarJornadasMap();
    const aplicarAuto = await model.hayNocturnasEnPeriodo(jornadasMap, inicio, fin);

    if (chk) {
      chk.checked = aplicarAuto;
      chk.onchange = () => {
        calcularPlanillaSemanal(inicio, fin, chk.checked, jornadasMap);
      };
    }

    return calcularPlanillaSemanal(inicio, fin, chk ? chk.checked : false, jornadasMap);
  }

  function imprimirPlanilla() {
    const cont = getEl("planilla-container");
    const contenido = cont ? cont.innerHTML : "";

    const w = window.open("", "", "width=800,height=600");
    if (!w) {
      alert("El navegador bloqueó la ventana de impresión.");
      return;
    }

    w.document.write(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Imprimir Planilla</title>
          <link rel="stylesheet" href="css/admin.css">
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
            th { background: #007bff; color: #fff; }
          </style>
        </head>
        <body>${contenido}</body>
      </html>
    `);

    w.document.close();
    w.focus();
    w.print();
    w.close();
  }

  async function descargarExcel() {
    if (typeof XLSX === "undefined") {
      alert("La librería XLSX no está cargada.");
      return;
    }

    const model = getModel();
    if (!model) {
      alert("PlanillaModel no está disponible.");
      return;
    }

    try {
      const inicio = getFechaInicio();
      const fin = getFechaFin();
      const aplicarNocturno = getAplicarNocturno();

      const data = global.__planillaCache || await model.calcularPlanillaSemanalData(inicio, fin, aplicarNocturno);
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.rows || []), "Planilla");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(data.empleados || {})), "Usuarios");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.asistencias || []), "Asistencias");

      XLSX.writeFile(wb, `Planilla_${model.sanitizeFileName(global.adminEmpresa || "reporte")}.xlsx`);
    } catch (e) {
      console.error("Error exportando Excel:", e);
      alert("Error al exportar Excel: " + (e.message || e));
    }
  }

  function sanitizeFileName(name) {
    const model = getModel();
    return model ? model.sanitizeFileName(name) : String(name || "empresa");
  }

  async function obtenerContextoSesion() {
    const auth = getAuth();

    if (auth && typeof auth.getSessionData === "function") {
      const session = await auth.getSessionData();
      if (session) return session;
    }

    const supabase = global.supabase;
    if (!supabase?.auth?.getUser) return null;

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn("No se pudo obtener usuario autenticado:", error);
    }

    const user = data?.user || null;
    if (!user) return null;

    return {
      uid: user.id,
      email: user.email || null,
      app_metadata: user.app_metadata || {},
      user_metadata: user.user_metadata || {}
    };
  }

  async function inicializarSesionYDatos() {
    const model = getModel();
    if (!model) {
      console.error("PlanillaModel no está disponible.");
      return;
    }

    try {
      const session = await obtenerContextoSesion();

      if (!session?.uid) {
        await cerrarSesionYRedirigir("sin-sesion");
        return;
      }

      const profile = await model.getCurrentUserProfile(session.uid);

      const role = String(
        profile?.role ||
        session?.app_metadata?.role ||
        session?.user_metadata?.role ||
        ""
      ).toLowerCase();

      if (role !== "admin") {
        alert("No tienes permisos de administrador.");
        await cerrarSesionYRedirigir("rol-no-admin");
        return;
      }

      global.adminEmpresa =
        profile?.empresa_id ||
        session?.app_metadata?.empresa_id ||
        session?.user_metadata?.empresa_id ||
        "";

      global.adminSucursal =
        profile?.sucursal_id ||
        session?.app_metadata?.sucursal_id ||
        session?.user_metadata?.sucursal_id ||
        "";

      global.adminEmpresaNombre =
        profile?.empresa_nombre ||
        session?.app_metadata?.empresa_nombre ||
        session?.user_metadata?.empresa_nombre ||
        global.adminEmpresaNombre ||
        "";

      if (!global.adminEmpresaNombre && global.adminEmpresa && global.supabase) {
        try {
          const { data: emp } = await global.supabase
            .from("empresa")
            .select("nombre")
            .eq("id", global.adminEmpresa)
            .maybeSingle();

          if (emp && emp.nombre) global.adminEmpresaNombre = emp.nombre;
        } catch (e) {
          console.warn("No se pudo obtener nombre de empresa:", e);
        }
      }

      const PAGE = (document.body && document.body.dataset && document.body.dataset.page)
        ? document.body.dataset.page.trim().toLowerCase()
        : "planilla";

      if (PAGE === "planilla") {
        await mostrarPlanilla();
      }
    } catch (e) {
      console.error("Error cargando datos de sesión:", e);
      await cerrarSesionYRedirigir("error-cargando-sesion");
    }
  }

  function bindLogout() {
    const logoutBtn = getEl("logout-button");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await cerrarSesionYRedirigir("boton-logout");
    });
  }

  function bindQrButton() {
    const btnQr = getEl("btnDescargarQr");
    if (!btnQr) return;

    btnQr.addEventListener("click", async () => {
      const cont = getEl("qr-container");
      if (!cont) return alert("Contenedor de QR no encontrado");

      cont.innerHTML = "";

      const text = global.adminEmpresaNombre || global.adminEmpresa || "";
      if (!text) return alert("No hay empresa asignada para generar QR.");

      try {
        if (typeof QRCode === "undefined") {
          return alert("QRCode no está disponible.");
        }

        new QRCode(cont, { text: text, width: 400, height: 400 });
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
          if (canvas && typeof canvas.toDataURL === "function") href = canvas.toDataURL("image/png");
        }

        if (!href) {
          cont.innerHTML = "";
          return alert("No se pudo generar imagen del QR");
        }

        const a = document.createElement("a");
        a.href = href;
        a.download = sanitizeFileName(global.adminEmpresaNombre || global.adminEmpresa) + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();

        cont.innerHTML = "";
      }, 150);
    });
  }

  function bindHamburgerMenu() {
    const menuToggle = getEl("menu-toggle");
    const navLinks = getEl("navbar-links");

    if (menuToggle && navLinks) {
      menuToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        navLinks.classList.toggle("active");
      });

      const itemsMenu = navLinks.querySelectorAll("a, button");
      itemsMenu.forEach((item) => {
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
  }

  function setDefaultDates() {
    const model = getModel();
    if (!model) return;

    const sem = model.obtenerSemanaActual();

    const fechaInicio = getEl("fechaInicio");
    const fechaFin = getEl("fechaFin");

    if (fechaInicio && !fechaInicio.value) fechaInicio.value = sem.inicio;
    if (fechaFin && !fechaFin.value) fechaFin.value = sem.fin;
  }

  function bindFiltrarBoton() {
    const filtrarPlanillaBtn = getEl("filtrar");
    if (!filtrarPlanillaBtn) return;

    filtrarPlanillaBtn.addEventListener("click", async () => {
      try {
        const inicio = getFechaInicio();
        const fin = getFechaFin();

        if (!inicio || !fin) {
          alert("Selecciona ambas fechas para filtrar la planilla");
          return;
        }

        filtrarPlanillaBtn.disabled = true;
        await calcularPlanillaSemanal(inicio, fin, getAplicarNocturno());
      } catch (e) {
        console.error("Error al filtrar planilla:", e);
        alert("Error al filtrar planilla");
      } finally {
        filtrarPlanillaBtn.disabled = false;
      }
    });
  }

  function bindDatesChange() {
    const fechaInicio = getEl("fechaInicio");
    const fechaFin = getEl("fechaFin");
    const chk = getEl("aplicar-nocturno");

    const recargar = async () => {
      const inicio = getFechaInicio();
      const fin = getFechaFin();
      if (inicio && fin) {
        await calcularPlanillaSemanal(inicio, fin, getAplicarNocturno());
      }
    };

    if (fechaInicio) fechaInicio.addEventListener("change", recargar);
    if (fechaFin) fechaFin.addEventListener("change", recargar);
    if (chk) chk.addEventListener("change", recargar);
  }

  function bindGlobalExports() {
    global.mostrarPlanilla = mostrarPlanilla;
    global.calcularPlanillaSemanal = calcularPlanillaSemanal;
    global.imprimirPlanilla = imprimirPlanilla;
    global.descargarExcel = descargarExcel;
  }

  async function init() {
    if (initialized) return;

    const model = getModel();
    if (!model) {
      if (retryCount < MAX_RETRIES) {
        retryCount += 1;
        setTimeout(init, RETRY_DELAY_MS);
        return;
      }

      console.error("PlanillaModel no está disponible después de esperar.");
      return;
    }

    initialized = true;

    try {
      bindGlobalExports();
      setDefaultDates();
      bindLogout();
      bindQrButton();
      bindHamburgerMenu();
      bindFiltrarBoton();
      bindDatesChange();
      await inicializarSesionYDatos();
    } catch (err) {
      console.error("Error inicializando planilla.controller.js:", err);
      await cerrarSesionYRedirigir("init-catch");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.PlanillaController = {
    renderPlanilla,
    calcularPlanillaSemanal,
    mostrarPlanilla,
    imprimirPlanilla,
    descargarExcel,
    init
  };
})(window);
