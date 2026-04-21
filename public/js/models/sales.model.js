// js/models/sales.model.js
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

  function normalizeProduct(row, extra = {}) {
    return {
      id: row.id,
      nombre: String(getValue(row, ["nombre", "name", "producto", "descripcion"], "Sin nombre")),
      tipo_producto: String(getValue(extra, ["tipo_producto"], getValue(row, ["tipo_producto"], "insumo"))),
      unidad_medida: String(getValue(extra, ["unidad_medida"], getValue(row, ["unidad_medida"], "unidad"))),
      stock: Number(getValue(extra, ["stock"], getValue(row, ["stock", "cantidad"], 0))) || 0,
      precio: Number(getValue(row, ["precio", "price", "costo"], 0)) || 0,
      costo_promedio: Number(getValue(row, ["costo_promedio"], 0)) || 0,
      activo: Boolean(getValue(row, ["activo"], true)),
      sucursal_id: getValue(row, ["sucursal_id"], null),
      receta_id: getValue(extra, ["receta_id"], null)
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
      cliente_vip_id: getValue(row, ["cliente_vip_id"], null),
      evento_id: getValue(row, ["evento_id"], null),
      created_at: getValue(row, ["created_at"], null),
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

  function setCurrentUser(user) {
    state.currentUser = user || null;

    if (user) {
      global.adminUser = user;
      global.adminEmpresa = user.empresa_id != null ? String(user.empresa_id) : "";
      global.adminSucursal = user.sucursal_id != null ? String(user.sucursal_id) : "";
    }

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

  async function fetchManyByIds(table, ids, select = "*") {
    const supabase = getSupabase();
    const unique = [...new Set((ids || []).filter(Boolean))];

    if (!unique.length) return {};

    try {
      const { data, error } = await supabase
        .from(table)
        .select(select)
        .in("id", unique);

      if (error) {
        logError(`fetchManyByIds(${table})`, error, { ids: unique });
        return {};
      }

      return Object.fromEntries((data || []).map((row) => [row.id, row]));
    } catch (err) {
      logError(`fetchManyByIds(${table})(catch)`, err, { ids: unique });
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

      if (error) {
        console.warn("Error consultando v_usuarios:", error);
      } else if (data) {
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
        .select("id,role,sucursal_id,contacto_id,created_at,updated_at")
        .eq("id", uid)
        .maybeSingle());

      if (error) {
        console.warn("Error consultando usuarios:", error);
        return null;
      }

      if (!data) return null;

      let contacto = null;
      if (data.contacto_id) {
        const { data: c } = await supabase
          .from("contactos")
          .select("id,nombre,telefono,email,direccion")
          .eq("id", data.contacto_id)
          .maybeSingle();
        contacto = c || null;
      }

      let sucursal = null;
      if (data.sucursal_id) {
        const { data: s } = await supabase
          .from("sucursales")
          .select("id,nombre,codigo,empresa_id")
          .eq("id", data.sucursal_id)
          .maybeSingle();
        sucursal = s || null;
      }

      return {
        id: data.id,
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

      if (!uid) {
        const local = JSON.parse(localStorage.getItem("currentUser") || "null");
        if (local) {
          const fallback = {
            id: local.uid || local.id || null,
            nombre: local.name || local.nombre || local.email || "Usuario",
            role: local.role || "empleado",
            empresa_id: local.empresa_id || null,
            sucursal_id: local.sucursal_id || null,
            email: local.email || null
          };
          return setCurrentUser(fallback);
        }
        return null;
      }

      const userDB = await fetchUserFromDBById(uid);
      if (userDB) return setCurrentUser(userDB);

      const authUser = await getAuthFallbackUser();
      if (authUser) {
        const fallback = {
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
        return setCurrentUser(fallback);
      }

      const local = JSON.parse(localStorage.getItem("currentUser") || "null");
      if (local && (local.uid === uid || local.email)) {
        return setCurrentUser({
          id: local.uid || uid,
          nombre: local.name || local.nombre || local.email || "Usuario",
          role: local.role || "empleado",
          empresa_id: local.empresa_id || null,
          sucursal_id: local.sucursal_id || null,
          email: local.email || null
        });
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

      stockMap[productId] = Number(stockMap[productId] || 0) + (qty * sign);
    });

    return stockMap;
  }

  async function loadProducts() {
    const supabase = getSupabase();

    try {
      const { data: baseProducts, error } = await supabase
        .from("productos")
        .select("id,nombre,precio,sucursal_id,costo_promedio,activo,created_at,updated_at")
        .order("nombre", { ascending: true });

      if (error) throw error;

      const ids = (baseProducts || []).map((p) => p.id).filter(Boolean);

      const [movRes, insumoRes, preparadosRes] = await Promise.all([
        ids.length
          ? supabase
              .from("movimientos_stock_base")
              .select("producto_id,tipo,cantidad")
              .in("producto_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? supabase
              .from("productos_insumo")
              .select("id,unidad_medida")
              .in("id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? supabase
              .from("productos_preparados")
              .select("id,receta_id")
              .in("id", ids)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (movRes.error) console.warn("loadProducts(movimientos_stock_base):", movRes.error);
      if (insumoRes.error) console.warn("loadProducts(productos_insumo):", insumoRes.error);
      if (preparadosRes.error) console.warn("loadProducts(productos_preparados):", preparadosRes.error);

      const stockMap = aggregateStockFromMovements(movRes.data || []);
      const insumoMap = Object.fromEntries((insumoRes.data || []).map((r) => [r.id, r]));
      const preparadosMap = Object.fromEntries((preparadosRes.data || []).map((r) => [r.id, r]));

      state.productsCache = {};
      (baseProducts || []).forEach((row) => {
        const isPrepared = Boolean(preparadosMap[row.id]);
        const isInsumo = Boolean(insumoMap[row.id]);

        const tipo_producto = isPrepared
          ? "trago_preparado"
          : isInsumo
            ? "insumo"
            : "botella";

        const extra = {
          stock: stockMap[row.id] || 0,
          tipo_producto,
          unidad_medida: insumoMap[row.id]?.unidad_medida || "unidad",
          receta_id: preparadosMap[row.id]?.receta_id || null
        };

        const p = normalizeProduct(row, extra);
        state.productsCache[p.id] = p;
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
        .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
        .order("fecha_alta", { ascending: false });

      if (error) {
        logError("getVipClients(clientes_vip)", error);
        return [];
      }

      const contactIds = (data || [])
        .map((c) => c.contacto_id)
        .filter(Boolean);

      const contactsMap = contactIds.length
        ? await fetchManyByIds(
            "contactos",
            contactIds,
            "id,nombre,telefono,email,identificacion,direccion,created_at,updated_at"
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

  async function loadSales() {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from("ventas")
        .select("id,subtotal,descuento,impuesto,total,metodo_pago,estado,observacion,created_at,usuario_id,cliente_vip_id,evento_id")
        .eq("estado", "finalizada")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const sales = (data || []).map(normalizeVenta);
      const saleIds = sales.map((s) => s.id).filter(Boolean);

      if (!saleIds.length) return sales;

      let details = [];
      const { data: detailsData, error: detailsError } = await supabase
        .from("venta_detalle")
        .select("id,venta_id,producto_id,cantidad,precio_unitario,total_linea,costo_unitario,costo_total,receta_id")
        .in("venta_id", saleIds);

      if (detailsError) {
        console.warn("No fue posible cargar venta_detalle:", detailsError);
      } else {
        details = Array.isArray(detailsData) ? detailsData : [];
      }

      const prodIds = [...new Set(details.map((d) => d.producto_id).filter(Boolean))];
      let productsMap = {};

      if (prodIds.length) {
        const { data: productsData, error: productsError } = await supabase
          .from("productos")
          .select("id,nombre")
          .in("id", prodIds);

        if (!productsError) {
          productsMap = Object.fromEntries((productsData || []).map((p) => [p.id, p]));
        }
      }

      const detailsBySale = {};
      details.forEach((row) => {
        if (!detailsBySale[row.venta_id]) detailsBySale[row.venta_id] = [];
        detailsBySale[row.venta_id].push({
          ...row,
          productos: {
            nombre: productsMap[row.producto_id]?.nombre || null
          }
        });
      });

      return sales.map((sale) => ({
        ...sale,
        venta_detalle: detailsBySale[sale.id] || []
      }));
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
        .select("id,contacto_id")
        .eq("id", userId)
        .maybeSingle();

      if (userData?.contacto_id) {
        const { data: contact } = await supabase
          .from("contactos")
          .select("nombre")
          .eq("id", userData.contacto_id)
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
        .from("ventas")
        .select("id,usuario_id,subtotal,descuento,impuesto,total,metodo_pago,estado,observacion,created_at,cliente_vip_id,evento_id")
        .eq("estado", "finalizada")
        .order("created_at", { ascending: false });

      if (startDate) query = query.gte("created_at", toIso(startDate));
      if (endDate) query = query.lt("created_at", toIso(endDate));

      const { data, error } = await query;

      if (error) {
        logError("getSalesBetween(ventas)", error, { startDate, endDate });
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
        .select("usuario_id,subtotal,descuento,impuesto,total,created_at,estado")
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

  async function getPeriodReport(viewName, fieldName, dateValue) {
    const supabase = getSupabase();
    const key = dateValue instanceof Date ? dateValue.toISOString().slice(0, 10) : String(dateValue || "");

    try {
      const { data, error } = await supabase
        .from(viewName)
        .select("*")
        .eq(fieldName, key)
        .maybeSingle();

      if (error) {
        logError(`getPeriodReport(${viewName})`, error, { fieldName, key });
        return null;
      }

      return data || null;
    } catch (err) {
      logError(`getPeriodReport(${viewName})(catch)`, err, { fieldName, key });
      return null;
    }
  }

  async function getDailyReport(dateValue = new Date()) {
    return getPeriodReport("v_ventas_diarias", "fecha", dateValue);
  }

  async function getWeeklyReport(dateValue = new Date()) {
    return getPeriodReport("v_ventas_semanales", "semana_inicio", getWeekStart(dateValue));
  }

  async function getMonthlyReport(dateValue = new Date()) {
    return getPeriodReport("v_ventas_mensuales", "mes_inicio", getMonthStart(dateValue));
  }

  async function getMonthlyProductSalesMap() {
    const supabase = getSupabase();
    const monthStart = getMonthStart();
    const nextMonthStart = getNextMonthStart();

    try {
      const { data: sales, error: salesError } = await supabase
        .from("ventas")
        .select("id")
        .eq("estado", "finalizada")
        .gte("created_at", toIso(monthStart))
        .lt("created_at", toIso(nextMonthStart));

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
    state.cart = [];
  }

  function removeCartItem(index) {
    if (index < 0 || index >= state.cart.length) return false;
    state.cart.splice(index, 1);
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
    const prod = state.productsCache[productId];
    if (!prod) {
      return { ok: false, message: "Producto no encontrado" };
    }

    const requested = Number(qty || 0);
    const reservedOther = getCartReservedQuantity(productId, ignoreIndex);
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
      const prod = state.productsCache[comp.productId];
      if (!prod) {
        return { ok: false, message: `No existe el producto "${comp.nombre || comp.productId}"` };
      }

      const required = Number(comp.cantidad || 0) * comboQty;
      const reservedOther = getCartReservedQuantity(comp.productId, ignoreIndex);
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
    const prod = state.productsCache[productId];

    if (!productId) {
      return { ok: false, message: "Selecciona un producto" };
    }

    if (!prod) {
      return { ok: false, message: "Producto no encontrado" };
    }

    if (String(prod.tipo_producto || "").toLowerCase() === "servicio") {
      return { ok: false, message: "Los servicios no se venden desde este módulo." };
    }

    const cantidad = Math.max(1, Number(qty || 1));
    const currentInCart = state.cart.find((i) => i.kind === "product" && String(i.productId) === String(productId));
    const already = currentInCart ? Number(currentInCart.cantidad || 0) : 0;

    const check = canReserveProductQty(productId, already + cantidad, null);
    if (!check.ok) return check;

    if (currentInCart) {
      currentInCart.cantidad += cantidad;
      currentInCart.total = Number(currentInCart.cantidad) * Number(currentInCart.precio_unitario);
    } else {
      state.cart.push({
        kind: "product",
        productId,
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

    state.cart.push({
      kind: "combo",
      comboId: id,
      nombre: combo.nombre,
      precio_unitario: Number(combo.precio_unitario || 0),
      cantidad,
      total: Number(combo.precio_unitario || 0) * cantidad,
      components: combo.components.map((c) => ({
        productId: c.productId,
        nombre: c.nombre,
        cantidad: Number(c.cantidad || 0)
      }))
    });

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
          const prod = state.productsCache[comp.productId];
          const unitPrice = Number(prod?.precio ?? 0);
          const lineQty = Number(comp.cantidad || 0) * comboQty;
          const lineTotal = unitPrice * lineQty;
          comboBaseTotal += lineTotal;
          componentText.push(`${prod?.nombre || comp.nombre} x${lineQty}`);

          items.push({
            producto_id: comp.productId,
            cantidad: lineQty,
            precio_unitario: unitPrice
          });
        });

        comboDiscount += Math.max(0, comboBaseTotal - comboSaleTotal);
        comboNotes.push(`Combo ${item.nombre} x${comboQty}: ${componentText.join(", ")}`);
        return;
      }

      items.push({
        producto_id: item.productId,
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
    const { data, error } = await supabase.rpc("registrar_venta", payload);

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("No se pudo registrar la venta.");
    }

    clearCart();
    return { ok: true, data };
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
    bootstrapAuth,
    setCurrentUser,
    getCurrentUser,
    getProducts,
    loadProducts,
    loadSales,
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
    getSalesBetween,
    getSalesForToday,
    getSalesForWeek,
    getSalesForMonth,
    getTopSeller,
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport,
    getMonthlyProductSalesMap,
    getTodayStart,
    getTomorrowStart,
    getMonthStart,
    getNextMonthStart,
    getWeekStart,
    getNextWeekStart
  };
})(window);