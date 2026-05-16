// js/controllers/dashboard.controller.js
document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const Auth = window.AuthModel;
  const Model = window.DashboardModel;
  const supabase = window.supabase;

  if (!Auth) {
    console.error("AuthModel no está disponible.");
    return;
  }

  if (!Model) {
    console.error("DashboardModel no está disponible.");
    return;
  }

  const logoutButtons = document.querySelectorAll(".logoutButton");
  const salesTableBody = document.querySelector("#salesTable tbody");
  const salesSearch = document.getElementById("salesSearch");
  const lowStockPanel = document.getElementById("lowStockPanel");
  const btnGoInventory = document.getElementById("btnGoInventory");
  const btnCloseDay = document.getElementById("btnCloseDay");
  const btnExportCSV = document.getElementById("btnExportCSV");
  const menuToggle = document.getElementById("menu-toggle");
  const navMenu = document.getElementById("navbar-links");

  const reportMonthSalesEl = document.getElementById("reportMonthSales");
  const reportMonthSalesMetaEl = document.getElementById("reportMonthSalesMeta");
  const reportTodaySalesEl = document.getElementById("reportTodaySales");
  const reportTodaySalesMetaEl = document.getElementById("reportTodaySalesMeta");
  const reportWeekSalesEl = document.getElementById("reportWeekSales");
  const reportWeekSalesMetaEl = document.getElementById("reportWeekSalesMeta");
  const reportProductsEl = document.getElementById("reportProducts");
  const reportProductsMetaEl = document.getElementById("reportProductsMeta");
  const reportLowStockEl = document.getElementById("reportLowStock");
  const reportLowStockMetaEl = document.getElementById("reportLowStockMeta");
  const reportAverageTicketEl = document.getElementById("reportAverageTicket");
  const reportAverageTicketMetaEl = document.getElementById("reportAverageTicketMeta");
  const reportTopSellerEl = document.getElementById("reportTopSeller");
  const reportTopSellerMetaEl = document.getElementById("reportTopSellerMeta");

  let cachedSales = [];
  let monthlySalesMap = {};
  let salesChart = null;

  const LOW_STOCK_THRESHOLD = 5;

  injectDashboardStyles();

  function numberOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"'`=\/]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
      "`": "&#x60;",
      "=": "&#x3D;"
    }[c]));
  }

  function formatCurrency(value) {
    const n = numberOrZero(value);
    try {
      return new Intl.NumberFormat("es-SV", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2
      }).format(n);
    } catch {
      return `$${n.toFixed(2)}`;
    }
  }

  function formatDate(value) {
    const d = Model.toDate(value);
    return d ? d.toLocaleString() : "—";
  }

  function formatShortDate(value) {
    const d = Model.toDate(value);
    return d ? d.toLocaleDateString() : "—";
  }

  function getSaleCustomerName(sale) {
    return sale?.cliente_nombre || sale?.usuario_nombre || sale?.usuario_id || "—";
  }

  function getUnitsPerBox(product) {
    const v = numberOrZero(product && (product.unitsPerBox || product.unidadesPorCaja));
    return v > 0 ? v : 1;
  }

  function getStockUnits(product) {
    return numberOrZero(product?.stock);
  }

  function getStockBoxes(product) {
    const unitsPerBox = getUnitsPerBox(product);
    const stockUnits = getStockUnits(product);
    return unitsPerBox > 0 ? stockUnits / unitsPerBox : 0;
  }

  function getProductUnitCost(product) {
    const price = numberOrZero(product?.precio);
    if (price > 0) return price * 0.7;
    return 0;
  }

  function getTodayWindow() {
    const start = Model.getTodayStart();
    const end = Model.getTomorrowStart();
    return { start, end };
  }

  function getMonthWindowLabel() {
    const now = new Date();
    return now.toLocaleString("es-SV", { month: "long", year: "numeric" });
  }

  function isMobileMenuOpen() {
    return !!navMenu && (navMenu.classList.contains("menu-open") || navMenu.classList.contains("active"));
  }

  function setMobileMenu(open) {
    if (!menuToggle || !navMenu) return;

    navMenu.classList.toggle("menu-open", open);
    navMenu.classList.toggle("active", open);

    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    menuToggle.innerHTML = open ? "&#10005;" : "&#9776;";

    document.body.classList.toggle("nav-open", open);
  }

  function toggleMobileMenu() {
    setMobileMenu(!isMobileMenuOpen());
  }

  function closeMobileMenu() {
    setMobileMenu(false);
  }

  async function safeLogout(reason = "manual") {
    try {
      console.warn("Cerrando sesión:", reason);

      if (Auth && typeof Auth.signOut === "function") {
        await Auth.signOut({ redirect: true });
      } else if (supabase?.auth?.signOut) {
        await supabase.auth.signOut();
        window.location.replace("index.html");
      }
    } catch (err) {
      console.error("Error en safeLogout:", err);
    }
  }

  async function loadGreeting(userId) {
    const profile = await Model.getCurrentUserProfile(userId);
    const session = typeof Auth.getSessionData === "function" ? await Auth.getSessionData() : null;

    const displayName =
      profile?.nombre ||
      session?.user_metadata?.nombre ||
      session?.app_metadata?.nombre ||
      session?.email ||
      "Usuario";

    const role = String(
      profile?.role ||
      session?.app_metadata?.role ||
      session?.user_metadata?.role ||
      "Empleado"
    );

    const greetingEls = document.querySelectorAll(".userGreeting");
    greetingEls.forEach(el => {
      el.textContent = `Hola, ${displayName} (${role})`;
    });
  }

  function renderSalesRows(rows) {
    if (!salesTableBody) return;

    salesTableBody.innerHTML = "";

    if (!rows.length) {
      salesTableBody.innerHTML = "<tr><td colspan='3'>No hay ventas para este mes</td></tr>";
      return;
    }

    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.customerName)}</td>
        <td>${formatCurrency(r.total)}</td>
        <td>${escapeHtml(r.dateStr)}</td>
      `;
      salesTableBody.appendChild(tr);
    });
  }

  async function loadAdminContext() {
    const session = typeof window.AuthModel?.getSessionData === "function"
      ? await window.AuthModel.getSessionData()
      : null;

    if (!session) {
      await safeLogout("no-session");
      return false;
    }

    if (!supabase) {
      console.error("Supabase no está inicializado.");
      return false;
    }

    try {
      const userId = session.uid || session.user?.id || session.id || null;
      const profile = userId ? await Model.getCurrentUserProfile(userId) : null;

      const role = String(
        profile?.role ||
        session?.app_metadata?.role ||
        session?.user_metadata?.role ||
        ""
      ).toLowerCase();

      if (role !== "admin") {
        alert("No tienes permisos de administrador.");
        await safeLogout("not-admin");
        return false;
      }

      window.adminEmpresa =
        profile?.empresa_id ||
        session?.app_metadata?.empresa_id ||
        session?.user_metadata?.empresa_id ||
        "";

      window.adminSucursal =
        profile?.sucursal_id ||
        session?.app_metadata?.sucursal_id ||
        session?.user_metadata?.sucursal_id ||
        "";

      window.adminEmpresaNombre =
        profile?.empresa_nombre ||
        session?.app_metadata?.empresa_nombre ||
        session?.user_metadata?.empresa_nombre ||
        window.adminEmpresaNombre ||
        "";

      if (!window.adminEmpresaNombre && window.adminEmpresa) {
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

  function applySalesFilter(term) {
    const q = String(term || "").toLowerCase().trim();

    if (!q) {
      renderSalesRows(cachedSales);
      return;
    }

    const filtered = cachedSales.filter(r =>
      String(r.customerName || "").toLowerCase().includes(q) ||
      String(r.total || "").includes(q) ||
      String(r.dateStr || "").toLowerCase().includes(q)
    );

    renderSalesRows(filtered);
  }

  function computeTopSellerFromMonthSales(monthSales) {
    const grouped = new Map();

    (monthSales || []).forEach(row => {
      const key = row.usuario_id || row.usuario_nombre || row.usuario_email;
      if (!key) return;

      const current = grouped.get(key) || {
        usuario_id: row.usuario_id || null,
        usuario_nombre: row.usuario_nombre || "Sin nombre",
        usuario_email: row.usuario_email || null,
        sucursal_nombre: row.sucursal_nombre || null,
        empresa_nombre: row.empresa_nombre || null,
        ventas_realizadas: 0,
        subtotal_vendido: 0,
        descuentos_totales: 0,
        impuestos_totales: 0,
        total_vendido: 0,
        ultima_venta: null
      };

      current.ventas_realizadas += 1;
      current.subtotal_vendido += numberOrZero(row.subtotal);
      current.descuentos_totales += numberOrZero(row.descuento);
      current.impuestos_totales += numberOrZero(row.impuesto);
      current.total_vendido += numberOrZero(row.total);

      const currentDate = row.created_at ? new Date(row.created_at) : null;
      const lastDate = current.ultima_venta ? new Date(current.ultima_venta) : null;
      if (currentDate && (!lastDate || currentDate > lastDate)) {
        current.ultima_venta = row.created_at;
      }

      if (!current.usuario_nombre || current.usuario_nombre === "Sin nombre") {
        current.usuario_nombre = row.usuario_nombre || row.usuario_email || row.usuario_id || "Sin nombre";
      }

      grouped.set(key, current);
    });

    const ranking = [...grouped.values()].sort((a, b) =>
      b.total_vendido - a.total_vendido ||
      b.ventas_realizadas - a.ventas_realizadas ||
      (Date.parse(b.ultima_venta || 0) - Date.parse(a.ultima_venta || 0))
    );

    return ranking[0] || null;
  }

  function renderSalesChart(todayTotal, weekTotal, monthTotal) {
    const canvas = document.getElementById("salesChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");

    if (salesChart) {
      salesChart.destroy();
      salesChart = null;
    }

    salesChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Hoy", "Semana", "Mes"],
        datasets: [{
          label: "Ventas",
          data: [todayTotal, weekTotal, monthTotal],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => formatCurrency(context.parsed.y)
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => formatCurrency(value)
            }
          }
        }
      }
    });
  }

  function renderExecutiveSummary({ todaySales, weekSales, monthSales, products }) {
    const totalToday = todaySales.reduce((acc, sale) => acc + numberOrZero(sale.total), 0);
    const totalWeek = weekSales.reduce((acc, sale) => acc + numberOrZero(sale.total), 0);
    const totalMonth = monthSales.reduce((acc, sale) => acc + numberOrZero(sale.total), 0);
    const transactionsMonth = monthSales.length;
    const averageTicket = transactionsMonth > 0 ? totalMonth / transactionsMonth : 0;
    const topSeller = computeTopSellerFromMonthSales(monthSales);

    const totalProducts = products.length;
    const lowStockCount = products.filter(p => getStockUnits(p) <= LOW_STOCK_THRESHOLD).length;

    if (reportMonthSalesEl) reportMonthSalesEl.textContent = formatCurrency(totalMonth);
    if (reportMonthSalesMetaEl) {
      reportMonthSalesMetaEl.innerHTML = `
        <div>${transactionsMonth} ventas finalizadas</div>
        <div>${getMonthWindowLabel()}</div>
      `;
    }

    if (reportTodaySalesEl) reportTodaySalesEl.textContent = formatCurrency(totalToday);
    if (reportTodaySalesMetaEl) {
      reportTodaySalesMetaEl.textContent = `Ventas registradas hoy: ${todaySales.length}`;
    }

    if (reportWeekSalesEl) reportWeekSalesEl.textContent = formatCurrency(totalWeek);
    if (reportWeekSalesMetaEl) {
      reportWeekSalesMetaEl.textContent = `Ventas registradas esta semana: ${weekSales.length}`;
    }

    if (reportProductsEl) reportProductsEl.textContent = totalProducts;
    if (reportProductsMetaEl) {
      reportProductsMetaEl.textContent = "Total de productos activos.";
    }

    if (reportLowStockEl) reportLowStockEl.textContent = lowStockCount;
    if (reportLowStockMetaEl) {
      reportLowStockMetaEl.textContent = "Productos en nivel crítico.";
    }

    if (reportAverageTicketEl) reportAverageTicketEl.textContent = formatCurrency(averageTicket);
    if (reportAverageTicketMetaEl) {
      reportAverageTicketMetaEl.textContent = `Promedio calculado sobre ${transactionsMonth} transacciones.`;
    }

    if (reportTopSellerEl) {
      reportTopSellerEl.textContent = topSeller?.usuario_nombre || "Sin datos";
    }

    if (reportTopSellerMetaEl) {
      if (topSeller) {
        reportTopSellerMetaEl.innerHTML = `
          <div><strong>Vendió:</strong> ${formatCurrency(topSeller.total_vendido)}</div>
          <div><strong>Ventas:</strong> ${topSeller.ventas_realizadas}</div>
          <div><strong>Promedio por venta:</strong> ${formatCurrency(topSeller.ventas_realizadas > 0 ? topSeller.total_vendido / topSeller.ventas_realizadas : 0)}</div>
          <div><strong>Última venta:</strong> ${escapeHtml(formatDate(topSeller.ultima_venta))}</div>
        `;
      } else {
        reportTopSellerMetaEl.innerHTML = "";
      }
    }

    renderSalesChart(totalToday, totalWeek, totalMonth);
  }

  async function loadLowStockAlerts(products, monthlySalesMapRef) {
    try {
      const lowStock = [];

      products.forEach(p => {
        const stockUnits = getStockUnits(p);
        const stockBoxes = getStockBoxes(p);
        const unitsPerBox = getUnitsPerBox(p);
        const soldUnitsMonth = numberOrZero(monthlySalesMapRef[p.id]);

        let daysLeft = "-";
        if (soldUnitsMonth > 0) {
          const dailyRate = soldUnitsMonth / 30;
          daysLeft = dailyRate > 0 ? Math.floor(stockUnits / dailyRate) : "-";
        }

        if (stockUnits <= LOW_STOCK_THRESHOLD) {
          lowStock.push({
            name: p.nombre || "Sin nombre",
            stockUnits,
            stockBoxes,
            unitsPerBox,
            daysLeft
          });
        }
      });

      lowStock.sort((a, b) => a.stockUnits - b.stockUnits);

      if (!lowStockPanel) return;

      lowStockPanel.innerHTML = "";

      if (!lowStock.length) {
        lowStockPanel.innerHTML = '<div class="no-alerts">No hay productos en stock crítico.</div>';
        return;
      }

      lowStock.slice(0, 10).forEach(item => {
        const el = document.createElement("div");
        el.className = "low-stock-item low-stock-item--rich";

        el.innerHTML = `
          <div class="low-stock-item__left">
            <strong>${escapeHtml(item.name)}</strong>
            <div class="low-stock-item__muted">Stock crítico detectado</div>
          </div>
          <div class="low-stock-item__right">
            <div><span>Stock</span><strong>${item.stockUnits}</strong></div>
            <div><span>Cajas</span><strong>${item.stockBoxes.toFixed(2)}</strong></div>
            <div><span>U/caja</span><strong>${item.unitsPerBox}</strong></div>
            <div><span>Se agota en</span><strong>${item.daysLeft} días</strong></div>
          </div>
        `;

        lowStockPanel.appendChild(el);
      });
    } catch (err) {
      console.error(err);
      if (lowStockPanel) {
        lowStockPanel.innerHTML = '<div class="no-alerts">No se pudieron cargar las alertas.</div>';
      }
    }
  }

  async function loadSalesOfTheMonth(monthSales) {
    const sales = monthSales || await Model.getSalesForMonth();

    cachedSales = sales.map(sale => ({
      customerName: getSaleCustomerName(sale),
      total: numberOrZero(sale.total),
      dateStr: formatShortDate(sale.created_at),
      rawDate: sale.created_at
    }));

    renderSalesRows(cachedSales);
    return sales;
  }

  function sanitizeFileName(name) {
    try {
      return String(name || "qr")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .substring(0, 50);
    } catch (e) {
      console.warn("Error sanitizando nombre de archivo:", e);
      return "qr";
    }
  }

  function normalizeQRText(text) {
    try {
      return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    } catch (e) {
      console.warn("No se pudo normalizar texto QR:", e);
      return String(text || "");
    }
  }

  function injectDashboardStyles() {
    if (document.getElementById("dashboardExtraStyles")) return;

    const style = document.createElement("style");
    style.id = "dashboardExtraStyles";
    style.textContent = `
      .report-section {
        margin-top: 18px;
        margin-bottom: 18px;
      }

      .reports-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 16px;
      }

      .report-card {
        background: #fff;
        border: 1px solid #e5e7eb;
        box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
        border-radius: 14px;
        padding: 16px;
        min-height: 140px;
      }

      .report-card--feature {
        grid-column: span 4;
        display: flex;
        flex-direction: column;
        justify-content: center;
        background: linear-gradient(135deg, #fff, #f8fbff);
      }

      .report-card h3 {
        margin: 0 0 10px;
        font-size: 0.95rem;
        color: #374151;
      }

      .report-value {
        font-size: 1.6rem;
        font-weight: 900;
        color: #111827;
        line-height: 1.1;
      }

      .report-feature-name {
        font-size: 1.6rem;
        font-weight: 900;
        color: #111827;
        margin-bottom: 8px;
      }

      .report-meta {
        margin-top: 10px;
        font-size: 0.92rem;
        color: #6b7280;
        line-height: 1.45;
      }

      .top-products-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-top: 10px;
      }

      .low-stock-item--rich {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        padding: 12px 14px;
        border: 1px solid #fde68a;
        border-radius: 12px;
        background: linear-gradient(135deg, #fff, #fffbeb);
        margin-bottom: 10px;
      }

      .low-stock-item--rich:last-child {
        margin-bottom: 0;
      }

      .low-stock-item__left {
        min-width: 0;
      }

      .low-stock-item__left strong {
        display: block;
        font-size: 0.98rem;
        color: #111827;
        margin-bottom: 4px;
      }

      .low-stock-item__muted {
        font-size: 0.85rem;
        color: #6b7280;
      }

      .low-stock-item__right {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 12px;
        min-width: 180px;
        text-align: right;
      }

      .low-stock-item__right span {
        display: block;
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #6b7280;
      }

      .low-stock-item__right strong {
        display: block;
        font-size: 0.95rem;
        color: #111827;
      }

      .no-alerts,
      .empty-state {
        color: #6b7280;
        padding: 8px 0;
      }

      @media (max-width: 1100px) {
        .reports-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .report-card--feature {
          grid-column: span 2;
        }
      }

      @media (max-width: 768px) {
        .reports-grid {
          grid-template-columns: 1fr;
        }

        .report-card--feature {
          grid-column: span 1;
        }

        .low-stock-item--rich {
          flex-direction: column;
        }

        .low-stock-item__right {
          width: 100%;
          min-width: 0;
          text-align: left;
          grid-template-columns: 1fr 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  async function initDashboard() {
    try {
      const current = await Auth.getCurrentUser();
      const user = current?.user || current?.data?.user || current;

      if (!user) {
        window.location.href = "index.html";
        return;
      }

      await loadGreeting(user.id);
      const adminOk = await loadAdminContext();
      if (!adminOk) return;

      const [todaySales, weekSales, monthSales, products] = await Promise.all([
        Model.getSalesForToday(),
        Model.getSalesForWeek(),
        Model.getSalesForMonth(),
        Model.getProducts()
      ]);

      const totalToday = todaySales.reduce((acc, sale) => acc + numberOrZero(sale.total), 0);
      const totalWeek = weekSales.reduce((acc, sale) => acc + numberOrZero(sale.total), 0);
      const totalMonth = monthSales.reduce((acc, sale) => acc + numberOrZero(sale.total), 0);

      monthlySalesMap = (await Model.getMonthlyProductSalesMap())?.unitsMap || {};

      if (reportProductsEl) reportProductsEl.textContent = products.length;
      if (reportLowStockEl) reportLowStockEl.textContent = products.filter(p => getStockUnits(p) <= LOW_STOCK_THRESHOLD).length;

      cachedSales = monthSales.map(sale => ({
        customerName: getSaleCustomerName(sale),
        total: numberOrZero(sale.total),
        dateStr: formatShortDate(sale.created_at),
        rawDate: sale.created_at
      }));

      renderSalesRows(cachedSales);

      renderExecutiveSummary({
        todaySales,
        weekSales,
        monthSales,
        products
      });

      await Promise.all([
        loadLowStockAlerts(products, monthlySalesMap)
      ]);

      if (salesSearch) {
        salesSearch.addEventListener("input", () => {
          applySalesFilter(salesSearch.value);
        });
      }

      if (btnGoInventory) {
        btnGoInventory.addEventListener("click", () => {
          window.location.href = "inventory.html";
        });
      }

      if (menuToggle) {
        setMobileMenu(false);

        menuToggle.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleMobileMenu();
        });
      }

      if (navMenu) {
        navMenu.addEventListener("click", (e) => {
          const clickedLink = e.target.closest("a");
          if (clickedLink && window.innerWidth <= 768) {
            closeMobileMenu();
          }
        });
      }

      document.addEventListener("click", (e) => {
        if (!navMenu || !menuToggle) return;
        if (window.innerWidth > 768) return;

        const clickedInsideMenu = navMenu.contains(e.target);
        const clickedToggle = menuToggle.contains(e.target);

        if (!clickedInsideMenu && !clickedToggle && isMobileMenuOpen()) {
          closeMobileMenu();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isMobileMenuOpen()) {
          closeMobileMenu();
        }
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > 768) {
          closeMobileMenu();
        }
      });

      if (btnCloseDay) {
        btnCloseDay.addEventListener("click", async () => {
          const { start, end } = getTodayWindow();

          const res = await Swal.fire({
            title: "¿Registrar cierre de caja?",
            html: "Se calcularán solo las ventas registradas hoy.",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Sí, registrar",
            cancelButtonText: "Cancelar"
          });

          if (!res.isConfirmed) return;

          try {
            const sales = await Model.getSalesBetween(start, end);
            const total = sales.reduce((acc, sale) => acc + numberOrZero(sale.total), 0);

            if (!supabase) {
              throw new Error("Supabase no está disponible.");
            }

            const session = typeof Auth.getSessionData === "function"
              ? await Auth.getSessionData()
              : null;

            const createdBy = session?.uid || session?.user?.id || null;

            const { error } = await supabase.from("cierres_caja").insert([{
              date: new Date().toISOString(),
              dateString: start.toISOString().slice(0, 10),
              total,
              createdBy,
              type: "ventas"
            }]);

            if (error) {
              throw error;
            }

            Swal.fire({
              icon: "success",
              title: "Cierre registrado",
              text: `Total del día: ${formatCurrency(total)}`
            });
          } catch (err) {
            console.error(err);
            Swal.fire("Error", "No se pudo registrar cierre", "error");
          }
        });
      }

      logoutButtons.forEach(btn => {
        btn.addEventListener("click", async () => {
          await Auth.signOut();
        });
      });
    } catch (err) {
      console.error("Error inicializando dashboard:", err);
    }
  }

  initDashboard();
});