// js/chart-utils.js
// Funciones para dibujar y actualizar el gráfico de ventas
(function (global) {
  function drawSalesChart(ctxElementId, salesData, salesGoal) {
    const canvas = document.getElementById(ctxElementId);

    if (!canvas) {
      console.warn(`No se encontró el canvas: ${ctxElementId}`);
      return;
    }

    if (typeof Chart === "undefined") {
      console.warn("Chart.js no está cargado.");
      return;
    }

    const ctx = canvas.getContext("2d");

    if (global.salesChart instanceof Chart) {
      global.salesChart.destroy();
    }

    const ventasRealizadas = Number(salesData) || 0;
    const metaVentas = Number(salesGoal) || 0;
    const ventasRestantes = Math.max(0, metaVentas - ventasRealizadas);

    global.salesChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Ventas Realizadas", "Ventas Restantes"],
        datasets: [{
          label: "Proyección de Ventas",
          data: [ventasRealizadas, ventasRestantes],
          backgroundColor: ["#4CAF50", "#FF8A65"],
          borderColor: ["#4CAF50", "#FF8A65"],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                const value = Number(context.raw) || 0;
                return formatCurrency(value);
              }
            }
          }
        }
      }
    });
  }

  // Útil para formatear moneda local
  function formatCurrency(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(n);
  }

  function formatNumber(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat("es-ES", {
      maximumFractionDigits: 2
    }).format(n);
  }

  function safePercent(part, total) {
    const p = Number(part) || 0;
    const t = Number(total) || 0;

    if (t <= 0) return 0;
    return Math.round((p / t) * 100);
  }

  // Exponer funciones a global (para compatibilidad)
  global.appChartUtils = {
    drawSalesChart,
    formatCurrency,
    formatNumber,
    safePercent
  };
})(window);