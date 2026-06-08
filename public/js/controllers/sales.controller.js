// js/controllers/sales.controller.js 
(function (global) {
  "use strict";

  const model = global.salesModel;
  const Swal = global.Swal;

  if (!model) {
    console.error("salesModel no está disponible.");
    return;
  }

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const paymentMethodSelect = qs("#paymentMethod");
  const productSelect = qs("#productSelect");
  const saleQuantityInput = qs("#saleQuantity");
  const btnAddToCart = qs("#btnAddToCart");
  const btnAddCombo = qs("#btnAddCombo");
  const btnClearCart = qs("#btnClearCart");
  const cartTableBody = qs("#cartTable tbody");
  const cartSubtotalEl = qs("#cartSubtotal");
  const btnFinalize = qs("#btnFinalize");
  const btnSaveDraft = qs("#btnSaveDraft");
  const salesTableEl = qs("#salesTable");
  const logoutBtn = qs("#logout-button");
  const btnQr = qs("#btnDescargarQr");
  const qrContainer = qs("#qr-container");
  const menuToggle = qs("#menu-toggle");
  const navLinks = qs("#navbar-links");

  const TYPE_LABELS = {
    insumo: "Insumo",
    botella: "Botella",
    trago_preparado: "Trago preparado",
    servicio: "Servicio"
  };

  const SALES_TABLE_COLUMNS = 6;

  let salesDataTable = null;
  let companyName = "";

  function normalizeQRText(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function sanitizeFileName(name) {
    return String(name || "empresa")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 50) || "empresa";
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

  function getTypeText(tipo) {
    const key = String(tipo || "").toLowerCase();
    return TYPE_LABELS[key] || String(tipo || "-");
  }

  function formatMoney(n) {
    if (global.appChartUtils && typeof global.appChartUtils.formatCurrency === "function") {
      return global.appChartUtils.formatCurrency(n);
    }
    return model.currency(n);
  }

  function notifySuccess(msg) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: msg,
        showConfirmButton: false,
        timer: 1500
      });
      return;
    }
    console.info("SUCCESS:", msg);
  }

  function notifyError(msg) {
    if (typeof Swal !== "undefined") {
      Swal.fire("Error", msg, "error");
      return;
    }
    console.error("ERROR:", msg);
    alert("Error: " + msg);
  }

  function getProductDisplayName(p) {
    if (!p) return "Producto";

    const baseName = String(p.nombre || "Producto");
    const recetaName = String(p.receta_nombre || "").trim();

    if (String(p.tipo_producto || "").toLowerCase() === "trago_preparado" && recetaName) {
      if (recetaName.toLowerCase() !== baseName.toLowerCase()) {
        return `${baseName} • ${recetaName}`;
      }
    }

    return baseName;
  }

  function getSellableProducts() {
    return Object.values(model.state.productsCache || {})
      .filter((p) => Boolean(p.activo) && String(p.tipo_producto || "").toLowerCase() !== "servicio")
      .sort((a, b) => {
        const pa = String(a.tipo_producto || "").toLowerCase() === "trago_preparado" ? 0 : 1;
        const pb = String(b.tipo_producto || "").toLowerCase() === "trago_preparado" ? 0 : 1;
        return pa - pb || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
      });
  }

  function initProductSelect2() {
    if (!global.jQuery || !$.fn.select2 || !productSelect) return;

    const $select = $(productSelect);

    if ($select.hasClass("select2-hidden-accessible")) {
      $select.off(".sales");
      $select.select2("destroy");
    }

    $select.select2({
      placeholder: "Buscar producto por nombre...",
      width: "100%",
      allowClear: true,
      dropdownAutoWidth: true
    });

    $select.off(".sales");
    $select.on("select2:open.sales", () => {
      setTimeout(() => {
        const field = qs(".select2-container--open .select2-search__field");
        if (!field) return;

        field.focus();
        field.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            setTimeout(() => {
              if (productSelect.value) handleAddToCart();
            }, 0);
          }
        };
      }, 0);
    });
  }

  function renderProductSelect() {
    if (!productSelect) return;

    const products = Object.values(model.state.productsCache || {})
      .filter((p) => Boolean(p.activo))
      .sort((a, b) => {
        const rank = (p) => String(p.tipo_producto || "").toLowerCase() === "trago_preparado" ? 0 : 1;
        return rank(a) - rank(b) || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
      });

    const preparados = products.filter((p) => String(p.tipo_producto || "").toLowerCase() === "trago_preparado");
    const individuales = products.filter((p) => String(p.tipo_producto || "").toLowerCase() !== "trago_preparado");

    productSelect.innerHTML = "";

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "";
    productSelect.appendChild(blank);

    const addGroup = (label, items) => {
      if (!items.length) return;

      const group = document.createElement("optgroup");
      group.label = label;

      items.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = String(p.id);

        const displayName = getProductDisplayName(p);
        const typeText = getTypeText(p.tipo_producto);

        opt.textContent = `${displayName} | ${typeText} | ${formatMoney(p.precio)} | Stock: ${p.stock}`;
        group.appendChild(opt);
      });

      productSelect.appendChild(group);
    };

    addGroup("Tragos preparados", preparados);
    addGroup("Productos individuales", individuales);

    if (!preparados.length && !individuales.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No hay productos disponibles";
      productSelect.appendChild(opt);
    }

    initProductSelect2();
  }

  function initSalesDataTable() {
    if (!salesTableEl || !global.jQuery || !$.fn.DataTable) return null;

    if ($.fn.dataTable.isDataTable("#salesTable")) {
      salesDataTable = $("#salesTable").DataTable();
      return salesDataTable;
    }

    salesDataTable = $("#salesTable").DataTable({
      pageLength: 10,
      lengthChange: true,
      searching: true,
      ordering: true,
      info: true,
      autoWidth: false,
      scrollY: "300px",
      scrollCollapse: true,
      scrollX: true,
      language: {
        decimal: "",
        emptyTable: "No hay ventas registradas.",
        info: "Mostrando _START_ a _END_ de _TOTAL_ ventas",
        infoEmpty: "Mostrando 0 a 0 de 0 ventas",
        infoFiltered: "(filtrado de _MAX_ ventas totales)",
        lengthMenu: "Mostrar _MENU_ registros",
        loadingRecords: "Cargando...",
        processing: "Procesando...",
        search: "Buscar:",
        zeroRecords: "No se encontraron resultados",
        paginate: {
          first: "Primero",
          last: "Último",
          next: "Siguiente",
          previous: "Anterior"
        }
      }
    });

    return salesDataTable;
  }

  async function renderSalesRows(rows) {
    const dt = initSalesDataTable();

    const preparedRows = await Promise.all(
      (rows || []).map(async (v) => {
        const isReserva = String(v.kind || "").toLowerCase() === "reserva";

        const nombre = isReserva
          ? (v.nombre_reserva || v.observacion || "Reserva")
          : (v.usuario_nombre ? model.saleLabel(v) : model.saleDetailText(v));

        const userName = isReserva
          ? (v.usuario_reserva_nombre || "-")
          : (v.usuario_nombre || (v.usuario_id ? await model.fetchUserName(v.usuario_id) : "-"));

        const d = model.parseDate(v.created_at);
        const dateText = d ? d.toLocaleString() : "-";

        return [
          nombre,
          model.currency(v.total || 0),
          model.currency(v.costo_estandar_total || 0),
          model.currency(v.costo_real_total || 0),
          userName || "-",
          dateText
        ];
      })
    );

    if (dt) {
      dt.clear();
      dt.rows.add(preparedRows);
      dt.draw();
      return;
    }

    const tbody = salesTableEl ? qs("tbody", salesTableEl) : null;
    if (!tbody) return;

    tbody.innerHTML = "";

    if (!preparedRows.length) {
      tbody.innerHTML = `<tr><td colspan="${SALES_TABLE_COLUMNS}">No hay ventas registradas.</td></tr>`;
      return;
    }

    for (const row of preparedRows) {
      const tr = document.createElement("tr");
      row.forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }

  async function loadSalesAndRender() {
    const rows = await model.loadSales();
    await renderSalesRows(rows);
  }

  async function loadCompanyName() {
    const user = model.getCurrentUser();
    const supabase = global.supabase;

    if (!user || !user.empresa_id || !supabase) return "";

    try {
      const { data, error } = await supabase
        .from("empresa")
        .select("nombre")
        .eq("empresa_id", user.empresa_id)
        .maybeSingle();

      if (!error && data && data.nombre) {
        companyName = data.nombre;
        global.adminEmpresaNombre = data.nombre;
        global.adminEmpresa = String(user.empresa_id);
        global.adminSucursal = user.sucursal_id != null ? String(user.sucursal_id) : "";
        return companyName;
      }
    } catch (e) {
      console.warn("No se pudo obtener el nombre de la empresa:", e);
    }

    companyName = "";
    return "";
  }

  function renderCart() {
    if (!cartTableBody) return;

    const cart = model.getCart();
    cartTableBody.innerHTML = "";

    if (!cart.length) {
      cartTableBody.innerHTML = `<tr><td colspan="5">El carrito está vacío.</td></tr>`;
      if (cartSubtotalEl) cartSubtotalEl.textContent = model.currency(0);
      if (btnFinalize) btnFinalize.disabled = true;
      return;
    }

    cart.forEach((item, idx) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      if (item.kind === "combo") {
        const componentsText = Array.isArray(item.components)
          ? item.components.map((c) => `${c.nombre} x${Number(c.cantidad || 0)}`).join(", ")
          : "";

        const strong = document.createElement("strong");
        strong.textContent = item.nombre;

        const details = document.createElement("div");
        details.className = "combo-components";
        details.textContent = `Combo: ${componentsText}`;

        tdName.appendChild(strong);
        tdName.appendChild(details);
      } else {
        tdName.textContent = item.nombre;
      }
      tr.appendChild(tdName);

      const tdQty = document.createElement("td");
      const qtyInput = document.createElement("input");
      qtyInput.type = "number";
      qtyInput.min = 1;
      qtyInput.value = item.cantidad;
      qtyInput.className = "cart-qty-input";

      qtyInput.addEventListener("change", (e) => {
        const result = model.updateCartQuantity(idx, e.target.value);
        if (!result.ok) {
          if (Swal) {
            Swal.fire({
              icon: "warning",
              title: "Stock insuficiente",
              text: result.message || "Cantidad inválida"
            });
          } else {
            alert(result.message || "Cantidad inválida");
          }
          e.target.value = item.cantidad;
          return;
        }

        renderCart();
      });

      tdQty.appendChild(qtyInput);
      tr.appendChild(tdQty);

      const tdPrice = document.createElement("td");
      tdPrice.textContent = model.currency(item.precio_unitario);
      tr.appendChild(tdPrice);

      const tdTotal = document.createElement("td");
      tdTotal.textContent = model.currency(item.total);
      tr.appendChild(tdTotal);

      const tdActions = document.createElement("td");
      const removeBtn = document.createElement("button");
      removeBtn.className = "btn-outline";
      removeBtn.type = "button";
      removeBtn.innerHTML = '<i class="fas fa-trash"></i> Quitar';
      removeBtn.addEventListener("click", () => {
        model.removeCartItem(idx);
        renderCart();
      });
      tdActions.appendChild(removeBtn);
      tr.appendChild(tdActions);

      cartTableBody.appendChild(tr);
    });

    if (cartSubtotalEl) cartSubtotalEl.textContent = model.currency(model.getSubtotal());
    if (btnFinalize) btnFinalize.disabled = false;
  }

  function addToCart(productId, qty = 1) {
    const key = String(productId || "");
    const prod = model.state.productsCache[key];

    if (!key) {
      return { ok: false, message: "Selecciona un producto" };
    }

    if (!prod) {
      return { ok: false, message: "Producto no encontrado" };
    }

    if (String(prod.tipo_producto || "").toLowerCase() === "servicio") {
      return { ok: false, message: "Los servicios no se venden desde este módulo." };
    }

    const cantidad = Math.max(1, Number(qty || 1));
    const currentInCart = model.state.cart.find((i) => i.kind === "product" && String(i.productId) === key);
    const already = currentInCart ? Number(currentInCart.cantidad || 0) : 0;

    const check = model.canReserveProductQty
      ? model.canReserveProductQty(key, already + cantidad, null)
      : { ok: true };

    if (!check.ok) return check;

    if (currentInCart) {
      currentInCart.cantidad += cantidad;
      currentInCart.total = Number(currentInCart.cantidad) * Number(currentInCart.precio_unitario);
    } else {
      model.state.cart.push({
        kind: "product",
        productId: key,
        saleProductId: String(prod.producto_id || prod.id),
        tipo_producto: prod.tipo_producto || "insumo",
        nombre: prod.nombre,
        precio_unitario: Number(prod.precio || 0),
        cantidad,
        total: Number(cantidad) * Number(prod.precio || 0)
      });
    }

    return { ok: true, message: "Producto añadido" };
  }

  function buildComboOptionHtml(selectedValue = "") {
    return getSellableProducts()
      .map((p) => {
        const selected = String(p.id) === String(selectedValue) ? "selected" : "";
        const displayName = getProductDisplayName(p);
        const recetaExtra = String(p.receta_nombre || "").trim() ? ` • ${p.receta_nombre}` : "";

        return `<option value="${escapeHtml(String(p.id))}" ${selected}>
          ${escapeHtml(displayName)}${String(p.tipo_producto || "").toLowerCase() === "trago_preparado" ? escapeHtml(recetaExtra) : ""} (${escapeHtml(getTypeText(p.tipo_producto))}) | ${escapeHtml(model.currency(p.precio))}
        </option>`;
      })
      .join("");
  }

  function createComboRow(data = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "combo-row";

    wrapper.innerHTML = `
      <select class="combo-product">
        ${buildComboOptionHtml(data.productId || "")}
      </select>
      <input class="combo-qty" type="number" min="1" step="1" value="${Number(data.cantidad || 1)}" placeholder="Cant.">
      <button type="button" class="btn-outline combo-remove-btn">X</button>
    `;

    wrapper.querySelector(".btn-outline").addEventListener("click", () => wrapper.remove());
    return wrapper;
  }

  async function openComboModal() {
    if (typeof Swal === "undefined") {
      notifyError("SweetAlert2 no está disponible.");
      return;
    }

    if (!Object.keys(model.state.productsCache || {}).length) {
      await model.loadProducts();
    }

    const html = `
      <div class="swal-form">
        <label class="swal-form__label" for="swal-combo-name">Nombre del combo</label>
        <input id="swal-combo-name" class="swal2-input" placeholder="Ej: Combo 2 tragos + botana">

        <label class="swal-form__label" for="swal-combo-price">Precio del combo</label>
        <input id="swal-combo-price" class="swal2-input" type="number" step="0.01" min="0" value="0">

        <div style="margin-top:12px; font-weight:bold;">Componentes del combo</div>
        <div class="swal-form__help">
          Selecciona al menos 2 productos. Se descontarán del inventario como productos normales.
        </div>

        <div id="combo-details" style="margin-top:8px;"></div>
        <button type="button" id="btn-add-combo-row" class="btn-primary" style="margin-top:8px;">Agregar producto al combo</button>
      </div>
    `;

    const result = await Swal.fire({
      title: "Nuevo combo",
      html,
      width: 900,
      showCancelButton: true,
      confirmButtonText: "Agregar combo al carrito",
      cancelButtonText: "Cancelar",
      didOpen: () => {
        const container = qs("#combo-details");
        const addBtn = qs("#btn-add-combo-row");

        if (!container || !addBtn) return;

        container.appendChild(createComboRow({ cantidad: 1 }));
        container.appendChild(createComboRow({ cantidad: 1 }));

        addBtn.addEventListener("click", () => {
          container.appendChild(createComboRow({ cantidad: 1 }));
        });
      },
      preConfirm: () => {
        const nombre = qs("#swal-combo-name")?.value.trim() || "";
        const precio_unitario = Number(qs("#swal-combo-price")?.value || 0) || 0;
        const rows = qsa("#combo-details .combo-row");

        const components = rows.map((row) => ({
          productId: qs(".combo-product", row)?.value || "",
          cantidad: Number(qs(".combo-qty", row)?.value || 0) || 0,
          nombre: qs(".combo-product", row)?.selectedOptions?.[0]?.textContent || ""
        })).filter((r) => r.productId && r.cantidad > 0);

        return { nombre, precio_unitario, components };
      }
    });

    if (!result.isConfirmed || !result.value) return;

    const { nombre, precio_unitario, components } = result.value;

    if (!nombre) {
      notifyError("El nombre del combo es obligatorio.");
      return;
    }

    if (precio_unitario < 0) {
      notifyError("El precio del combo no puede ser negativo.");
      return;
    }

    if (components.length < 2) {
      notifyError("El combo debe tener al menos 2 productos.");
      return;
    }

    const validation = model.addComboToCart(
      { nombre, precio_unitario, components },
      1
    );

    if (!validation.ok) {
      notifyError(validation.message || "No se pudo agregar el combo.");
      return;
    }

    notifySuccess("Combo agregado");
    renderCart();
  }

  async function handleFinalize() {
    const cart = model.getCart();

    if (!cart.length) {
      if (Swal) Swal.fire("Carrito vacío", "Agrega productos al carrito antes de finalizar.", "info");
      return;
    }

    const total = model.getSubtotal();

    const summaryHtml = cart
      .map((i) => `
        <div class="cart-summary">
          <span>${i.kind === "combo" ? "Combo: " : ""}${escapeHtml(i.nombre)} x${i.cantidad}</span>
          <strong>${model.currency(i.total)}</strong>
        </div>
      `)
      .join("");

    const confirm = Swal
      ? await Swal.fire({
          title: "Finalizar venta",
          html: `
            <div class="swal-form">
              ${summaryHtml}
              <hr>
              <div class="cart-summary">
                <strong>Total:</strong>
                <strong>${model.currency(total)}</strong>
              </div>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: "Confirmar venta",
          cancelButtonText: "Cancelar",
          width: 500
        })
      : { isConfirmed: true };

    if (!confirm.isConfirmed) return;

    try {
      const metodoPago = paymentMethodSelect ? paymentMethodSelect.value : "efectivo";
      const result = await model.finalizeSale({ metodoPago });

      if (!result.ok) {
        notifyError(result.message || "No se pudo finalizar la venta.");
        return;
      }

      notifySuccess("Venta registrada");
      renderCart();
      await model.loadProducts();
      renderProductSelect();
      await loadSalesAndRender();
    } catch (e) {
      console.error("Error finalizando venta:", e);
      notifyError(e.message || "No se pudo finalizar la venta.");
    }
  }

  function handleAddToCart() {
    const productId = productSelect ? productSelect.value : "";
    const qty = Math.max(1, Number(saleQuantityInput ? saleQuantityInput.value || 1 : 1));
    const result = addToCart(productId, qty);

    if (!result.ok) {
      if (Swal) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "warning",
          title: result.message || "No se pudo agregar",
          showConfirmButton: false,
          timer: 1400
        });
      } else {
        alert(result.message || "No se pudo agregar");
      }
      return;
    }

    renderCart();

    if (Swal) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: result.message || "Producto añadido",
        showConfirmButton: false,
        timer: 1200
      });
    }

    if (saleQuantityInput) saleQuantityInput.value = 1;

    if (productSelect) {
      productSelect.value = "";
      if (global.jQuery && $.fn.select2 && $(productSelect).hasClass("select2-hidden-accessible")) {
        $(productSelect).val("").trigger("change");
      }
    }
  }

  function handleSaveDraft() {
    const result = model.saveDraft();

    if (!result.ok) {
      if (Swal) Swal.fire("Carrito vacío", "Agrega productos antes de guardar un borrador.", "info");
      return;
    }

    if (Swal) {
      Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: "Borrador guardado localmente",
        showConfirmButton: false,
        timer: 1400
      });
    }
  }

  function setupMenu() {
    if (!menuToggle || !navLinks) return;

    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      navLinks.classList.toggle("active");
    });

    qsa("a, button", navLinks).forEach((item) => {
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

  async function setupQr() {
    if (!btnQr || !qrContainer) return;

    btnQr.addEventListener("click", async () => {
      qrContainer.innerHTML = "";

      let text =
        companyName ||
        global.adminEmpresaNombre ||
        String(model.getCurrentUser()?.empresa_id || "").trim();

      text = normalizeQRText(text).trim();

      if (!text) {
        alert("No hay empresa asignada para generar QR.");
        return;
      }

      try {
        new QRCode(qrContainer, {
          text,
          width: 400,
          height: 400,
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (e) {
        console.error("Error generando QR:", e);
        alert("Error generando QR");
        return;
      }

      setTimeout(() => {
        let href = null;
        const img = qs("img", qrContainer);
        if (img && img.src) {
          href = img.src;
        } else {
          const canvas = qs("canvas", qrContainer);
          if (canvas && typeof canvas.toDataURL === "function") {
            href = canvas.toDataURL("image/png");
          }
        }

        if (!href) {
          qrContainer.innerHTML = "";
          alert("No se pudo generar imagen del QR");
          return;
        }

        const a = document.createElement("a");
        a.href = href;
        a.download = sanitizeFileName(companyName || global.adminEmpresaNombre || "empresa") + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();

        qrContainer.innerHTML = "";
      }, 150);
    });
  }

  function bindUI() {
    if (btnAddToCart) {
      btnAddToCart.addEventListener("click", (e) => {
        e.preventDefault();
        handleAddToCart();
      });
    }

    if (btnAddCombo) {
      btnAddCombo.addEventListener("click", (e) => {
        e.preventDefault();
        openComboModal();
      });
    }

    if (btnClearCart) {
      btnClearCart.addEventListener("click", (e) => {
        e.preventDefault();
        model.clearCart();
        renderCart();
      });
    }

    if (btnFinalize) {
      btnFinalize.addEventListener("click", (e) => {
        e.preventDefault();
        handleFinalize();
      });
    }

    if (btnSaveDraft) {
      btnSaveDraft.addEventListener("click", (e) => {
        e.preventDefault();
        handleSaveDraft();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
          if (global.AuthModel && typeof global.AuthModel.signOut === "function") {
            await global.AuthModel.signOut();
          } else if (typeof global.logout === "function") {
            await global.logout();
          } else {
            window.location.replace("index.html");
          }
        } catch (err) {
          console.error("[sales.controller] Error cerrando sesión:", err);
          window.location.replace("index.html");
        }
      });
    }
  }

  async function boot() {
    try {
      bindUI();
      setupMenu();
      await setupQr();

      const currentUser = await model.bootstrapAuth();
      if (!currentUser) {
        console.warn("No se detectó sesión válida para ventas.");
        if (global.AuthModel && typeof global.AuthModel.signOut === "function") {
          await global.AuthModel.signOut();
        } else {
          window.location.replace("index.html");
        }
        return;
      }

      model.setCurrentUser(currentUser);
      await loadCompanyName();

      await model.loadProducts();
      renderProductSelect();

      initSalesDataTable();
      await loadSalesAndRender();

      model.subscribeRealtime(
        async () => {
          await model.loadProducts();
          renderProductSelect();
        },
        async () => {
          await loadSalesAndRender();
        }
      );

      renderCart();

      window.addEventListener("beforeunload", () => {
        model.cleanupRealtime();
      });
    } catch (e) {
      console.error("sales.controller boot error:", e);
      notifyError("No se pudo inicializar Ventas.");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);

  global.handleAddToCart = handleAddToCart;
  global.handleFinalize = handleFinalize;

  global.salesController = {
    boot,
    renderCart,
    renderProductSelect,
    handleAddToCart,
    handleFinalize
  };
})(window);