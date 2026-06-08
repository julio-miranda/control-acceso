// js/controllers/sales.controller.js
(function (global) {
  "use strict";

  function getSupabase() {
    if (!global.supabase) {
      throw new Error("Supabase no inicializado.");
    }
    return global.supabase;
  }

  const AuthModel = global.AuthModel || null;

  const state = {
    productsCache: {},
    productsByRealId: {},
    cart: [],
    usersCache: {},
    currentUser: null,
    productsChannel: null,
    salesChannel: null
  };

  const currency = (n) => `$${Number(n || 0).toFixed(2)}`;

  function logError(context, error, extra = {}) {
    console.log(`[SalesModel] ${context}`, {
      message: error?.message,
      error,
      ...extra
    });
  }

  function logInfo(context, data = {}) {
    console.log(`[SalesModel] ${context}`, data);
  }

  function getValue(obj, keys, fallback = "") {
    if (!obj) return fallback;
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
    }
    return fallback;
  }

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;

    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (value && typeof value === "object" && value.seconds) {
      const d = new Date(value.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof value?.toDate === "function") {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }

    return null;
  }

  function parseDate(value) {
    return toDate(value);
  }

  function dateOnly(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getTodayStart() {
    return dateOnly(new Date());
  }

  function getTomorrowStart() {
    const d = getTodayStart();
    d.setDate(d.getDate() + 1);
    return d;
  }

  function getMonthStart(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  function getNextMonthStart(date = new Date()) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
  }

  function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getNextWeekStart(date = new Date()) {
    const d = getWeekStart(date);
    d.setDate(d.getDate() + 7);
    return d;
  }

  function toIso(value) {
    const d = toDate(value);
    return d ? d.toISOString() : null;
  }

  function getProductByKey(productId) {
    const key = String(productId || "");
    return state.productsCache[key] || state.productsByRealId[key] || null;
  }

  function normalizeProduct(row, extra = {}) {
    const id = getValue(row, ["id"], null);
    const productoIdReal = getValue(row, ["producto_id"], id);

    return {
      id: String(id || ""),
      producto_id: String(productoIdReal || ""),
      nombre: String(getValue(row, ["nombre", "name", "producto", "descripcion"], "Sin nombre")),
      tipo_producto: String(getValue(extra, ["tipo_producto"], getValue(row, ["tipo_producto"], "insumo"))),
      categoria_venta: String(getValue(extra, ["categoria_venta"], getValue(row, ["categoria_venta"], "Producto individual"))),
      unidad_medida: String(getValue(extra, ["unidad_medida"], getValue(row, ["unidad_medida"], "unidad"))),
      stock: Number(getValue(extra, ["stock"], getValue(row, ["stock", "cantidad"], 0))) || 0,
      precio: Number(getValue(row, ["precio", "price", "costo"], 0)) || 0,
      costo_promedio: Number(getValue(row, ["costo_promedio"], 0)) || 0,
      activo: Boolean(getValue(row, ["activo"], true)),
      sucursal_id: getValue(row, ["sucursal_id"], null),
      receta_id: getValue(extra, ["receta_id"], getValue(row, ["receta_id"], null)),
      receta_nombre: String(getValue(extra, ["receta_nombre"], getValue(row, ["receta_nombre"], ""))),
      receta_descripcion: String(getValue(extra, ["receta_descripcion"], getValue(row, ["receta_descripcion"], ""))),
      receta_rendimiento: Number(getValue(extra, ["receta_rendimiento"], getValue(row, ["receta_rendimiento"], 0))) || 0,
      receta_activa: Boolean(getValue(extra, ["receta_activa"], getValue(row, ["receta_activa"], true))),
      recipe_details: Array.isArray(extra.recipe_details) ? extra.recipe_details : []
    };
  }

  function normalizeVenta(row) {
    return {
      id: row.id,
      subtotal: Number(getValue(row, ["subtotal"], 0)) || 0,
      descuento: Number(getValue(row, ["descuento"], 0)) || 0,
      impuesto: Number(getValue(row, ["impuesto"], 0)) || 0,
      total: Number(getValue(row, ["total"], 0)) || 0,
      metodo_pago: getValue(row, ["metodo_pago"], "efectivo"),
      estado: getValue(row, ["estado"], "finalizada"),
      observacion: getValue(row, ["observacion"], null),
      usuario_id: getValue(row, ["usuario_id"], null),
      usuario_nombre: getValue(row, ["usuario_nombre"], null),
      cliente_vip_id: getValue(row, ["cliente_vip_id"], null),
      evento_id: getValue(row, ["evento_id"], null),
      created_at: getValue(row, ["created_at"], null),
      kind: getValue(row, ["kind"], null),
      nombre_reserva: getValue(row, ["nombre_reserva"], null),
      usuario_reserva_nombre: getValue(row, ["usuario_reserva_nombre"], null),

      costo_estandar_total: Number(getValue(row, ["costo_estandar_total"], 0)) || 0,
      costo_real_total: Number(getValue(row, ["costo_real_total"], 0)) || 0,

      costo_estandar_unitario: Number(getValue(row, ["costo_estandar_unitario"], 0)) || 0,
      costo_real_unitario: Number(getValue(row, ["costo_real_unitario"], 0)) || 0,

      venta_detalle: Array.isArray(row.venta_detalle) ? row.venta_detalle : []
    };
  }

  function saleDetailText(venta) {
    const detalles = Array.isArray(venta?.venta_detalle) ? venta.venta_detalle : [];

    const baseText = detalles.length
      ? detalles
          .map((d) => {
            const nombreProducto =
              d.productos?.nombre ||
              d.producto_nombre ||
              d.nombre ||
              "Producto";
            return `${nombreProducto} x${Number(d.cantidad || 0)}`;
          })
          .join(", ")
      : "-";

    if (venta?.observacion && String(venta.observacion).trim()) {
      return `${venta.observacion} | ${baseText}`;
    }

    return baseText;
  }

  function saleLabel(venta) {
    if (String(venta?.kind || "").toLowerCase() === "reserva") {
      return venta.nombre_reserva || venta.observacion || "Reserva";
    }
    return saleDetailText(venta);
  }

  function setCurrentUser(user) {
    state.currentUser = user || null;

    if (user) {
      global.adminUser = user;
      global.adminEmpresa = user.empresa_id != null ? String(user.empresa_id) : "";
      global.adminSucursal = user.sucursal_id != null ? String(user.sucursal_id) : "";
    }

    logInfo("setCurrentUser", {
      userId: user?.id || null,
      empresaId: user?.empresa_id || null,
      sucursalId: user?.sucursal_id || null,
      role: user?.role || null
    });

    return state.currentUser;
  }

  function getCurrentUser() {
    return state.currentUser;
  }

  async function getAuthFallbackUser() {
    try {
      if (AuthModel && typeof AuthModel.getCurrentUser === "function") {
        const { user } = await AuthModel.getCurrentUser();
        return user || null;
      }
    } catch (e) {
      console.warn("getAuthFallbackUser:", e);
    }
    return null;
  }

  async function getSessionUid() {
    try {
      if (AuthModel && typeof AuthModel.getCurrentUser === "function") {
        const { user, error } = await AuthModel.getCurrentUser();
        if (!error && user?.id) return user.id;
      }

      if (typeof global.getSessionData === "function") {
        const s = await global.getSessionData();
        if (s && s.uid) return s.uid;
      }

      if (typeof global.checkUserSession === "function") {
        return await new Promise((resolve) => {
          try {
            global.checkUserSession((uid) => resolve(uid || null), { redirectOnFail: false });
          } catch (e) {
            console.warn("checkUserSession error:", e);
            resolve(null);
          }
        });
      }

      return null;
    } catch (e) {
      console.warn("getSessionUid error:", e);
      return null;
    }
  }

  async function fetchManyByIds(table, ids, select = "id", idField = "id") {
    const supabase = getSupabase();
    const unique = [...new Set((ids || []).filter(Boolean))];

    if (!unique.length) return {};

    try {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in(idField, unique);

      if (error) {
        logError(`fetchManyByIds(${table})`, error, { ids: unique, idField });
        return {};
      }

      return Object.fromEntries((data || []).map((row) => [
        row.id ?? row[idField],
        row
      ]));
    } catch (err) {
      logError(`fetchManyByIds(${table})(catch)`, err, { ids: unique, idField });
      return {};
    }
  }

  async function fetchUserFromDBById(uid) {
    const supabase = getSupabase();

    try {
      let { data, error } = await supabase
        .from("v_usuarios")
        .select("id,nombre,email,telefono,direccion,role,sucursal_id,empresa_id,created_at")
        .eq("id", uid)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          nombre: data.nombre || "Usuario",
          email: data.email || null,
          telefono: data.telefono || null,
          direccion: data.direccion || null,
          role: String(data.role || "empleado").toLowerCase(),
          sucursal_id: data.sucursal_id || null,
          empresa_id: data.empresa_id || null,
          created_at: data.created_at || null
        };
      }

      ({ data, error } = await supabase
        .from("usuarios")
        .select("usuarios_id:id,role,sucursal_id,contacto_id,created_at,updated_at")
        .eq("usuarios_id", uid)
        .maybeSingle());

      if (error || !data) return null;

      let contacto = null;
      if (data.contacto_id) {
        const { data: c } = await supabase
          .from("contactos")
          .select("contactos_id:id,nombre,telefono,email,direccion")
          .eq("contactos_id", data.contacto_id)
          .maybeSingle();
        contacto = c || null;
      }

      let sucursal = null;
      if (data.sucursal_id) {
        const { data: s } = await supabase
          .from("sucursales")
          .select("sucursales_id:id,nombre,codigo,empresa_id")
          .eq("sucursales_id", data.sucursal_id)
          .maybeSingle();
        sucursal = s || null;
      }

      return {
        id: uid,
        nombre: contacto?.nombre || "Usuario",
        email: contacto?.email || null,
        telefono: contacto?.telefono || null,
        direccion: contacto?.direccion || null,
        role: String(data.role || "empleado").toLowerCase(),
        sucursal_id: data.sucursal_id || null,
        empresa_id: sucursal?.empresa_id || null,
        created_at: data.created_at || null
      };
    } catch (e) {
      console.error("fetchUserFromDBById:", e);
      return null;
    }
  }

  async function bootstrapAuth() {
    try {
      if (state.currentUser) return state.currentUser;

      const uid = await getSessionUid();
      logInfo("bootstrapAuth: session lookup", { uid });

      if (!uid) {
        const local = JSON.parse(localStorage.getItem("currentUser") || "null");
        if (local) {
          const user = {
            id: local.uid || local.id || null,
            nombre: local.name || local.nombre || local.email || "Usuario",
            role: local.role || "empleado",
            empresa_id: local.empresa_id || null,
            sucursal_id: local.sucursal_id || null,
            email: local.email || null
          };
          logInfo("bootstrapAuth: localStorage fallback", user);
          return setCurrentUser(user);
        }
        return null;
      }

      const userDB = await fetchUserFromDBById(uid);
      if (userDB) {
        logInfo("bootstrapAuth: user from DB", userDB);
        return setCurrentUser(userDB);
      }

      const authUser = await getAuthFallbackUser();
      if (authUser) {
        const user = {
          id: authUser.id || uid,
          nombre:
            authUser.user_metadata?.nombre ||
            authUser.app_metadata?.nombre ||
            authUser.email ||
            "Usuario",
          role: String(
            authUser.app_metadata?.role ||
            authUser.user_metadata?.role ||
            "empleado"
          ).toLowerCase(),
          empresa_id: authUser.app_metadata?.empresa_id || authUser.user_metadata?.empresa_id || null,
          sucursal_id: authUser.app_metadata?.sucursal_id || authUser.user_metadata?.sucursal_id || null,
          email: authUser.email || null
        };
        logInfo("bootstrapAuth: auth fallback", user);
        return setCurrentUser(user);
      }

      const local = JSON.parse(localStorage.getItem("currentUser") || "null");
      if (local && (local.uid === uid || local.email)) {
        const user = {
          id: local.uid || uid,
          nombre: local.name || local.nombre || local.email || "Usuario",
          role: local.role || "empleado",
          empresa_id: local.empresa_id || null,
          sucursal_id: local.sucursal_id || null,
          email: local.email || null
        };
        logInfo("bootstrapAuth: final local fallback", user);
        return setCurrentUser(user);
      }

      return null;
    } catch (e) {
      console.error("bootstrapAuth error:", e);
      return null;
    }
  }

  function aggregateStockFromMovements(rows) {
    const stockMap = {};

    (rows || []).forEach((row) => {
      const productId = row.producto_id;
      const qty = Number(row.cantidad || 0);
      if (!productId || !Number.isFinite(qty)) return;

      const type = String(row.tipo || "").toLowerCase();
      let sign = 1;

      if (type === "salida" || type === "merma" || type === "consumo_receta") {
        sign = -1;
      } else if (type === "ajuste") {
        sign = 1;
      }

      stockMap[productId] = Number(stockMap[productId] || 0) + qty * sign;
    });

    return stockMap;
  }

  function calculatePreparedAvailability(recipe, details, stockMap) {
    const rendimiento = Math.max(0, Number(recipe?.rendimiento || 1) || 1);
    const ingredients = Array.isArray(details) ? details : [];

    if (!rendimiento || !ingredients.length) return 0;

    let maxUnits = Infinity;

    ingredients.forEach((detail) => {
      const insumoId = detail.insumo_id;
      const perRecipe = Number(detail.cantidad || 0);
      if (!insumoId || perRecipe <= 0) return;

      const perUnit = perRecipe / rendimiento;
      const available = Number(stockMap[insumoId] || 0);
      maxUnits = Math.min(maxUnits, Math.floor(available / perUnit));
    });

    return Number.isFinite(maxUnits) ? Math.max(0, maxUnits) : 0;
  }

  async function loadProducts() {
    const supabase = getSupabase();

    try {
      logInfo("loadProducts:start");

      const { data: productsData, error: productsError } = await supabase
        .from("v_productos_venta")
        .select("id,producto_id,sucursal_id,nombre,precio,costo_promedio,activo,tipo_producto,categoria_venta,receta_id,receta_nombre,receta_descripcion,receta_rendimiento,receta_activa,created_at,updated_at")
        .order("nombre", { ascending: true });

      if (productsError) throw productsError;

      const baseProducts = Array.isArray(productsData) ? productsData : [];
      const realProductIds = baseProducts.map((p) => p.producto_id || p.id).filter(Boolean);

      const preparedRows = baseProducts.filter(
        (p) => String(p.tipo_producto || "").toLowerCase() === "trago_preparado" || p.receta_id
      );

      const recipeIds = [...new Set(preparedRows.map((r) => r.receta_id).filter(Boolean))];

      const [movRes, recipeDetailsRes] = await Promise.all([
        realProductIds.length
          ? supabase
              .from("movimientos_stock_base")
              .select("producto_id,tipo,cantidad")
              .in("producto_id", realProductIds)
          : Promise.resolve({ data: [], error: null }),

        recipeIds.length
          ? supabase
              .from("receta_detalle")
              .select("receta_id,insumo_id,cantidad,desperdicio")
              .in("receta_id", recipeIds)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (movRes.error) console.warn("loadProducts(movimientos_stock_base):", movRes.error);
      if (recipeDetailsRes.error) console.warn("loadProducts(receta_detalle):", recipeDetailsRes.error);

      const stockMap = aggregateStockFromMovements(movRes.data || []);
      const recipeDetailsByRecipe = {};

      (recipeDetailsRes.data || []).forEach((detail) => {
        if (!detail.receta_id) return;
        if (!recipeDetailsByRecipe[detail.receta_id]) recipeDetailsByRecipe[detail.receta_id] = [];
        recipeDetailsByRecipe[detail.receta_id].push(detail);
      });

      state.productsCache = {};
      state.productsByRealId = {};

      (baseProducts || []).forEach((row) => {
        const uiId = String(row.id);
        const realId = String(row.producto_id || row.id);
        const tipo = String(row.tipo_producto || "").toLowerCase();
        const isPrepared = tipo === "trago_preparado" || Boolean(row.receta_id);
        const recipeId = row.receta_id || null;
        const recipeDetails = recipeDetailsByRecipe[recipeId] || [];

        const recipe = {
          recetas_id: recipeId,
          rendimiento: Number(row.receta_rendimiento || 1) || 1,
          activa: row.receta_activa !== false
        };

        const preparedStock = isPrepared && recipe.activa
          ? calculatePreparedAvailability(recipe, recipeDetails, stockMap)
          : null;

        const extra = {
          stock: isPrepared ? (preparedStock || 0) : (stockMap[realId] || 0),
          tipo_producto: isPrepared ? "trago_preparado" : (tipo || "insumo"),
          categoria_venta: row.categoria_venta || (isPrepared ? "Trago preparado" : "Producto individual"),
          unidad_medida: "unidad",
          receta_id: recipeId,
          receta_nombre: row.receta_nombre || "",
          receta_descripcion: row.receta_descripcion || "",
          receta_rendimiento: row.receta_rendimiento || 0,
          receta_activa: row.receta_activa,
          recipe_details: recipeDetails
        };

        const p = normalizeProduct({ ...row, id: uiId, producto_id: realId }, extra);
        state.productsCache[String(p.id)] = p;
        if (p.producto_id) {
          state.productsByRealId[String(p.producto_id)] = p;
        }
      });

      return Object.values(state.productsCache);
    } catch (e) {
      console.error("Error cargando productos:", e);
      return [];
    }
  }

  async function getProducts() {
    return loadProducts();
  }

  async function getVipClients() {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from("clientes_vip")
        .select("clientes_vip_id:id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
        .order("fecha_alta", { ascending: false });

      if (error) {
        logError("getVipClients(clientes_vip)", error);
        return [];
      }

      const contactIds = (data || []).map((c) => c.contacto_id).filter(Boolean);
      const contactsMap = contactIds.length
        ? await fetchManyByIds(
            "contactos",
            contactIds,
            "contactos_id:id,nombre,telefono,email,identificacion,direccion,created_at,updated_at",
            "contactos_id"
          )
        : {};

      return (data || []).map((client) => {
        const contact = client.contacto_id ? contactsMap[client.contacto_id] : null;

        return {
          ...client,
          nombre: contact?.nombre || "Sin nombre",
          telefono: contact?.telefono || null,
          email: contact?.email || null,
          identificacion: contact?.identificacion || null,
          direccion: contact?.direccion || null
        };
      });
    } catch (err) {
      logError("getVipClients(catch)", err);
      return [];
    }
  }

  function summarizeSalesCosts(rows = []) {
    return rows.reduce((acc, row) => {
      acc.ventas_realizadas += 1;
      acc.subtotal_vendido += toNumber(row.subtotal);
      acc.descuentos_totales += toNumber(row.descuento);
      acc.impuestos_totales += toNumber(row.impuesto);
      acc.total_vendido += toNumber(row.total);
      acc.costo_estandar_total += toNumber(row.costo_estandar_total);
      acc.costo_real_total += toNumber(row.costo_real_total);
      return acc;
    }, {
      ventas_realizadas: 0,
      subtotal_vendido: 0,
      descuentos_totales: 0,
      impuestos_totales: 0,
      total_vendido: 0,
      costo_estandar_total: 0,
      costo_real_total: 0
    });
  }

  async function getSalesCostSummaryBetween(startDate, endDate) {
    const supabase = getSupabase();

    try {
      let query = supabase
        .from("v_ventas")
        .select("id,usuario_id,usuario_nombre,subtotal,descuento,impuesto,total,estado,created_at,costo_estandar_total,costo_real_total")
        .eq("estado", "finalizada")
        .order("created_at", { ascending: false });

      if (startDate) query = query.gte("created_at", toIso(startDate));
      if (endDate) query = query.lt("created_at", toIso(endDate));

      const { data, error } = await query;

      if (error) {
        logError("getSalesCostSummaryBetween(v_ventas)", error, { startDate, endDate });
        return null;
      }

      const rows = Array.isArray(data) ? data : [];
      const summary = summarizeSalesCosts(rows);

      return {
        ...summary,
        utilidad_bruta_estandar: roundTo2(summary.total_vendido - summary.costo_estandar_total),
        utilidad_bruta_real: roundTo2(summary.total_vendido - summary.costo_real_total),
        start_date: startDate ? toIso(startDate) : null,
        end_date: endDate ? toIso(endDate) : null
      };
    } catch (err) {
      logError("getSalesCostSummaryBetween(catch)", err, { startDate, endDate });
      return null;
    }
  }

  function roundTo2(n) {
    return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
  }

  async function loadReservationSales(limit = 50) {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from("v_reservaciones_ventas")
        .select("id,evento_id,evento_nombre,mesa_id,numero_mesa,cliente_vip_id,nombre_reserva,responsable_nombre,usuario_reserva_id,usuario_reserva_nombre,monto_reserva,estado,created_at,observacion")
        .neq("estado", "cancelada")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        logError("loadReservationSales(v_reservaciones_ventas)", error);
        return [];
      }

      return (data || []).map((row) => {
        const total = Number(row.monto_reserva || 0) || 0;
        const reservationName = row.evento_nombre || row.nombre_reserva || "Reserva";

        return normalizeVenta({
          id: `reserva_${row.id}`,
          kind: "reserva",
          subtotal: total,
          descuento: 0,
          impuesto: 0,
          total,
          metodo_pago: "reserva",
          estado: String(row.estado || "pendiente").toLowerCase() === "finalizada" ? "finalizada" : "reserva",
          observacion: row.observacion || null,
          usuario_id: null,
          cliente_vip_id: row.cliente_vip_id || null,
          evento_id: row.evento_id || null,
          created_at: row.created_at,
          nombre_reserva: reservationName,
          usuario_reserva_nombre: row.usuario_reserva_nombre || row.responsable_nombre || "-",
          costo_estandar_total: 0,
          costo_real_total: 0,
          costo_estandar_unitario: 0,
          costo_real_unitario: 0,
          venta_detalle: [
            {
              id: `reserva_detalle_${row.id}`,
              venta_id: `reserva_${row.id}`,
              producto_id: null,
              producto_nombre: reservationName,
              cantidad: 1,
              precio_unitario: total,
              total_linea: total,
              costo_unitario: 0,
              costo_total: 0,
              costo_estandar_unitario: 0,
              costo_estandar_total: 0,
              costo_real_unitario: 0,
              costo_real_total: 0,
              productos: {
                nombre: reservationName
              }
            }
          ]
        });
      });
    } catch (err) {
      logError("loadReservationSales(catch)", err);
      return [];
    }
  }

  async function loadSales() {
    const supabase = getSupabase();

    try {
      const [salesRes, reservationSales] = await Promise.all([
        supabase
          .from("v_ventas")
          .select("id,usuario_id,usuario_nombre,total,estado,created_at,costo_estandar_total,costo_real_total")
          .eq("estado", "finalizada")
          .order("created_at", { ascending: false })
          .limit(50),
        loadReservationSales(50)
      ]);

      const { data, error } = salesRes;
      if (error) throw error;

      const sales = (data || []).map(normalizeVenta);
      const saleIds = sales.map((s) => s.id).filter(Boolean);

      let details = [];
      if (saleIds.length) {
        const { data: detailsData, error: detailsError } = await supabase
          .from("v_venta_detalle")
          .select("id,venta_id,producto_id,producto_nombre,cantidad,precio_unitario,total_linea,receta_id,costo_estandar_unitario,costo_estandar_total,costo_real_unitario,costo_real_total,created_at")
          .in("venta_id", saleIds);

        if (detailsError) {
          console.warn("No fue posible cargar v_venta_detalle:", detailsError);
        } else {
          details = (Array.isArray(detailsData) ? detailsData : []).map((detail) => ({
            ...detail,
            costo_total: Number(detail.costo_unitario || 0) * Number(detail.cantidad || 0)
          }));
        }
      }

      const detailsBySale = {};
      details.forEach((row) => {
        if (!detailsBySale[row.venta_id]) detailsBySale[row.venta_id] = [];
        detailsBySale[row.venta_id].push({
          ...row,
          productos: {
            nombre: row.producto_nombre || null
          }
        });
      });

      return sales
        .map((sale) => ({
          ...sale,
          venta_detalle: detailsBySale[sale.id] || []
        }))
        .concat(reservationSales)
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, 50);
    } catch (e) {
      console.error("Error cargando ventas:", e);
      return [];
    }
  }

  async function fetchUserName(userId) {
    if (!userId) return "-";

    if (state.usersCache[userId]) {
      return state.usersCache[userId];
    }

    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from("v_usuarios")
        .select("id,nombre,email")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data?.nombre) {
        state.usersCache[userId] = data.nombre || "Desconocido";
        return state.usersCache[userId];
      }

      const { data: userData } = await supabase
        .from("usuarios")
        .select("usuarios_id:id,contacto_id")
        .eq("usuarios_id", userId)
        .maybeSingle();

      if (userData?.contacto_id) {
        const { data: contact } = await supabase
          .from("contactos")
          .select("nombre")
          .eq("contactos_id", userData.contacto_id)
          .maybeSingle();

        state.usersCache[userId] = contact?.nombre || "Desconocido";
        return state.usersCache[userId];
      }

      const authUser = await getAuthFallbackUser();
      if (authUser?.id === userId) {
        state.usersCache[userId] =
          authUser.user_metadata?.nombre ||
          authUser.app_metadata?.nombre ||
          authUser.email ||
          "Desconocido";
        return state.usersCache[userId];
      }

      state.usersCache[userId] = "Desconocido";
      return state.usersCache[userId];
    } catch (e) {
      console.error("Error obteniendo usuario:", e);
      state.usersCache[userId] = "Error";
      return state.usersCache[userId];
    }
  }

  async function getSalesBetween(startDate, endDate) {
    const supabase = getSupabase();

    try {
      let query = supabase
        .from("v_ventas")
        .select("id,usuario_id,usuario_nombre,subtotal,descuento,impuesto,total,metodo_pago,estado,observacion,created_at,cliente_vip_id,evento_id,costo_estandar_total,costo_real_total")
        .eq("estado", "finalizada")
        .order("created_at", { ascending: false });

      if (startDate) query = query.gte("created_at", toIso(startDate));
      if (endDate) query = query.lt("created_at", toIso(endDate));

      const { data, error } = await query;

      if (error) {
        logError("getSalesBetween(v_ventas)", error, { startDate, endDate });
        return [];
      }

      return (data || []).map(normalizeVenta);
    } catch (err) {
      logError("getSalesBetween(catch)", err, { startDate, endDate });
      return [];
    }
  }

  async function getSalesForToday() {
    return getSalesBetween(getTodayStart(), getTomorrowStart());
  }

  async function getSalesForWeek() {
    return getSalesBetween(getWeekStart(), getNextWeekStart());
  }

  async function getSalesForMonth() {
    return getSalesBetween(getMonthStart(), getNextMonthStart());
  }

  async function getTopSeller() {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from("ventas")
        .select("ventas_id:id,usuario_id,subtotal,descuento,impuesto,total,created_at,estado")
        .eq("estado", "finalizada");

      if (error) {
        logError("getTopSeller(ventas)", error);
        return null;
      }

      const grouped = new Map();

      (data || []).forEach((row) => {
        if (!row.usuario_id) return;

        const current = grouped.get(row.usuario_id) || {
          usuario_id: row.usuario_id,
          ventas_realizadas: 0,
          subtotal_vendido: 0,
          descuentos_totales: 0,
          impuestos_totales: 0,
          total_vendido: 0,
          ultima_venta: null
        };

        current.ventas_realizadas += 1;
        current.subtotal_vendido += toNumber(row.subtotal);
        current.descuentos_totales += toNumber(row.descuento);
        current.impuestos_totales += toNumber(row.impuesto);
        current.total_vendido += toNumber(row.total);

        const currentDate = row.created_at ? new Date(row.created_at) : null;
        const lastDate = current.ultima_venta ? new Date(current.ultima_venta) : null;

        if (currentDate && (!lastDate || currentDate > lastDate)) {
          current.ultima_venta = row.created_at;
        }

        grouped.set(row.usuario_id, current);
      });

      const ranking = [...grouped.values()].sort((a, b) =>
        b.total_vendido - a.total_vendido ||
        b.ventas_realizadas - a.ventas_realizadas ||
        (Date.parse(b.ultima_venta || 0) - Date.parse(a.ultima_venta || 0))
      );

      const top = ranking[0];
      if (!top) return null;

      const profile = await fetchUserFromDBById(top.usuario_id);

      return {
        usuario_id: top.usuario_id,
        usuario_nombre: profile?.nombre || "Sin nombre",
        email: profile?.email || null,
        role: profile?.role || null,
        sucursal_id: profile?.sucursal_id || null,
        sucursal_nombre: profile?.sucursal_nombre || null,
        empresa_id: profile?.empresa_id || null,
        empresa_nombre: profile?.empresa_nombre || null,
        ventas_realizadas: top.ventas_realizadas,
        subtotal_vendido: top.subtotal_vendido,
        descuentos_totales: top.descuentos_totales,
        impuestos_totales: top.impuestos_totales,
        total_vendido: top.total_vendido,
        promedio_venta: top.ventas_realizadas > 0 ? top.total_vendido / top.ventas_realizadas : 0,
        ultima_venta: top.ultima_venta,
        ranking_ventas: 1
      };
    } catch (err) {
      logError("getTopSeller(catch)", err);
      return null;
    }
  }

  async function getDailyReport(dateValue = new Date()) {
    const start = dateOnly(dateValue);
    const end = getTomorrowStart.call({}); // evita el lint si tu entorno es estricto
    const summary = await getSalesCostSummaryBetween(start, getTomorrowStart());
    return summary ? {
      fecha: start.toISOString().slice(0, 10),
      periodo: start.toISOString().slice(0, 10),
      ...summary
    } : null;
  }

  async function getWeeklyReport(dateValue = new Date()) {
    const start = getWeekStart(dateValue);
    const end = getNextWeekStart(dateValue);
    const summary = await getSalesCostSummaryBetween(start, end);
    return summary ? {
      semana_inicio: start.toISOString().slice(0, 10),
      semana_fin: new Date(end.getTime() - 86400000).toISOString().slice(0, 10),
      periodo: `${start.toISOString().slice(0, 10)} / ${new Date(end.getTime() - 86400000).toISOString().slice(0, 10)}`,
      ...summary
    } : null;
  }

  async function getMonthlyReport(dateValue = new Date()) {
    const start = getMonthStart(dateValue);
    const end = getNextMonthStart(dateValue);
    const summary = await getSalesCostSummaryBetween(start, end);
    return summary ? {
      mes_inicio: start.toISOString().slice(0, 10),
      periodo: start.toISOString().slice(0, 7),
      ...summary
    } : null;
  }

  async function getMonthlyProductSalesMap() {
    const supabase = getSupabase();

    try {
      const { data: sales, error: salesError } = await supabase
        .from("ventas")
        .select("ventas_id:id,subtotal,descuento,impuesto,total,metodo_pago,estado,observacion,created_at,usuario_id,cliente_vip_id,evento_id")
        .eq("estado", "finalizada")
        .order("created_at", { ascending: false })
        .limit(50);

      if (salesError) {
        logError("getMonthlyProductSalesMap(ventas)", salesError);
        return { unitsMap: {}, boxesMap: {}, totalBoxes: 0 };
      }

      const saleIds = (sales || []).map((s) => s.id).filter(Boolean);
      if (!saleIds.length) {
        return { unitsMap: {}, boxesMap: {}, totalBoxes: 0 };
      }

      const { data: details, error: detailsError } = await supabase
        .from("venta_detalle")
        .select("venta_id,producto_id,cantidad")
        .in("venta_id", saleIds);

      if (detailsError) {
        logError("getMonthlyProductSalesMap(venta_detalle)", detailsError);
        return { unitsMap: {}, boxesMap: {}, totalBoxes: 0 };
      }

      const unitsMap = {};
      const boxesMap = {};
      let totalBoxes = 0;

      (details || []).forEach((row) => {
        const productId = row.producto_id;
        const qty = toNumber(row.cantidad);

        if (!productId || qty <= 0) return;

        unitsMap[productId] = (unitsMap[productId] || 0) + qty;
        boxesMap[productId] = (boxesMap[productId] || 0) + 0;
        totalBoxes += 0;
      });

      return { unitsMap, boxesMap, totalBoxes };
    } catch (err) {
      logError("getMonthlyProductSalesMap(catch)", err);
      return { unitsMap: {}, boxesMap: {}, totalBoxes: 0 };
    }
  }

  function getCart() {
    return state.cart.slice();
  }

  function getSubtotal() {
    return state.cart.reduce((sum, item) => sum + Number(item.total || 0), 0);
  }

  function clearCart() {
    logInfo("clearCart", { itemsBefore: state.cart.length });
    state.cart = [];
  }

  function removeCartItem(index) {
    if (index < 0 || index >= state.cart.length) return false;
    const removed = state.cart[index];
    state.cart.splice(index, 1);
    logInfo("removeCartItem", { index, removed });
    return true;
  }

  function getCartReservedQuantity(productId, ignoreIndex = null) {
    let qty = 0;

    state.cart.forEach((item, idx) => {
      if (ignoreIndex !== null && idx === ignoreIndex) return;

      if (item.kind === "product" && String(item.productId) === String(productId)) {
        qty += Number(item.cantidad || 0);
      }

      if (item.kind === "combo" && Array.isArray(item.components)) {
        const comboQty = Number(item.cantidad || 0);
        item.components.forEach((comp) => {
          if (String(comp.productId) === String(productId)) {
            qty += Number(comp.cantidad || 0) * comboQty;
          }
        });
      }
    });

    return qty;
  }

  function canReserveProductQty(productId, qty, ignoreIndex = null) {
    const prod = getProductByKey(productId);
    if (!prod) {
      console.log("[SalesModel] canReserveProductQty -> producto no encontrado", { productId, qty });
      return { ok: false, message: "Producto no encontrado" };
    }

    const requested = Number(qty || 0);
    const reservedOther = getCartReservedQuantity(String(productId), ignoreIndex);
    const available = Number(prod.stock || 0);

    if ((reservedOther + requested) > available) {
      return { ok: false, message: `Stock disponible: ${available}` };
    }

    return { ok: true };
  }

  function canReserveComboQty(combo, qty, ignoreIndex = null) {
    if (!combo || !Array.isArray(combo.components) || !combo.components.length) {
      return { ok: false, message: "Combo inválido" };
    }

    const comboQty = Number(qty || 0);

    for (const comp of combo.components) {
      const prod = getProductByKey(String(comp.productId));
      if (!prod) {
        return { ok: false, message: `No existe el producto "${comp.nombre || comp.productId}"` };
      }

      const required = Number(comp.cantidad || 0) * comboQty;
      const reservedOther = getCartReservedQuantity(String(comp.productId), ignoreIndex);
      const available = Number(prod.stock || 0);

      if ((reservedOther + required) > available) {
        return {
          ok: false,
          message: `Stock insuficiente para "${prod.nombre}". Disponible: ${available}`
        };
      }
    }

    return { ok: true };
  }

  function updateCartQuantity(index, qty) {
    const item = state.cart[index];
    if (!item) {
      return { ok: false, message: "Ítem no encontrado" };
    }

    const value = Math.max(1, Number(qty || 1));

    if (item.kind === "combo") {
      const check = canReserveComboQty(item, value, index);
      if (!check.ok) return check;

      item.cantidad = value;
      item.total = item.cantidad * item.precio_unitario;
      return { ok: true };
    }

    const check = canReserveProductQty(item.productId, value, index);
    if (!check.ok) return check;

    item.cantidad = value;
    item.total = item.cantidad * item.precio_unitario;
    return { ok: true };
  }

  function addToCart(productId, qty = 1) {
    const key = String(productId || "");
    const prod = getProductByKey(key);

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
    const currentInCart = state.cart.find((i) => i.kind === "product" && String(i.productId) === key);
    const already = currentInCart ? Number(currentInCart.cantidad || 0) : 0;

    const check = canReserveProductQty(key, already + cantidad, null);
    if (!check.ok) {
      return check;
    }

    if (currentInCart) {
      currentInCart.cantidad += cantidad;
      currentInCart.total = Number(currentInCart.cantidad) * Number(currentInCart.precio_unitario);
    } else {
      state.cart.push({
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

  function addComboToCart(combo, qty = 1) {
    if (!combo || !combo.nombre) {
      return { ok: false, message: "Combo inválido" };
    }

    if (!Array.isArray(combo.components) || combo.components.length < 2) {
      return { ok: false, message: "El combo debe tener al menos 2 productos." };
    }

    const cantidad = Math.max(1, Number(qty || 1));
    const check = canReserveComboQty(combo, cantidad, null);
    if (!check.ok) return check;

    const id = combo.id || `combo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const newCombo = {
      kind: "combo",
      comboId: id,
      nombre: combo.nombre,
      precio_unitario: Number(combo.precio_unitario || 0),
      cantidad,
      total: Number(combo.precio_unitario || 0) * cantidad,
      components: combo.components.map((c) => ({
        productId: String(c.productId),
        nombre: c.nombre,
        cantidad: Number(c.cantidad || 0)
      }))
    };

    state.cart.push(newCombo);

    return { ok: true, message: "Combo añadido" };
  }

  function expandCartForSale() {
    const items = [];
    const comboNotes = [];
    let comboDiscount = 0;

    state.cart.forEach((item) => {
      if (item.kind === "combo") {
        const comboQty = Number(item.cantidad || 0);
        const comboSaleTotal = Number(item.precio_unitario || 0) * comboQty;
        let comboBaseTotal = 0;
        const componentText = [];

        item.components.forEach((comp) => {
          const prod = getProductByKey(String(comp.productId));
          const unitPrice = Number(prod?.precio ?? 0);
          const lineQty = Number(comp.cantidad || 0) * comboQty;
          const lineTotal = unitPrice * lineQty;
          comboBaseTotal += lineTotal;
          componentText.push(`${prod?.nombre || comp.nombre} x${lineQty}`);

          items.push({
            producto_id: String(prod?.producto_id || prod?.id || comp.productId),
            cantidad: lineQty,
            precio_unitario: unitPrice
          });
        });

        comboDiscount += Math.max(0, comboBaseTotal - comboSaleTotal);
        comboNotes.push(`Combo ${item.nombre} x${comboQty}: ${componentText.join(", ")}`);
        return;
      }

      items.push({
        producto_id: String(item.saleProductId || item.productId),
        cantidad: Number(item.cantidad || 0),
        precio_unitario: Number(item.precio_unitario || 0)
      });
    });

    return {
      items,
      discount: comboDiscount,
      observacion: comboNotes.join(" | ")
    };
  }

  async function finalizeSale(options = {}) {
    const {
      metodoPago = "efectivo",
      descuento = 0,
      impuesto = 0,
      observacion = null
    } = options;

    try {
      if (!state.cart.length) {
        return { ok: false, message: "Carrito vacío" };
      }

      if (!state.currentUser) {
        state.currentUser = await bootstrapAuth();
      }

      const currentUser = state.currentUser;

      const empresaId = String(currentUser?.empresa_id || global.adminEmpresa || "").trim();
      const sucursalId = String(currentUser?.sucursal_id || global.adminSucursal || "").trim();
      const usuarioId = String(currentUser?.id || "").trim();

      if (!currentUser || !usuarioId || !empresaId || !sucursalId) {
        return { ok: false, message: "No se pudo detectar la sesión, empresa o sucursal del usuario." };
      }

      const expanded = expandCartForSale();

      const payload = {
        p_empresa_id: empresaId,
        p_sucursal_id: sucursalId,
        p_usuario_id: usuarioId,
        p_metodo_pago: String(metodoPago || "efectivo"),
        p_descuento: Number(descuento || 0) + Number(expanded.discount || 0),
        p_impuesto: Number(impuesto || 0),
        p_observacion: [expanded.observacion, observacion].filter(Boolean).join(" | ") || null,
        p_items: expanded.items
      };

      const supabase = getSupabase();
      const { data, error } = await supabase.rpc("registrar_venta_app", payload);

      if (error) throw error;
      if (!data) throw new Error("No se pudo registrar la venta.");

      clearCart();

      return { ok: true, data };
    } catch (e) {
      return { ok: false, message: e.message || "No se pudo finalizar la venta." };
    }
  }

  function saveDraft() {
    if (!state.cart.length) {
      return { ok: false, message: "Carrito vacío" };
    }

    const draft = {
      created_at: new Date().toISOString(),
      user_id: state.currentUser?.id || null,
      empresa_id: state.currentUser?.empresa_id || global.adminEmpresa || null,
      sucursal_id: state.currentUser?.sucursal_id || global.adminSucursal || null,
      items: state.cart
    };

    localStorage.setItem("sales_draft_v1", JSON.stringify(draft));
    return { ok: true, draft };
  }

  function cleanupRealtime() {
    try {
      const supabase = getSupabase();

      if (state.productsChannel && typeof supabase.removeChannel === "function") {
        supabase.removeChannel(state.productsChannel);
        state.productsChannel = null;
      }
      if (state.salesChannel && typeof supabase.removeChannel === "function") {
        supabase.removeChannel(state.salesChannel);
        state.salesChannel = null;
      }
    } catch (e) {
      console.warn("cleanupRealtime:", e);
    }
  }

  function subscribeRealtime(onProductsChange, onSalesChange) {
    try {
      const supabase = getSupabase();

      if (typeof supabase.channel !== "function") return null;

      cleanupRealtime();

      state.productsChannel = supabase
        .channel("sales-products-channel")
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, async () => {
          if (typeof onProductsChange === "function") await onProductsChange();
        })
        .subscribe();

      state.salesChannel = supabase
        .channel("sales-ventas-channel")
        .on("postgres_changes", { event: "*", schema: "public", table: "ventas" }, async () => {
          if (typeof onSalesChange === "function") await onSalesChange();
        })
        .subscribe();

      return true;
    } catch (e) {
      console.warn("Realtime no disponible:", e);
      return false;
    }
  }

  global.salesModel = {
    state,
    currency,
    getValue,
    toNumber,
    toDate,
    parseDate,
    normalizeProduct,
    normalizeVenta,
    saleDetailText,
    saleLabel,
    bootstrapAuth,
    setCurrentUser,
    getCurrentUser,
    getProducts,
    loadProducts,
    getVipClients,
    loadSales,
    loadReservationSales,
    fetchUserName,
    getCart,
    getSubtotal,
    clearCart,
    removeCartItem,
    updateCartQuantity,
    addToCart,
    addComboToCart,
    expandCartForSale,
    finalizeSale,
    saveDraft,
    subscribeRealtime,
    cleanupRealtime,
    canReserveProductQty,
    canReserveComboQty,
    getSalesBetween,
    getSalesForToday,
    getSalesForWeek,
    getSalesForMonth,
    getTopSeller,
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport,
    getMonthlyProductSalesMap,
    getSalesCostSummaryBetween,
    getTodayStart,
    getTomorrowStart,
    getMonthStart,
    getNextMonthStart,
    getWeekStart,
    getNextWeekStart,
    getProductByKey
  };
})(window);