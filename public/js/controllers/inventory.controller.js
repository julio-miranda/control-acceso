// js/controllers/inventory.controller.js
(function (global) {
  "use strict";

  const model = global.inventoryModel || global.salesModel;
  const supabase = global.supabase;

  if (!model) {
    console.error("inventoryModel no está disponible.");
    return;
  }

  const state = {
    currentUser: null,
    currentRole: null,
    productsList: [],
    forecastMap: {},
    recipeProducts: [],
    recipesList: [],
    recipesVisible: false
  };

  const el = {
    table: document.getElementById("inventoryTable"),
    tbody: document.querySelector("#inventoryTable tbody"),
    searchInput: document.getElementById("salesSearch"),
    btnAdd: document.getElementById("btnAdd"),
    btnRecetas: document.getElementById("btnRecetas"),
    btnLogout: document.getElementById("logout-button"),
    lowStockPanel: document.getElementById("lowStockPanel"),
    totalProductsCard: document.getElementById("totalProductsCard"),
    totalValueCard: document.getElementById("totalValueCard"),
    lowStockCard: document.getElementById("lowStockCard"),
    btnDescargarQr: document.getElementById("btnDescargarQr"),
    qrContainer: document.getElementById("qr-container"),
    menuToggle: document.getElementById("menu-toggle"),
    navLinks: document.getElementById("navbar-links"),
    recetasPanel: document.getElementById("recetasPanel"),
    recetasTbody: document.querySelector("#recetasTable tbody")
  };

  function formatCurrency(n) {
    return `$${(Number(n) || 0).toFixed(2)}`;
  }

  function formatDecimal(n) {
    return (Number(n) || 0).toFixed(3);
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

  function sanitizeFileName(name) {
    if (!name) return "empresa";
    return String(name)
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_");
  }

  function notifySuccess(msg, toast = true) {
    if (typeof Swal !== "undefined") {
      Swal.fire({
        toast,
        position: "top-end",
        icon: "success",
        title: msg,
        showConfirmButton: false,
        timer: 1500
      });
    } else {
      alert(msg);
    }
  }

  function notifyError(msg) {
    if (typeof Swal !== "undefined") {
      Swal.fire("Error", msg, "error");
    } else {
      alert("Error: " + msg);
    }
  }

  function normalizeRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  function isAdminRole(role) {
    const r = normalizeRole(role);
    return [
      "admin",
      "administrador",
      "administrator",
      "superadmin",
      "super administrador",
      "super-administrador"
    ].includes(r);
  }

  function getWeekRange() {
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

  async function getSessionUid() {
    try {
      if (global.AuthModel && typeof global.AuthModel.getSessionData === "function") {
        const session = await global.AuthModel.getSessionData();
        return session?.uid || null;
      }

      if (typeof global.getSessionData === "function") {
        const session = await global.getSessionData();
        return session?.uid || null;
      }

      if (supabase?.auth?.getUser) {
        const { data, error } = await supabase.auth.getUser();
        if (!error) return data?.user?.id || null;
      }
    } catch (e) {
      console.warn("getSessionUid error:", e);
    }

    return null;
  }

  async function loadCurrentUser(uid) {
    if (!uid || !supabase) return null;

    try {
      const { data, error } = await supabase
        .from("v_usuarios")
        .select("id,nombre,email,telefono,direccion,role,sucursal_id,empresa_id")
        .eq("id", uid)
        .maybeSingle();

      if (error || !data) return null;

      return {
        id: data.id || uid,
        nombre: data.nombre || data.email || "Usuario",
        email: data.email || null,
        telefono: data.telefono || null,
        direccion: data.direccion || null,
        role: normalizeRole(data.role || ""),
        sucursal_id: data.sucursal_id || null,
        empresa_id: data.empresa_id || null,
        raw: data
      };
    } catch (e) {
      console.error("loadCurrentUser:", e);
      return null;
    }
  }

  function syncAdminGlobals(userData) {
    global.adminEmpresa = String(
      userData?.empresa_id ||
      userData?.sucursal_empresa_id ||
      userData?.empresa ||
      ""
    );

    global.adminSucursal = String(
      userData?.sucursal_id ||
      userData?.sucursal ||
      ""
    );

    global.adminEmpresaNombre = String(userData?.empresa_nombre || userData?.empresaNombre || "");
  }

  function applyModelContext(userData, uid) {
    state.currentUser = userData || null;
    state.currentRole = normalizeRole(userData?.role || "");

    syncAdminGlobals(userData);

    if (typeof model.setContext === "function") {
      model.setContext({
        userId: uid || userData?.id || null,
        userName: userData?.nombre || "",
        role: state.currentRole,
        empresaId: userData?.empresa_id || userData?.sucursal_empresa_id || userData?.empresa || null,
        sucursalId: userData?.sucursal_id || null,
        empresaNombre: userData?.empresa_nombre || userData?.empresaNombre || ""
      });
    }

    if (typeof model.setCurrentUser === "function") {
      model.setCurrentUser({
        id: uid || userData?.id || null,
        nombre: userData?.nombre || "",
        role: state.currentRole,
        empresa_id: userData?.empresa_id || null,
        sucursal_id: userData?.sucursal_id || null,
        email: userData?.email || null
      });
    }
  }

  function styleBtn(btn, type = "primary") {
    if (!btn) return;
    btn.classList.add("btn", "btn-inline");

    btn.classList.remove(
      "btn-primary",
      "btn-outline",
      "btn-danger",
      "btn-success",
      "btn-edit",
      "btn-delete",
      "btn-mov",
      "btn-recipe"
    );

    if (type === "edit") btn.classList.add("btn-edit");
    else if (type === "delete") btn.classList.add("btn-delete");
    else if (type === "mov") btn.classList.add("btn-mov");
    else if (type === "recipe") btn.classList.add("btn-recipe");
    else if (type === "outline") btn.classList.add("btn-outline");
    else if (type === "success") btn.classList.add("btn-success");
    else if (type === "danger") btn.classList.add("btn-danger");
    else btn.classList.add("btn-primary");
  }

  function buildForecastTooltip(forecast) {
    if (!forecast || !forecast.soldThisMonth) return "Sin historial de ventas este mes.";

    return [
      `Vendidas este mes: ${Number(forecast.soldThisMonth || 0).toFixed(0)}`,
      `Promedio diario: ${Number(forecast.avgDaily || 0).toFixed(2)}`,
      `Proyección próximo mes: ${Number(forecast.projectedNextMonth || 0).toFixed(0)}`
    ].join("\n");
  }

  async function ensureProductsList() {
    if (state.productsList && state.productsList.length) return state.productsList;

    try {
      const result = await model.loadProducts();
      const products = Array.isArray(result) ? result : (result?.products || []);
      state.productsList = products || [];
      state.forecastMap = Array.isArray(result) ? {} : (result?.forecastMap || {});
      return state.productsList;
    } catch (e) {
      console.warn("ensureProductsList error:", e);
      state.productsList = [];
      state.forecastMap = {};
      return [];
    }
  }

  function getTypeLabel(tipo) {
    switch (String(tipo || "").toLowerCase()) {
      case "insumo": return "Insumo";
      case "botella": return "Botella";
      case "trago_preparado": return "Trago preparado";
      case "servicio": return "Servicio";
      default: return "Producto";
    }
  }

  function renderProductOptions(selectedId = "") {
    return (state.productsList || [])
      .map((p) => {
        const selected = String(p.id) === String(selectedId) ? "selected" : "";
        return `<option value="${escapeHtml(p.id)}" ${selected}>${escapeHtml(p.nombre)} (${getTypeLabel(p.tipo_producto)})</option>`;
      })
      .join("");
  }

  function renderStats(products) {
    const total = (products || []).length;
    const totalValue = (products || []).reduce(
      (acc, it) => acc + (Number(it.stock || 0) * Number(it.precio || 0)),
      0
    );

    if (el.totalProductsCard) el.totalProductsCard.textContent = total;
    if (el.totalValueCard) el.totalValueCard.textContent = formatCurrency(totalValue);

    if (el.lowStockCard) {
      el.lowStockCard.textContent = (products || []).filter((p) => Number(p.stock || 0) <= model.LOW_STOCK_THRESHOLD).length;
    }
  }

  function renderLowStock(products) {
    if (!el.lowStockPanel) return;

    const low = (products || []).filter((p) => Number(p.stock || 0) <= model.LOW_STOCK_THRESHOLD);

    if (!low.length) {
      el.lowStockPanel.style.display = "none";
      el.lowStockPanel.innerHTML = "";
      return;
    }

    el.lowStockPanel.style.display = "block";
    el.lowStockPanel.innerHTML = "";

    low.forEach((p) => {
      const div = document.createElement("div");
      div.className = "low-stock-item";
      div.innerHTML = `<strong>${escapeHtml(p.nombre || "")}</strong> - ${formatDecimal(p.stock)}`;
      el.lowStockPanel.appendChild(div);
    });
  }

  function filterTable(query) {
    if (!el.tbody) return;

    query = (query || "").toLowerCase();
    const rows = Array.from(el.tbody.querySelectorAll("tr"));

    rows.forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (!cells.length) return;

      const text = Array.from(cells)
        .slice(0, 5)
        .map((c) => c.textContent.toLowerCase())
        .join(" ");

      row.style.display = (!query || text.includes(query)) ? "" : "none";
    });
  }

  function buildProductRow(p, forecastMap) {
    const tr = document.createElement("tr");

    const tdName = document.createElement("td");
    tdName.textContent = p.nombre || "-";
    tr.appendChild(tdName);

    const tdType = document.createElement("td");
    tdType.textContent = getTypeLabel(p.tipo_producto);
    tr.appendChild(tdType);

    const tdStock = document.createElement("td");
    tdStock.textContent = formatDecimal(p.stock || 0);
    tr.appendChild(tdStock);

    const tdPrice = document.createElement("td");
    tdPrice.textContent = formatCurrency(p.precio || 0);
    tr.appendChild(tdPrice);

    const tdSuggested = document.createElement("td");
    const forecast = model.getSuggestionForProduct(p.id, p.stock, forecastMap);
    const tooltip = buildForecastTooltip(forecast);

    if (forecast.suggested > 0) {
      tdSuggested.innerHTML = `<span class="badge badge-danger" title="${escapeHtml(tooltip)}">${forecast.suggested}</span>`;
    } else if (forecast.soldThisMonth > 0) {
      tdSuggested.innerHTML = `<span class="badge badge-success" title="${escapeHtml(tooltip)}">OK</span>`;
    } else {
      tdSuggested.innerHTML = `<span class="badge badge-success" title="Sin ventas registradas este mes">OK</span>`;
    }

    tr.appendChild(tdSuggested);

    const tdActions = document.createElement("td");

    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.textContent = "Editar";
    styleBtn(btnEdit, "edit");
    btnEdit.addEventListener("click", () => openEditProductModal(p));
    tdActions.appendChild(btnEdit);

    const btnRecipe = document.createElement("button");
    btnRecipe.type = "button";
    btnRecipe.textContent = "Receta";
    styleBtn(btnRecipe, "recipe");
    btnRecipe.addEventListener("click", () => openRecipeModalByProduct(p));
    tdActions.appendChild(btnRecipe);

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.textContent = "Desactivar";
    styleBtn(btnDel, "delete");

    if (isAdminRole(state.currentRole)) {
      btnDel.addEventListener("click", () => confirmDeleteProduct(p));
    } else {
      btnDel.disabled = true;
      btnDel.title = "Solo administrador puede desactivar productos";
    }
    tdActions.appendChild(btnDel);

    const btnMov = document.createElement("button");
    btnMov.type = "button";
    btnMov.textContent = "Mov.";
    styleBtn(btnMov, "mov");
    btnMov.addEventListener("click", () => showMovementHistory(p.id));
    tdActions.appendChild(btnMov);

    tr.appendChild(tdActions);
    return tr;
  }

  function renderProductsTable(products, forecastMap) {
    if (!el.tbody) return;

    el.tbody.innerHTML = "";

    if (!products || products.length === 0) {
      el.tbody.innerHTML = "<tr><td colspan='6'>No hay productos registrados.</td></tr>";
      return;
    }

    products.forEach((p) => {
      el.tbody.appendChild(buildProductRow(p, forecastMap));
    });

    filterTable(el.searchInput ? el.searchInput.value.trim().toLowerCase() : "");
  }

  async function refreshInventory() {
    try {
      const result = await model.loadProducts();
      const products = Array.isArray(result) ? result : (result?.products || []);
      state.productsList = products || [];
      state.forecastMap = Array.isArray(result) ? {} : (result?.forecastMap || {});
      renderProductsTable(state.productsList, state.forecastMap);
      renderLowStock(state.productsList);
      renderStats(state.productsList);
    } catch (e) {
      console.error("refreshInventory error:", e);
      notifyError("Error cargando inventario.");
    }
  }

  async function loadRecipeProductsList() {
    try {
      await ensureProductsList();
      state.recipeProducts = (state.productsList || []).filter((p) => String(p.tipo_producto || "").toLowerCase() !== "servicio");
      return state.recipeProducts;
    } catch (e) {
      console.warn("loadRecipeProductsList error:", e);
      state.recipeProducts = state.productsList || [];
      return state.recipeProducts;
    }
  }

  async function refreshRecipes() {
    try {
      const rows = await model.getRecipes();
      state.recipesList = rows || [];
      renderRecipesTable(state.recipesList);
    } catch (e) {
      console.error("refreshRecipes error:", e);
      notifyError("No se pudieron cargar las recetas.");
    }
  }

  function renderRecipesTable(recipes) {
    if (!el.recetasTbody) return;

    el.recetasTbody.innerHTML = "";

    if (!recipes || recipes.length === 0) {
      el.recetasTbody.innerHTML = "<tr><td colspan='3'>No hay recetas registradas.</td></tr>";
      return;
    }

    recipes.forEach((r) => {
      const tr = document.createElement("tr");

      const tdNombre = document.createElement("td");
      tdNombre.textContent = r.nombre || "-";
      tr.appendChild(tdNombre);

      const tdDesc = document.createElement("td");
      const producto = r.producto_nombre || "-";
      const rendimiento = Number(r.rendimiento || 1).toFixed(3);
      const estado = r.activa ? "Activa" : "Inactiva";
      tdDesc.textContent = `${r.descripcion || "-"} | Producto: ${producto} | Rendimiento: ${rendimiento} | ${estado}`;
      tr.appendChild(tdDesc);

      const tdActions = document.createElement("td");

      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.textContent = "Editar";
      styleBtn(btnEdit, "edit");
      btnEdit.addEventListener("click", () => openRecipeEditor({ recipe: r }));
      tdActions.appendChild(btnEdit);

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.textContent = "Eliminar";
      styleBtn(btnDel, "delete");
      btnDel.addEventListener("click", () => confirmDeleteRecipe(r));
      tdActions.appendChild(btnDel);

      tr.appendChild(tdActions);
      el.recetasTbody.appendChild(tr);
    });
  }

  function renderRecipeIngredientOptions(selectedValue = "") {
    return (state.recipeProducts || [])
      .map((p) => {
        const selected = String(p.id) === String(selectedValue) ? "selected" : "";
        return `<option value="${escapeHtml(p.id)}" ${selected}>${escapeHtml(p.nombre)} (${getTypeLabel(p.tipo_producto)})</option>`;
      })
      .join("");
  }

  function makeIngredientRow(detail = {}) {
    const row = document.createElement("div");
    row.className = "recipe-row";

    row.innerHTML = `
      <select class="recipe-insumo">
        <option value="">Seleccione ingrediente...</option>
        ${renderRecipeIngredientOptions(detail.insumo_id || "")}
      </select>
      <input class="recipe-cantidad" type="number" step="0.001" min="0" value="${Number(detail.cantidad || 0)}" placeholder="Cantidad">
      <input class="recipe-desperdicio" type="number" step="0.001" min="0" value="${Number(detail.desperdicio || 0)}" placeholder="Desperdicio">
      <button type="button" class="btn-remove-row">X</button>
    `;

    row.querySelector(".btn-remove-row").addEventListener("click", () => row.remove());
    return row;
  }

  async function openRecipeEditor({ product = null, recipe = null } = {}) {
    if (typeof Swal === "undefined") {
      notifyError("SweetAlert2 no está disponible.");
      return;
    }

    await loadRecipeProductsList();
    await ensureProductsList();

    let currentRecipe = recipe || null;

    if (!currentRecipe && product?.id) {
      try {
        currentRecipe = await model.getRecipeByProductId(product.id);
      } catch (e) {
        console.warn("No se pudo cargar receta por producto:", e);
      }
    }

    const linkedProductId = currentRecipe?.producto_id || product?.id || "";
    const linkedProductName =
      product?.nombre ||
      state.productsList.find((p) => String(p.id) === String(linkedProductId))?.nombre ||
      currentRecipe?.producto_nombre ||
      "Producto final";

    let existingDetails = [];
    if (currentRecipe?.id) {
      try {
        existingDetails = await model.getRecipeDetails(currentRecipe.id);
      } catch (e) {
        console.warn("No se pudo cargar detalle de receta:", e);
      }
    }

    if (!linkedProductId) {
      notifyError("No se pudo detectar el producto final de la receta.");
      return;
    }

    const html = `
      <div class="inventory-swal-form">
        <div class="modal-label">Producto final: ${escapeHtml(linkedProductName)}</div>

        <label>Nombre de receta</label>
        <input id="swal-recipe-name" class="swal2-input" value="${escapeHtml(currentRecipe?.nombre || linkedProductName || "")}">

        <label>Descripción</label>
        <textarea id="swal-recipe-desc" class="swal2-textarea">${escapeHtml(currentRecipe?.descripcion || "")}</textarea>

        <label>Rendimiento</label>
        <input id="swal-recipe-rendimiento" type="number" step="0.001" min="0.001" class="swal2-input" value="${Number(currentRecipe?.rendimiento || 1)}">

        <label style="display:flex; gap:8px; align-items:center;">
          <input id="swal-recipe-activa" type="checkbox" ${currentRecipe?.activa === false ? "" : "checked"}>
          Activa
        </label>

        <div class="modal-label" style="margin-top:6px;">Ingredientes</div>
        <div id="recipe-details" class="recipe-details"></div>
        <button type="button" id="btn-add-recipe-row" class="btn-add-row">Agregar ingrediente</button>
      </div>
    `;

    const result = await Swal.fire({
      title: currentRecipe ? "Editar receta" : "Nueva receta",
      html,
      width: "min(92vw, 760px)",
      customClass: { popup: "inventory-swal-popup" },
      showCancelButton: true,
      confirmButtonText: currentRecipe ? "Actualizar receta" : "Crear receta",
      didOpen: () => {
        const container = document.getElementById("recipe-details");
        const addBtn = document.getElementById("btn-add-recipe-row");

        if (!container || !addBtn) return;

        const initialRows = existingDetails.length ? existingDetails : [null];
        initialRows.forEach((d) => container.appendChild(makeIngredientRow(d || {})));

        addBtn.addEventListener("click", () => {
          container.appendChild(makeIngredientRow({ cantidad: 0, desperdicio: 0 }));
        });
      },
      preConfirm: () => {
        const nombre = document.getElementById("swal-recipe-name")?.value.trim() || "";
        const descripcion = document.getElementById("swal-recipe-desc")?.value.trim() || "";
        const rendimiento = Number(document.getElementById("swal-recipe-rendimiento")?.value || 0) || 0;
        const activa = Boolean(document.getElementById("swal-recipe-activa")?.checked);
        const rows = Array.from(document.querySelectorAll("#recipe-details .recipe-row"));

        const detalles = rows
          .map((row) => ({
            insumo_id: row.querySelector(".recipe-insumo")?.value || "",
            cantidad: Number(row.querySelector(".recipe-cantidad")?.value || 0) || 0,
            desperdicio: Number(row.querySelector(".recipe-desperdicio")?.value || 0) || 0
          }))
          .filter((d) => d.insumo_id);

        return { nombre, descripcion, rendimiento, activa, detalles };
      }
    });

    if (!result.isConfirmed || !result.value) return;

    const { nombre, descripcion, rendimiento, activa, detalles } = result.value;

    if (!nombre) {
      notifyError("El nombre de la receta es obligatorio.");
      return;
    }

    if (rendimiento <= 0) {
      notifyError("El rendimiento debe ser mayor que cero.");
      return;
    }

    if (!detalles.length) {
      notifyError("Agrega al menos un ingrediente.");
      return;
    }

    for (const d of detalles) {
      if (!d.insumo_id || d.cantidad <= 0) {
        notifyError("Cada ingrediente debe tener producto y cantidad válida.");
        return;
      }
    }

    try {
      const ctx = typeof model.getContext === "function" ? model.getContext() : {};

      const recipePayload = {
        recetas_id: currentRecipe?.recetas_id || currentRecipe?.id || undefined,
        sucursal_id: currentRecipe?.sucursal_id || product?.sucursal_id || ctx.sucursalId,
        producto_id: linkedProductId,
        nombre,
        descripcion,
        rendimiento,
        activa
      };

      const savedRecipe = typeof model.saveRecipeWithDetails === "function"
        ? await model.saveRecipeWithDetails(recipePayload, detalles)
        : await model.upsertRecipe(recipePayload);

      if (!savedRecipe?.id) throw new Error("No se pudo guardar la receta.");

      if (typeof model.saveRecipeWithDetails !== "function") {
        await model.replaceRecipeDetails(savedRecipe.id, detalles);
        await model.linkPreparedProduct(linkedProductId, savedRecipe.id);
      }

      notifySuccess("Receta guardada");
      await refreshRecipes();
      await refreshInventory();
    } catch (e) {
      console.error("Error guardando receta:", e);
      notifyError("No se pudo guardar la receta.");
    }
  }

  async function openRecipeModalByProduct(product) {
    if (!product || !product.id) return;
    await openRecipeEditor({ product });
  }

  async function confirmDeleteRecipe(recipe) {
    if (!recipe || !recipe.id) return;

    const res = typeof Swal === "undefined"
      ? { isConfirmed: confirm(`¿Eliminar la receta "${recipe.nombre}"? Esta acción no se puede deshacer.`) }
      : await Swal.fire({
          title: `Eliminar receta "${escapeHtml(recipe.nombre || "")}"?`,
          text: "Esta acción no se puede deshacer.",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Sí, eliminar",
          cancelButtonText: "Cancelar"
        });

    if (!res.isConfirmed) return;

    try {
      await model.deleteRecipe(recipe.id);
      notifySuccess("Receta eliminada");
      await refreshRecipes();
      await refreshInventory();
    } catch (e) {
      console.error("Error eliminando receta:", e);
      notifyError("No se pudo eliminar la receta.");
    }
  }

  async function openAddProductModal() {
    if (typeof Swal === "undefined") {
      notifyError("SweetAlert2 no está disponible.");
      return;
    }

    await ensureProductsList();

    const ctx = typeof model.getContext === "function" ? model.getContext() : {};

    const result = await Swal.fire({
      title: "Nuevo producto / Agregar stock",
      html: `
        <div class="inventory-swal-form">
          <label>Modo</label>
          <select id="swal-product-mode" class="swal2-input">
            <option value="new">Nuevo producto</option>
            <option value="existing">Agregar stock a existente</option>
          </select>

          <div id="existing-product-wrap" style="display:none;">
            <label>Producto existente</label>
            <select id="swal-existing-product" class="swal2-input">
              <option value="">Seleccione...</option>
              ${renderProductOptions("")}
            </select>
          </div>

          <label>Nombre</label>
          <input id="swal-nombre" class="swal2-input" placeholder="Nombre">

          <label>Tipo</label>
          <select id="swal-tipo" class="swal2-input">
            <option value="insumo">Insumo</option>
            <option value="botella">Botella</option>
            <option value="trago_preparado">Trago preparado</option>
            <option value="servicio">Servicio</option>
          </select>

          <label>Unidad de medida</label>
          <input id="swal-unidad" class="swal2-input" placeholder="Unidad de medida" value="unidad">

          <label id="swal-stock-label">Stock inicial</label>
          <input id="swal-stock" type="number" step="0.001" class="swal2-input" placeholder="Stock inicial" value="0" min="0">

          <label>Precio</label>
          <input id="swal-precio" type="number" step="0.01" class="swal2-input" placeholder="Precio" value="0">

          <label>Costo promedio</label>
          <input id="swal-costo" type="number" step="0.01" class="swal2-input" placeholder="Costo promedio" value="0">
        </div>
      `,
      focusConfirm: false,
      customClass: { popup: "inventory-swal-popup" },
      width: "min(92vw, 760px)",
      showCancelButton: true,
      confirmButtonText: "Guardar",
      didOpen: () => {
        const modeSelect = document.getElementById("swal-product-mode");
        const existingWrap = document.getElementById("existing-product-wrap");
        const existingSelect = document.getElementById("swal-existing-product");
        const nombre = document.getElementById("swal-nombre");
        const tipo = document.getElementById("swal-tipo");
        const unidad = document.getElementById("swal-unidad");
        const stock = document.getElementById("swal-stock");
        const precio = document.getElementById("swal-precio");
        const costo = document.getElementById("swal-costo");
        const stockLabel = document.getElementById("swal-stock-label");

        const fillFromProduct = (product) => {
          if (!product) return;

          nombre.value = product.nombre || "";
          tipo.value = product.tipo_producto || "insumo";
          unidad.value = product.unidad_medida || "unidad";
          precio.value = Number(product.precio || 0);
          costo.value = Number(product.costo_promedio || 0);
          stock.value = 0;
          stockLabel.textContent = "Cantidad a agregar";
        };

        const resetForNew = () => {
          nombre.value = "";
          tipo.value = "insumo";
          unidad.value = "unidad";
          precio.value = 0;
          costo.value = 0;
          stock.value = 0;
          stockLabel.textContent = "Stock inicial";
        };

        const syncMode = () => {
          const mode = modeSelect?.value || "new";
          if (existingWrap) existingWrap.style.display = mode === "existing" ? "block" : "none";
          stockLabel.textContent = mode === "existing" ? "Cantidad a agregar" : "Stock inicial";

          if (mode === "new") {
            if (!existingSelect?.value) {
              resetForNew();
            }
          }
        };

        if (modeSelect) {
          modeSelect.addEventListener("change", syncMode);
        }

        if (existingSelect) {
          existingSelect.addEventListener("change", () => {
            const productId = existingSelect.value;
            const product = state.productsList.find((p) => String(p.id) === String(productId));
            if (product) {
              fillFromProduct(product);
              if (modeSelect) modeSelect.value = "existing";
              syncMode();
            }
          });
        }

        syncMode();
      },
      preConfirm: () => ({
        mode: document.getElementById("swal-product-mode")?.value || "new",
        existing_product_id: document.getElementById("swal-existing-product")?.value || "",
        nombre: document.getElementById("swal-nombre")?.value.trim() || "",
        tipo_producto: document.getElementById("swal-tipo")?.value || "insumo",
        unidad_medida: document.getElementById("swal-unidad")?.value.trim() || "unidad",
        stock: Number(document.getElementById("swal-stock")?.value || 0) || 0,
        precio: Number(document.getElementById("swal-precio")?.value || 0) || 0,
        costo_promedio: Number(document.getElementById("swal-costo")?.value || 0) || 0
      })
    });

    if (!result.isConfirmed || !result.value) return;

    const v = result.value;

    try {
      if (v.mode === "existing" && v.existing_product_id) {
        const existing = state.productsList.find((p) => String(p.id) === String(v.existing_product_id));

        if (!existing) {
          notifyError("No se encontró el producto existente.");
          return;
        }

        if (v.stock <= 0) {
          notifyError("Debes indicar una cantidad mayor que cero para agregar stock.");
          return;
        }

        const updatedPayload = {
          nombre: v.nombre || existing.nombre,
          precio: Number(v.precio || existing.precio || 0),
          costo_promedio: Number(v.costo_promedio || existing.costo_promedio || 0),
          tipo_producto: v.tipo_producto
        };

        await model.updateProduct(existing.id, updatedPayload);

        await model.registerStockMovement({
          producto_id: existing.id,
          tipo: "entrada",
          cantidad: Number(v.stock),
          costo: Number(v.costo_promedio || existing.costo_promedio || 0),
          observacion: "Ingreso manual de stock"
        });

        if (String(v.tipo_producto).toLowerCase() === "insumo") {
          await model.upsertInsumoProduct(existing.id, v.unidad_medida || "unidad");
        }

        notifySuccess("Stock agregado");
        await refreshInventory();
        return;
      }

      if (!v.nombre) {
        notifyError("Nombre requerido.");
        return;
      }

      if (v.stock < 0 || v.precio < 0 || v.costo_promedio < 0) {
        notifyError("Valores numéricos inválidos.");
        return;
      }

      const payload = {
        sucursal_id: ctx.sucursalId || null,
        nombre: v.nombre,
        tipo_producto: v.tipo_producto,
        unidad_medida: v.unidad_medida,
        stock: v.stock,
        precio: v.precio,
        costo_promedio: v.costo_promedio,
        activo: true
      };

      const data = await model.createProduct(payload);

      if (String(v.tipo_producto).toLowerCase() === "insumo") {
        await model.upsertInsumoProduct(data.id, v.unidad_medida || "unidad");
      }

      notifySuccess("Producto creado");

      if (String(v.tipo_producto).toLowerCase() === "trago_preparado") {
        await openRecipeModalByProduct(data);
      }

      await refreshInventory();
    } catch (e) {
      console.error("Error guardando producto:", e);
      notifyError("No se pudo guardar el producto.");
    }
  }

  async function openEditProductModal(product) {
    if (!product || !product.id) return;

    if (typeof Swal === "undefined") {
      notifyError("SweetAlert2 no está disponible.");
      return;
    }

    const originalStock = Number(product.stock || 0);

    const result = await Swal.fire({
      title: `Editar producto: ${escapeHtml(product.nombre || "")}`,
      html: `
        <div class="inventory-swal-form">
          <label>Nombre</label>
          <input id="swal-edit-nombre" class="swal2-input" placeholder="Nombre" value="${escapeHtml(product.nombre || "")}">

          <label>Stock objetivo</label>
          <input id="swal-edit-stock" type="number" step="0.001" class="swal2-input" placeholder="Stock objetivo" value="${formatDecimal(product.stock || 0)}">

          <label>Precio</label>
          <input id="swal-edit-precio" type="number" step="0.01" class="swal2-input" placeholder="Precio" value="${Number(product.precio || 0)}">

          <label>Costo promedio</label>
          <input id="swal-edit-costo" type="number" step="0.01" class="swal2-input" placeholder="Costo promedio" value="${Number(product.costo_promedio || 0)}">

          <label style="display:flex; gap:8px; align-items:center;">
            <input id="swal-edit-activo" type="checkbox" ${product.activo === false ? "" : "checked"}>
            Activo
          </label>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Actualizar",
      cancelButtonText: "Cancelar",
      customClass: { popup: "inventory-swal-popup" },
      width: "min(92vw, 760px)"
    });

    if (!result.isConfirmed) return;

    const nombre = document.getElementById("swal-edit-nombre").value.trim();
    const stock = Number(document.getElementById("swal-edit-stock").value);
    const precio = Number(document.getElementById("swal-edit-precio").value);
    const costo_promedio = Number(document.getElementById("swal-edit-costo").value);
    const activo = Boolean(document.getElementById("swal-edit-activo").checked);

    try {
      await model.updateProduct(product.id, {
        nombre,
        precio,
        costo_promedio,
        activo
      });

      const delta = stock - originalStock;
      if (Math.abs(delta) > 0.0001) {
        await model.registerStockMovement({
          producto_id: product.id,
          tipo: delta >= 0 ? "entrada" : "salida",
          cantidad: Math.abs(delta),
          costo: costo_promedio,
          observacion: "Ajuste manual de stock"
        });
      }

      notifySuccess("Producto actualizado");
      await refreshInventory();
    } catch (e) {
      console.error("Error actualizando producto:", e);
      notifyError("Error actualizando producto");
    }
  }

  async function confirmDeleteProduct(product) {
    if (!product || !product.id) return;

    if (typeof Swal === "undefined") {
      if (!confirm(`Desactivar ${product.nombre || product.name}? Esta acción no se puede deshacer.`)) return;
    } else {
      const res = await Swal.fire({
        title: `Desactivar "${escapeHtml(product.nombre || product.name || "")}"?`,
        text: "Se desactivará el producto, pero se conservará su historial.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, desactivar",
        cancelButtonText: "Cancelar"
      });
      if (!res.isConfirmed) return;
    }

    try {
      await model.deleteProduct(product.id);
      notifySuccess("Producto desactivado");
      await refreshInventory();
    } catch (e) {
      console.error("Error desactivando producto:", e);
      notifyError("No se pudo desactivar producto.");
    }
  }

  async function showMovementHistory(productId) {
    try {
      const data = await model.getMovementHistory(productId);

      const rowsHtml = (data || []).map((m) => {
        let action = "—";
        if (m.tipo === "entrada") action = "Ingreso de stock";
        if (m.tipo === "salida") action = "Salida de stock";
        if (m.tipo === "ajuste") action = "Ajuste manual";
        if (m.tipo === "consumo_receta") action = "Consumo por receta";
        if (m.tipo === "merma") action = "Merma";

        const usuario = m.usuarios?.nombre || "Sistema";
        const fecha = m.created_at ? new Date(m.created_at).toLocaleString() : "-";
        const obs = m.observacion || "";
        const referencia = m.referencia_tipo ? `${m.referencia_tipo}${m.referencia_id ? ` (${m.referencia_id})` : ""}` : "-";

        return `
          <tr>
            <td>${escapeHtml(action)}</td>
            <td>${escapeHtml(usuario)}</td>
            <td>${formatDecimal(m.cantidad || 0)}</td>
            <td>${formatCurrency(m.costo || 0)}</td>
            <td>${escapeHtml(referencia)}</td>
            <td>${escapeHtml(obs)}</td>
            <td>${escapeHtml(fecha)}</td>
          </tr>
        `;
      }).join("");

      const html = `
        <div class="movement-history-wrap">
          <table class="movement-history-table">
            <thead>
              <tr>
                <th>Acción</th>
                <th>Usuario</th>
                <th>Cantidad</th>
                <th>Costo</th>
                <th>Referencia</th>
                <th>Obs.</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || "<tr><td colspan='7'>No hay movimientos</td></tr>"}
            </tbody>
          </table>
        </div>
      `;

      await Swal.fire({
        title: "Movimientos recientes",
        html,
        width: "min(96vw, 1100px)",
        customClass: { popup: "inventory-swal-popup" }
      });
    } catch (e) {
      console.error("showMovementHistory error:", e);
      notifyError("Error mostrando movimientos.");
    }
  }

  function initQRButton() {
    if (!el.btnDescargarQr || !el.qrContainer) return;

    el.btnDescargarQr.addEventListener("click", async () => {
      try {
        const ctx = typeof model.getContext === "function" ? model.getContext() : {};
        const text = ctx.empresaNombre || String(ctx.empresaId || ctx.userName || "");

        if (!text) {
          notifyError("No hay empresa asignada para generar QR.");
          return;
        }

        el.qrContainer.innerHTML = "";

        if (typeof QRCode === "function") {
          new QRCode(el.qrContainer, { text, width: 300, height: 300 });
        } else {
          notifyError("Biblioteca QR no encontrada.");
          return;
        }

        setTimeout(() => {
          const img = el.qrContainer.querySelector("img");
          let href = null;

          if (img && img.src) href = img.src;
          else {
            const canvas = el.qrContainer.querySelector("canvas");
            if (canvas && typeof canvas.toDataURL === "function") href = canvas.toDataURL("image/png");
          }

          if (!href) {
            el.qrContainer.innerHTML = "";
            return notifyError("No se pudo generar imagen del QR");
          }

          const a = document.createElement("a");
          a.href = href;
          a.download = sanitizeFileName(ctx.empresaNombre || ctx.empresaId || "qr") + ".png";
          document.body.appendChild(a);
          a.click();
          a.remove();

          el.qrContainer.innerHTML = "";
        }, 150);
      } catch (e) {
        console.error("Error generando QR:", e);
        notifyError("Error generando QR.");
      }
    });
  }

  function initMenu() {
    if (!el.menuToggle || !el.navLinks) return;

    el.menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      el.navLinks.classList.toggle("active");
    });

    const itemsMenu = el.navLinks.querySelectorAll("a, button");
    itemsMenu.forEach((item) => {
      item.addEventListener("click", () => {
        el.navLinks.classList.remove("active");
      });
    });

    document.addEventListener("click", (e) => {
      if (!el.navLinks.contains(e.target) && !el.menuToggle.contains(e.target)) {
        el.navLinks.classList.remove("active");
      }
    });
  }

  function initDateDefaults() {
    const sem = getWeekRange();

    const fechaInicioA = document.getElementById("fechaInicioa");
    const fechaFina = document.getElementById("fechaFina");
    const fechaInicio = document.getElementById("fechaInicio");
    const fechaFin = document.getElementById("fechaFin");

    if (fechaInicioA && !fechaInicioA.value) fechaInicioA.value = sem.inicio;
    if (fechaFina && !fechaFina.value) fechaFina.value = sem.fin;
    if (fechaInicio && !fechaInicio.value) fechaInicio.value = sem.inicio;
    if (fechaFin && !fechaFin.value) fechaFin.value = sem.fin;
  }

  function initFilters() {
    const fechaInicioA = document.getElementById("fechaInicioa");
    const fechaFina = document.getElementById("fechaFina");
    const fechaInicio = document.getElementById("fechaInicio");
    const fechaFin = document.getElementById("fechaFin");

    const filtrarA = document.getElementById("filtrarA");
    if (filtrarA) {
      filtrarA.addEventListener("click", () => {
        const inicio = fechaInicioA ? fechaInicioA.value : "";
        const fin = fechaFina ? fechaFina.value : "";

        if (!inicio || !fin) {
          alert("Selecciona ambas fechas para filtrar");
          return;
        }

        if (typeof global.cargarAsistencias === "function") {
          filtrarA.disabled = true;
          global.cargarAsistencias(inicio, fin).finally(() => {
            filtrarA.disabled = false;
          });
        }
      });
    }

    const filtrarPlanillaBtn = document.getElementById("filtrar");
    if (filtrarPlanillaBtn) {
      filtrarPlanillaBtn.addEventListener("click", () => {
        const inicio = fechaInicio ? fechaInicio.value : "";
        const fin = fechaFin ? fechaFin.value : "";

        if (!inicio || !fin) {
          alert("Selecciona ambas fechas para filtrar la planilla");
          return;
        }

        if (typeof global.mostrarPlanilla === "function") {
          filtrarPlanillaBtn.disabled = true;
          Promise.resolve(global.mostrarPlanilla()).finally(() => {
            filtrarPlanillaBtn.disabled = false;
          });
        }
      });
    }
  }

  function initRecipesSection() {
    if (el.btnRecetas) {
      styleBtn(el.btnRecetas, "outline");
      el.btnRecetas.addEventListener("click", async () => {
        state.recipesVisible = !state.recipesVisible;

        if (el.recetasPanel) {
          el.recetasPanel.style.display = state.recipesVisible ? "block" : "none";
        }

        if (state.recipesVisible) {
          await refreshRecipes();
        }
      });
    }
  }

  async function performLogout(reason = "logout") {
    try {
      console.log(`[inventory.controller] Logout: ${reason}`);

      if (typeof global.logout === "function") {
        await global.logout();
        return;
      }

      if (global.AuthModel && typeof global.AuthModel.signOut === "function") {
        await global.AuthModel.signOut();
        return;
      }

      if (supabase?.auth?.signOut) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error("performLogout error:", error);
    } finally {
      window.location.replace("index.html");
    }
  }

  async function resolveRole(uid, mergedUser) {
    let role = normalizeRole(mergedUser?.role || "");

    if (!role && global.AuthModel && typeof global.AuthModel.getUserRole === "function") {
      try {
        role = normalizeRole(await global.AuthModel.getUserRole(uid));
      } catch (e) {
        console.warn("No se pudo obtener rol desde AuthModel.getUserRole:", e);
      }
    }

    if (!role && typeof global.getClaim === "function") {
      try {
        role = normalizeRole(await global.getClaim("role", ""));
      } catch (e) {
        console.warn("No se pudo obtener rol desde getClaim:", e);
      }
    }

    return role;
  }

  async function bootstrap() {
    try {
      const uid = await getSessionUid();

      if (!uid) {
        await performLogout("no-session");
        return;
      }

      const userData = await loadCurrentUser(uid);
      const fallback = typeof model.bootstrapAuth === "function" ? await model.bootstrapAuth() : null;
      const mergedUser = userData || fallback || null;

      if (!mergedUser) {
        await performLogout("user-not-found");
        return;
      }

      const role = await resolveRole(uid, mergedUser);

      if (!isAdminRole(role)) {
        console.log("[inventory.controller] Usuario sin permisos de administrador", {
          uid,
          role,
          mergedUser
        });
        alert("No tienes permisos de administrador.");
        await performLogout("not-admin");
        return;
      }

      mergedUser.role = role || "admin";
      applyModelContext(mergedUser, uid);

      if (el.btnLogout) {
        el.btnLogout.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await performLogout("logout-click");
        });
      }

      if (el.searchInput) {
        el.searchInput.addEventListener("input", () => {
          filterTable(el.searchInput.value.trim().toLowerCase());
        });
      }

      if (el.btnAdd) {
        el.btnAdd.addEventListener("click", openAddProductModal);
      }

      initQRButton();
      initMenu();
      initDateDefaults();
      initFilters();
      initRecipesSection();

      await refreshInventory();
      await refreshRecipes();
    } catch (error) {
      console.error("inventory.controller bootstrap error:", error);
      await performLogout("bootstrap-error");
    }
  }

  document.addEventListener("DOMContentLoaded", bootstrap);

  global.inventoryController = {
    refreshInventory,
    refreshRecipes,
    openAddProductModal,
    openEditProductModal,
    confirmDeleteProduct,
    showMovementHistory,
    openRecipeModalByProduct,
    openRecipeEditor,
    confirmDeleteRecipe
  };
})(window);