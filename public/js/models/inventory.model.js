// js/models/inventory.model.js
(function (global) {
  "use strict";

  const supabase = global.supabase;
  const AuthModel = global.AuthModel || null;

  function getSupabase() {
    if (!global.supabase) {
      throw new Error("Supabase no inicializado.");
    }
    return global.supabase;
  }

  function logError(context, error, extra = {}) {
    console.log(`[InventoryModel] ${context}`, {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
      error,
      ...extra
    });
  }

  if (!supabase) {
    console.error("Supabase no inicializado.");
    return;
  }

  const LOW_STOCK_THRESHOLD = 5;
  const RECIPE_SELECT = "recetas_id,sucursal_id,nombre,descripcion,rendimiento,activa,created_at,updated_at";

  const state = {
    productsCache: {},
    cart: [],
    usersCache: {},
    currentUser: null,
    context: {
      userId: null,
      userName: "",
      role: "",
      empresaId: null,
      sucursalId: null,
      empresaNombre: ""
    },
    productsChannel: null,
    salesChannel: null,
    recipesCache: []
  };

  const currency = (n) => `$${Number(n || 0).toFixed(2)}`;

  function getValue(obj, keys, fallback = "") {
    if (!obj) return fallback;
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
    }
    return fallback;
  }

  function parseDate(value) {
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

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function toIso(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  function getTodayStart(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getTomorrowStart(date = new Date()) {
    const d = getTodayStart(date);
    d.setDate(d.getDate() + 1);
    return d;
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

  function getMonthStart(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getNextMonthStart(date = new Date()) {
    const d = getMonthStart(date);
    d.setMonth(d.getMonth() + 1);
    return d;
  }

  function setContext(ctx = {}) {
    state.context = {
      userId: ctx.userId ?? null,
      userName: ctx.userName || "",
      role: String(ctx.role || "").toLowerCase(),
      empresaId: ctx.empresaId ?? null,
      sucursalId: ctx.sucursalId ?? null,
      empresaNombre: ctx.empresaNombre || ""
    };

    if (state.context.userId) {
      global.adminUser = {
        id: state.context.userId,
        nombre: state.context.userName,
        role: state.context.role,
        empresa_id: state.context.empresaId,
        sucursal_id: state.context.sucursalId
      };
    }

    if (state.context.empresaId !== null && state.context.empresaId !== undefined) {
      global.adminEmpresa = String(state.context.empresaId);
    }

    if (state.context.sucursalId !== null && state.context.sucursalId !== undefined) {
      global.adminSucursal = String(state.context.sucursalId);
    }

    if (state.context.empresaNombre) {
      global.adminEmpresaNombre = state.context.empresaNombre;
    }

    return getContext();
  }

  function getContext() {
    return { ...state.context };
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

  function normalizeId(row, table = "") {
    if (!row) return null;

    const tableName = String(table || "").toLowerCase();
    const singular = tableName.endsWith("s") ? tableName.slice(0, -1) : tableName;

    const candidates = [
      row.id,
      row.recetas_id,
      row.receta_detalle_id,
      row.productos_preparados_id,
      row.productos_insumo_id,
      row.productos_id,
      row.producto_id,
      row.receta_id,
      row.usuario_id,
      row.venta_id,
      row.contacto_id,
      row.sucursal_id,
      row.empresa_id,
      row.cliente_vip_id,
      row[`${tableName}_id`],
      row[`${singular}_id`]
    ];

    const found = candidates.find(
      (v) => v !== undefined && v !== null && String(v).trim() !== ""
    );

    return found ?? null;
  }

  function inferType(productId, preparedMap, insumoMap) {
    if (preparedMap?.has(String(productId))) return "trago_preparado";
    if (insumoMap?.has(String(productId))) return "insumo";
    return "botella";
  }

  async function fetchTableRows(table, select = "*") {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from(table)
        .select(select);

      if (error) {
        logError(`fetchTableRows(${table})`, error);
        return [];
      }

      return Array.isArray(data) ? data : (data ? [data] : []);
    } catch (err) {
      logError(`fetchTableRows(${table})(catch)`, err);
      return [];
    }
  }

  async function fetchManyByIds(table, ids, select = "*", idField = "id") {
    const supabase = getSupabase();
    const unique = [...new Set((ids || []).filter(Boolean).map(String))];
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

      return Object.fromEntries(
        (data || []).map((row) => [
          String(row.id ?? row[idField] ?? normalizeId(row, table) ?? ""),
          row
        ]).filter(([id]) => id)
      );
    } catch (err) {
      logError(`fetchManyByIds(${table})(catch)`, err, { ids: unique, idField });
      return {};
    }
  }

  function normalizeProduct(row, stockMap = new Map(), preparedMap = new Map(), insumoMap = new Map(), recipeMap = new Map()) {
    const id = normalizeId(row, "productos");

    return {
      id: String(id || ""),
      producto_id: String(id || ""),
      nombre: String(getValue(row, ["nombre", "name", "producto", "descripcion"], "Sin nombre")),
      tipo_producto: inferType(id, preparedMap, insumoMap),
      receta_id: recipeMap.get(String(id)) || null,
      stock: Number(stockMap.get(String(id)) ?? 0) || 0,
      precio: Number(getValue(row, ["precio", "price"], 0)) || 0,
      costo_promedio: Number(getValue(row, ["costo_promedio", "costo", "avg_cost"], 0)) || 0,
      unidad_medida: String(insumoMap.get(String(id)) || "unidad"),
      activo: Boolean(getValue(row, ["activo"], true)),
      sucursal_id: getValue(row, ["sucursal_id"], null),
      empresa_id: getValue(row, ["empresa_id"], null),
      created_at: getValue(row, ["created_at"], null),
      updated_at: getValue(row, ["updated_at"], null)
    };
  }

  function normalizeVenta(row) {
    return {
      id: normalizeId(row, "ventas"),
      subtotal: Number(getValue(row, ["subtotal"], 0)) || 0,
      descuento: Number(getValue(row, ["descuento"], 0)) || 0,
      impuesto: Number(getValue(row, ["impuesto"], 0)) || 0,
      total: Number(getValue(row, ["total"], 0)) || 0,
      costo_estandar_total: Number(getValue(row, ["costo_estandar_total"], 0)) || 0,
      costo_real_total: Number(getValue(row, ["costo_real_total"], 0)) || 0,
      metodo_pago: getValue(row, ["metodo_pago"], "efectivo"),
      estado: getValue(row, ["estado"], "finalizada"),
      observacion: getValue(row, ["observacion"], null),
      usuario_id: getValue(row, ["usuario_id"], null),
      sucursal_id: getValue(row, ["sucursal_id"], null),
      cliente_vip_id: getValue(row, ["cliente_vip_id"], null),
      evento_id: getValue(row, ["evento_id"], null),
      created_at: getValue(row, ["created_at"], null),
      kind: getValue(row, ["kind"], null),
      nombre_reserva: getValue(row, ["nombre_reserva"], null),
      usuario_reserva_nombre: getValue(row, ["usuario_reserva_nombre"], null),
      usuario_nombre: getValue(row, ["usuario_nombre"], null),
      venta_detalle: Array.isArray(row?.venta_detalle) ? row.venta_detalle : []
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

  async function getSessionUid() {
    try {
      if (AuthModel && typeof AuthModel.getCurrentUser === "function") {
        const { user, error } = await AuthModel.getCurrentUser();
        if (!error && user?.id) return user.id;
      }

      if (typeof global.getSessionData === "function") {
        const s = await global.getSessionData();
        if (s?.uid) return s.uid;
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

      if (supabase?.auth?.getUser) {
        const { data, error } = await supabase.auth.getUser();
        if (!error && data?.user?.id) return data.user.id;
      }

      return null;
    } catch (e) {
      console.warn("getSessionUid error:", e);
      return null;
    }
  }

  async function fetchUserFromDBById(uid) {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
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

      const { data: rawUser, error: rawError } = await supabase
        .from("usuarios")
        .select("id:usuarios_id,role,sucursal_id,contacto_id,created_at,updated_at")
        .eq("usuarios_id", uid)
        .maybeSingle();

      if (rawError || !rawUser) return null;

      let contacto = null;
      if (rawUser.contacto_id) {
        const { data: c } = await supabase
          .from("contactos")
          .select("id:contactos_id,nombre,telefono,email,direccion")
          .eq("contactos_id", rawUser.contacto_id)
          .maybeSingle();
        contacto = c || null;
      }

      let sucursal = null;
      if (rawUser.sucursal_id) {
        const { data: s } = await supabase
          .from("sucursales")
          .select("id:sucursales_id,nombre,codigo,empresa_id")
          .eq("sucursales_id", rawUser.sucursal_id)
          .maybeSingle();
        sucursal = s || null;
      }

      return {
        id: uid,
        nombre: contacto?.nombre || "Usuario",
        email: contacto?.email || null,
        telefono: contacto?.telefono || null,
        direccion: contacto?.direccion || null,
        role: String(rawUser.role || "empleado").toLowerCase(),
        sucursal_id: rawUser.sucursal_id || null,
        empresa_id: sucursal?.empresa_id || null,
        created_at: rawUser.created_at || null
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

      if (supabase?.auth?.getUser) {
        const { data: authData } = await supabase.auth.getUser();
        const authUser = authData?.user || null;

        if (authUser) {
          return setCurrentUser({
            id: authUser.id,
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
          });
        }
      }

      return null;
    } catch (e) {
      console.error("bootstrapAuth error:", e);
      return null;
    }
  }

  async function loadProductRelations(productIds = []) {
    const unique = [...new Set((productIds || []).filter(Boolean).map(String))];
    const preparedMap = new Map();
    const insumoMap = new Map();
    const recipeMap = new Map();

    if (!unique.length) return { preparedMap, insumoMap, recipeMap };

    try {
      const [preparedRows, insumoRows] = await Promise.all([
        fetchTableRows("productos_preparados", "productos_preparados_id,receta_id"),
        fetchTableRows("productos_insumo", "productos_insumo_id,unidad_medida")
      ]);

      (preparedRows || []).forEach((r) => {
        const rid = String(normalizeId(r, "productos_preparados") || "");
        if (!rid || !unique.includes(rid)) return;
        preparedMap.set(rid, true);
        if (r.receta_id) recipeMap.set(rid, r.receta_id);
      });

      (insumoRows || []).forEach((r) => {
        const rid = String(normalizeId(r, "productos_insumo") || "");
        if (!rid || !unique.includes(rid)) return;
        insumoMap.set(rid, r.unidad_medida || "unidad");
      });
    } catch (e) {
      console.warn("loadProductRelations error:", e);
    }

    return { preparedMap, insumoMap, recipeMap };
  }

  async function loadStockMap() {
    const stockMap = new Map();

    try {
      const { data, error } = await supabase
        .from("movimientos_stock_base")
        .select("producto_id,tipo,cantidad");

      if (error) {
        console.warn("loadStockMap error:", error);
        return stockMap;
      }

      (data || []).forEach((row) => {
        const productId = String(row.producto_id || "");
        if (!productId) return;

        const qty = Number(row.cantidad || 0) || 0;
        if (!qty) return;

        const type = String(row.tipo || "").toLowerCase();
        let sign = 1;

        if (type === "salida" || type === "merma" || type === "consumo_receta") {
          sign = -1;
        } else if (type === "ajuste") {
          sign = qty < 0 ? -1 : 1;
        }

        stockMap.set(productId, Number(stockMap.get(productId) || 0) + (qty * sign));
      });
    } catch (e) {
      console.warn("loadStockMap catch:", e);
    }

    return stockMap;
  }

  async function getCurrentUserProfile(userId) {
    const supabase = getSupabase();

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) logError("getCurrentUserProfile(auth.getUser)", authError, { userId });

      const authUser = authData?.user || null;

      const { data: userData, error: userError } = await supabase
        .from("usuarios")
        .select("id:usuarios_id,contacto_id,role,sucursal_id,created_at,updated_at")
        .eq("usuarios_id", userId)
        .maybeSingle();

      if (userError || !userData) {
        return {
          id: authUser?.id || userId,
          nombre:
            authUser?.user_metadata?.nombre ||
            authUser?.app_metadata?.nombre ||
            authUser?.email ||
            "Usuario",
          email: authUser?.email || null,
          telefono: null,
          identificacion: null,
          direccion: null,
          role: String(
            authUser?.app_metadata?.role ||
            authUser?.user_metadata?.role ||
            "empleado"
          ).toLowerCase(),
          sucursal_id: authUser?.app_metadata?.sucursal_id || authUser?.user_metadata?.sucursal_id || null,
          sucursal_nombre: null,
          empresa_id: authUser?.app_metadata?.empresa_id || authUser?.user_metadata?.empresa_id || null,
          empresa_nombre: authUser?.app_metadata?.empresa_nombre || authUser?.user_metadata?.empresa_nombre || null,
          incomplete_profile: true
        };
      }

      const [contactsMap, sucursalesMap] = await Promise.all([
        fetchManyByIds("contactos", userData.contacto_id ? [userData.contacto_id] : [], "*", "contactos_id"),
        fetchManyByIds("sucursales", userData.sucursal_id ? [userData.sucursal_id] : [], "*", "sucursales_id")
      ]);

      const contacto = userData.contacto_id ? contactsMap[userData.contacto_id] : null;
      const sucursal = userData.sucursal_id ? sucursalesMap[userData.sucursal_id] : null;

      let empresa = null;
      if (sucursal?.empresa_id) {
        const { data: empresaData } = await supabase
          .from("empresa")
          .select("empresa_id,nombre")
          .eq("empresa_id", sucursal.empresa_id)
          .maybeSingle();
        empresa = empresaData || null;
      }

      return {
        id: normalizeId(userData, "usuarios"),
        nombre:
          contacto?.nombre ||
          authUser?.user_metadata?.nombre ||
          authUser?.app_metadata?.nombre ||
          authUser?.email ||
          "Usuario",
        email: contacto?.email || authUser?.email || null,
        telefono: contacto?.telefono || null,
        identificacion: contacto?.identificacion || null,
        direccion: contacto?.direccion || null,
        role: String(
          userData.role ||
          authUser?.app_metadata?.role ||
          authUser?.user_metadata?.role ||
          "empleado"
        ).toLowerCase(),
        sucursal_id: userData.sucursal_id || null,
        sucursal_nombre: sucursal?.nombre || null,
        empresa_id: sucursal?.empresa_id || authUser?.app_metadata?.empresa_id || authUser?.user_metadata?.empresa_id || null,
        empresa_nombre: empresa?.nombre || authUser?.app_metadata?.empresa_nombre || authUser?.user_metadata?.empresa_nombre || null,
        incomplete_profile: false
      };
    } catch (err) {
      logError("getCurrentUserProfile(catch)", err, { userId });
      return {
        id: userId,
        nombre: "Usuario",
        email: null,
        telefono: null,
        identificacion: null,
        direccion: null,
        role: "empleado",
        sucursal_id: null,
        sucursal_nombre: null,
        empresa_id: null,
        empresa_nombre: null,
        incomplete_profile: true
      };
    }
  }

  async function loadSales({ limit = 50 } = {}) {
    const supabase = getSupabase();

    try {
      const [ventasRes, detallesRes, productosRes, usersRes] = await Promise.all([
        supabase
          .from("ventas")
          .select("id:ventas_id,usuario_id,subtotal,descuento,impuesto,total,metodo_pago,estado,observacion,created_at,cliente_vip_id,evento_id")
          .eq("estado", "finalizada")
          .order("created_at", { ascending: false })
          .limit(limit),

        supabase
          .from("venta_detalle")
          .select("venta_id,producto_id,cantidad,precio_unitario,total_linea,costo_unitario,created_at,receta_id")
          .order("created_at", { ascending: false }),

        supabase
          .from("productos")
          .select("id:productos_id,nombre,costo_promedio,precio,activo"),

        supabase
          .from("v_usuarios")
          .select("id,nombre,email")
      ]);

      const ventas = ventasRes.error ? [] : (ventasRes.data || []);
      const detalles = detallesRes.error ? [] : (detallesRes.data || []);
      const productos = productosRes.error ? [] : (productosRes.data || []);
      const users = usersRes.error ? [] : (usersRes.data || []);

      const productMap = Object.fromEntries(
        (productos || [])
          .map((p) => [String(normalizeId(p, "productos") || ""), p])
          .filter(([id]) => id)
      );

      const userMap = Object.fromEntries(
        (users || [])
          .map((u) => [String(normalizeId(u, "usuarios") || ""), u])
          .filter(([id]) => id)
      );

      const detailsBySale = {};
      (detalles || []).forEach((d) => {
        const ventaId = String(d.venta_id || "");
        if (!ventaId) return;
        if (!detailsBySale[ventaId]) detailsBySale[ventaId] = [];
        detailsBySale[ventaId].push({
          ...d,
          productos: productMap[String(d.producto_id || "")] || null
        });
      });

      const result = (ventas || [])
        .map((v) => {
          const ventaId = String(normalizeId(v, "ventas") || "");
          const ventaDetalles = detailsBySale[ventaId] || [];

          const costoRealTotal = ventaDetalles.reduce((sum, d) => {
            const qty = Number(d.cantidad || 0) || 0;
            const unit = Number(d.costo_unitario || d.productos?.costo_promedio || 0) || 0;
            return sum + (qty * unit);
          }, 0);

          const costoEstandarTotal = ventaDetalles.reduce((sum, d) => {
            const qty = Number(d.cantidad || 0) || 0;
            const unit = Number(d.productos?.costo_promedio || d.costo_unitario || 0) || 0;
            return sum + (qty * unit);
          }, 0);

          return normalizeVenta({
            ...v,
            usuario_nombre: userMap[String(v.usuario_id || "")]?.nombre || null,
            costo_real_total: costoRealTotal,
            costo_estandar_total: costoEstandarTotal,
            venta_detalle: ventaDetalles
          });
        })
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .slice(0, limit);

      return result;
    } catch (err) {
      logError("loadSales(catch)", err);
      return [];
    }
  }

  async function getSalesBetween(startDate, endDate) {
    const supabase = getSupabase();

    try {
      let query = supabase
        .from("ventas")
        .select("id:ventas_id,usuario_id,subtotal,descuento,impuesto,total,metodo_pago,estado,observacion,created_at,cliente_vip_id,evento_id")
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
        .select("id:ventas_id,usuario_id,subtotal,descuento,impuesto,total,created_at,estado")
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

      const profile = await getCurrentUserProfile(top.usuario_id);

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
    const key = dateValue instanceof Date ? dateValue.toISOString().slice(0, 10) : String(dateValue || "");

    try {
      const rows = await fetchTableRows(viewName, "*");
      return rows.find((r) => String(r[fieldName] || "") === key) || null;
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
    const monthStart = getMonthStart();
    const nextMonthStart = getNextMonthStart();

    try {
      const sales = await loadSales({ limit: 2000 });

      const unitsMap = {};
      const boxesMap = {};
      let totalBoxes = 0;

      (sales || []).forEach((sale) => {
        const saleDate = parseDate(sale.created_at);
        if (!saleDate) return;
        if (saleDate < monthStart || saleDate >= nextMonthStart) return;

        (sale.venta_detalle || []).forEach((row) => {
          const productId = row.producto_id;
          const qty = toNumber(row.cantidad);

          if (!productId || qty <= 0) return;

          unitsMap[productId] = (unitsMap[productId] || 0) + qty;
          boxesMap[productId] = (boxesMap[productId] || 0) + 0;
          totalBoxes += 0;
        });
      });

      return { unitsMap, boxesMap, totalBoxes };
    } catch (err) {
      logError("getMonthlyProductSalesMap(catch)", err);
      return { unitsMap: {}, boxesMap: {}, totalBoxes: 0 };
    }
  }

  async function getProductById(productId) {
    try {
      const { data, error } = await supabase
        .from("productos")
        .select("id:productos_id,nombre,precio,costo_promedio,activo,sucursal_id,created_at,updated_at")
        .eq("productos_id", productId)
        .maybeSingle();

      if (error || !data) return null;

      const stockMap = await loadStockMap();
      const { preparedMap, insumoMap, recipeMap } = await loadProductRelations([productId]);

      return normalizeProduct(data, stockMap, preparedMap, insumoMap, recipeMap);
    } catch (err) {
      logError("getProductById(catch)", err, { productId });
      return null;
    }
  }

  async function getProducts() {
    return loadProducts();
  }

  async function loadProducts() {
    try {
      const [productsRows, sales, stockMap] = await Promise.all([
        fetchTableRows("productos", "id:productos_id,sucursal_id,nombre,precio,costo_promedio,activo,created_at,updated_at"),
        loadSales({ limit: 50 }),
        loadStockMap()
      ]);

      const productIds = (productsRows || []).map((p) => normalizeId(p, "productos")).filter(Boolean);
      const { preparedMap, insumoMap, recipeMap } = await loadProductRelations(productIds);

      const products = (productsRows || []).map((product) =>
        normalizeProduct(product, stockMap, preparedMap, insumoMap, recipeMap)
      );

      const forecastMap = {};
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const firstDay = new Date(year, month, 1);
      const daysElapsed = Math.max(1, Math.ceil((now - firstDay) / 86400000) + 1);
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (const sale of sales || []) {
        const saleDate = parseDate(sale.created_at);
        if (!saleDate) continue;
        if (saleDate.getFullYear() !== year || saleDate.getMonth() !== month) continue;

        const details = Array.isArray(sale.venta_detalle) ? sale.venta_detalle : [];
        for (const d of details) {
          const productId = d.producto_id || d.productos?.id || null;
          if (!productId) continue;

          const qty = Number(d.cantidad || 0) || 0;
          if (!forecastMap[productId]) {
            forecastMap[productId] = {
              soldThisMonth: 0,
              avgDaily: 0,
              projectedNextMonth: 0,
              suggested: 0
            };
          }

          forecastMap[productId].soldThisMonth += qty;
        }
      }

      for (const product of products) {
        const soldThisMonth = Number(forecastMap[product.id]?.soldThisMonth || 0);
        const avgDaily = soldThisMonth / daysElapsed;
        const projectedNextMonth = avgDaily * daysInMonth;

        forecastMap[product.id] = {
          soldThisMonth,
          avgDaily,
          projectedNextMonth,
          suggested: Math.max(0, Math.ceil(projectedNextMonth - Number(product.stock || 0)))
        };
      }

      state.productsCache = {};
      products.forEach((p) => {
        state.productsCache[p.id] = p;
      });

      return { products, forecastMap };
    } catch (e) {
      console.error("loadProducts error:", e);
      return { products: [], forecastMap: {} };
    }
  }

  async function getSuggestionForProduct(productId, stock, forecastMap = {}) {
    const forecast = forecastMap?.[productId] || {
      soldThisMonth: 0,
      avgDaily: 0,
      projectedNextMonth: 0,
      suggested: 0
    };

    const suggested = Math.max(0, Math.ceil(Number(forecast.projectedNextMonth || 0) - Number(stock || 0)));

    return {
      soldThisMonth: Number(forecast.soldThisMonth || 0),
      avgDaily: Number(forecast.avgDaily || 0),
      projectedNextMonth: Number(forecast.projectedNextMonth || 0),
      suggested
    };
  }

  async function fetchUserName(userId) {
    if (!userId) return "-";

    if (state.usersCache[userId]) {
      return state.usersCache[userId];
    }

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

      state.usersCache[userId] = "Desconocido";
      return state.usersCache[userId];
    } catch (e) {
      console.error("Error obteniendo usuario:", e);
      state.usersCache[userId] = "Error";
      return state.usersCache[userId];
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

  function updateCartQuantity(index, qty) {
    const item = state.cart[index];
    if (!item) {
      return { ok: false, message: "Ítem no encontrado" };
    }

    const value = Math.max(1, Number(qty || 1));
    const product = state.productsCache[item.productId];
    const stock = Number(product?.stock || 0);

    const alreadyOther = state.cart
      .filter((_, i) => i !== index && String(state.cart[i].productId) === String(item.productId))
      .reduce((sum, i) => sum + Number(i.cantidad || 0), 0);

    if ((value + alreadyOther) > stock) {
      return { ok: false, message: `Stock disponible: ${stock}` };
    }

    item.cantidad = value;
    item.total = item.cantidad * item.precio_unitario;
    return { ok: true };
  }

  function addToCart(productId, qty = 1) {
    const key = String(productId || "");
    const prod = state.productsCache[key];

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

    if ((already + cantidad) > Number(prod.stock || 0)) {
      return { ok: false, message: `Stock disponible: ${prod.stock}` };
    }

    if (currentInCart) {
      currentInCart.cantidad += cantidad;
      currentInCart.total = Number(currentInCart.cantidad) * Number(currentInCart.precio_unitario);
    } else {
      state.cart.push({
        kind: "product",
        productId: key,
        saleProductId: String(prod.producto_id || prod.id),
        nombre: prod.nombre,
        precio_unitario: Number(prod.precio || 0),
        cantidad,
        total: Number(cantidad) * Number(prod.precio || 0)
      });
    }

    return { ok: true, message: "Producto añadido" };
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
    const empresaId = String(currentUser?.empresa_id || state.context?.empresaId || global.adminEmpresa || "").trim();
    const sucursalId = String(currentUser?.sucursal_id || state.context?.sucursalId || global.adminSucursal || "").trim();
    const usuarioId = String(currentUser?.id || state.context?.userId || "").trim();

    if (!currentUser || !usuarioId || !empresaId || !sucursalId) {
      return { ok: false, message: "No se pudo detectar la sesión, empresa o sucursal del usuario." };
    }

    const payload = {
      p_empresa_id: empresaId,
      p_sucursal_id: sucursalId,
      p_usuario_id: usuarioId,
      p_metodo_pago: String(metodoPago || "efectivo"),
      p_descuento: Number(descuento || 0),
      p_impuesto: Number(impuesto || 0),
      p_observacion: observacion,
      p_items: state.cart.map((i) => ({
        saleProductId: i.saleProductId || i.productId,
        producto_id: i.productId,
        product_id: i.productId,
        cantidad: Number(i.cantidad || 0),
        precio_unitario: Number(i.precio_unitario || 0)
      }))
    };

    const { data, error } = await supabase.rpc("registrar_venta_app", payload);

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("No se pudo registrar la venta.");
    }

    state.cart = [];
    return { ok: true, data };
  }

  function saveDraft() {
    if (!state.cart.length) {
      return { ok: false, message: "Carrito vacío" };
    }

    const draft = {
      created_at: new Date().toISOString(),
      user_id: state.currentUser?.id || state.context?.userId || null,
      empresa_id: state.currentUser?.empresa_id || state.context?.empresaId || global.adminEmpresa || null,
      sucursal_id: state.currentUser?.sucursal_id || state.context?.sucursalId || global.adminSucursal || null,
      items: state.cart
    };

    localStorage.setItem("sales_draft_v1", JSON.stringify(draft));
    return { ok: true, draft };
  }

  async function registerStockMovement(payload) {
    const supabase = getSupabase();

    try {
      const insertPayload = {
        producto_id: payload.producto_id,
        usuario_id: payload.usuario_id ?? state.context?.userId ?? state.currentUser?.id ?? null,
        tipo: payload.tipo || "ajuste",
        cantidad: Number(payload.cantidad || 0) || 0,
        costo: Number(payload.costo || 0) || 0,
        referencia_tipo: payload.referencia_tipo || null,
        referencia_id: payload.referencia_id || null,
        observacion: payload.observacion || null
      };

      const { data, error } = await supabase
        .from("movimientos_stock_base")
        .insert(insertPayload)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      return data || insertPayload;
    } catch (e) {
      console.error("registerStockMovement error:", e);
      throw e;
    }
  }

  async function getMovementHistory(productId) {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase
        .from("movimientos_stock_base")
        .select("*")
        .eq("producto_id", productId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = data || [];
      const userIds = [...new Set(rows.map((r) => r.usuario_id).filter(Boolean))];
      const usersMap = await fetchManyByIds("v_usuarios", userIds, "id,nombre,email", "id");

      return rows.map((row) => ({
        ...row,
        usuarios: {
          nombre: usersMap[row.usuario_id]?.nombre || "Sistema"
        }
      }));
    } catch (e) {
      console.error("getMovementHistory error:", e);
      return [];
    }
  }

  async function getRecipes() {
    try {
      const [recipes, preparedRows, productsRows] = await Promise.all([
        fetchTableRows("recetas", RECIPE_SELECT),
        fetchTableRows("productos_preparados", "productos_preparados_id,receta_id"),
        fetchTableRows("productos", "id:productos_id,nombre")
      ]);

      const productMap = Object.fromEntries(
        (productsRows || [])
          .map((p) => [String(normalizeId(p, "productos") || ""), p])
          .filter(([id]) => id)
      );

      const preparedByRecipe = {};
      (preparedRows || []).forEach((r) => {
        const rid = String(r.receta_id || "");
        if (!rid) return;
        preparedByRecipe[rid] = normalizeId(r, "productos_preparados") || null;
      });

      return (recipes || []).map((r) => {
        const recipeId = String(normalizeId(r, "recetas") || "");
        const productId = preparedByRecipe[recipeId] || null;

        return {
          ...r,
          id: recipeId,
          recetas_id: recipeId,
          producto_id: productId,
          producto_nombre: productId && productMap[String(productId)] ? (productMap[String(productId)].nombre || "-") : "-"
        };
      });
    } catch (e) {
      console.error("getRecipes error:", e);
      return [];
    }
  }

  async function getRecipeDetails(recipeId) {
    try {
      const rows = await fetchTableRows("receta_detalle", "*");
      return (rows || [])
        .filter((r) => String(r.receta_id || "") === String(recipeId))
        .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    } catch (e) {
      console.error("getRecipeDetails error:", e);
      return [];
    }
  }

  async function getRecipeByProductId(productId) {
    try {
      const [links, recipes] = await Promise.all([
        fetchTableRows("productos_preparados", "productos_preparados_id,receta_id"),
        fetchTableRows("recetas", RECIPE_SELECT)
      ]);

      const link = (links || []).find(
        (l) => String(normalizeId(l, "productos_preparados") || "") === String(productId)
      );

      if (!link?.receta_id) return null;

      const recipe = (recipes || []).find(
        (r) => String(normalizeId(r, "recetas") || "") === String(link.receta_id)
      );

      if (!recipe) return null;

      const recipeId = normalizeId(recipe, "recetas");

      return {
        ...recipe,
        id: recipeId,
        recetas_id: recipeId,
        producto_id: productId
      };
    } catch (e) {
      console.error("getRecipeByProductId error:", e);
      return null;
    }
  }

  async function saveRowById(table, row, idField = "id") {
    const supabase = getSupabase();
    const payload = { ...row };
    const hasId = payload[idField] !== undefined && payload[idField] !== null && String(payload[idField]).trim() !== "";

    if (hasId) {
      const { data: updatedData, error: updateError } = await supabase
        .from(table)
        .update(payload)
        .eq(idField, payload[idField])
        .select("*")
        .maybeSingle();

      if (!updateError && updatedData) return updatedData;
      if (updateError) logError(`saveRowById.update(${table})`, updateError, { payload });
    }

    delete payload[idField];

    const { data: insertedData, error: insertError } = await supabase
      .from(table)
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (insertError) {
      logError(`saveRowById.insert(${table})`, insertError, { payload });
      throw insertError;
    }

    return insertedData || payload;
  }

  async function linkPreparedProduct(productId, recipeId) {
    try {
      if (!productId || !recipeId) {
        throw new Error("productId y recipeId son obligatorios.");
      }

      return await saveRowById("productos_preparados", {
        productos_preparados_id: productId,
        receta_id: recipeId
      }, "productos_preparados_id");
    } catch (err) {
      logError("linkPreparedProduct", err, { productId, recipeId });
      throw err;
    }
  }

  async function unlinkPreparedProduct(productId) {
    const supabase = getSupabase();

    try {
      const { error } = await supabase
        .from("productos_preparados")
        .delete()
        .eq("productos_preparados_id", productId);

      if (error) {
        logError("unlinkPreparedProduct", error, { productId });
        throw error;
      }

      return true;
    } catch (err) {
      logError("unlinkPreparedProduct(catch)", err, { productId });
      throw err;
    }
  }

  async function upsertInsumoProduct(productId, unidadMedida = "unidad") {
    try {
      if (!productId) throw new Error("productId es obligatorio.");

      return await saveRowById("productos_insumo", {
        productos_insumo_id: productId,
        unidad_medida: unidadMedida
      }, "productos_insumo_id");
    } catch (err) {
      logError("upsertInsumoProduct", err, { productId, unidadMedida });
      throw err;
    }
  }

  async function removeInsumoProduct(productId) {
    const supabase = getSupabase();

    try {
      const { error } = await supabase
        .from("productos_insumo")
        .delete()
        .eq("productos_insumo_id", productId);

      if (error) {
        logError("removeInsumoProduct", error, { productId });
        throw error;
      }

      return true;
    } catch (err) {
      logError("removeInsumoProduct(catch)", err, { productId });
      throw err;
    }
  }

  async function upsertRecipe(recipe) {
    const supabase = getSupabase();

    try {
      const existingRecipeId = recipe.recetas_id || recipe.id || null;
      const payload = {
        sucursal_id: recipe.sucursal_id ?? state.context?.sucursalId ?? global.adminSucursal ?? null,
        nombre: recipe.nombre,
        descripcion: recipe.descripcion || null,
        rendimiento: Number(recipe.rendimiento || 1) || 1,
        activa: recipe.activa !== false
      };

      let query;

      if (existingRecipeId) {
        query = supabase
          .from("recetas")
          .update(payload)
          .eq("recetas_id", existingRecipeId);
      } else {
        query = supabase
          .from("recetas")
          .insert(payload);
      }

      const { data, error } = await query
        .select(RECIPE_SELECT)
        .maybeSingle();

      if (error) {
        logError("upsertRecipe", error, { payload });
        throw error;
      }

      const recipeId = normalizeId(data, "recetas") || existingRecipeId;

      if (recipe.producto_id && recipeId) {
        await linkPreparedProduct(recipe.producto_id, recipeId);
      }

      return {
        ...data,
        id: recipeId,
        recetas_id: recipeId
      };
    } catch (e) {
      console.error("upsertRecipe error:", e);
      throw e;
    }
  }

  async function saveRecipeWithDetails(recipe, detalles = []) {
    const supabase = getSupabase();

    try {
      const recipeId = recipe.recetas_id || recipe.id || null;
      const sucursalId = recipe.sucursal_id ?? state.context?.sucursalId ?? global.adminSucursal ?? null;

      const payload = {
        p_receta_id: recipeId,
        p_sucursal_id: sucursalId,
        p_producto_id: recipe.producto_id || null,
        p_nombre: recipe.nombre,
        p_descripcion: recipe.descripcion || null,
        p_rendimiento: Number(recipe.rendimiento || 1) || 1,
        p_activa: recipe.activa !== false,
        p_detalles: (detalles || []).map((d) => ({
          insumo_id: d.insumo_id,
          cantidad: Number(d.cantidad || 0) || 0,
          desperdicio: Number(d.desperdicio || 0) || 0
        }))
      };

      const { data, error } = await supabase.rpc("guardar_receta_app", payload);

      if (error) {
        logError("saveRecipeWithDetails", error, { payload });
        throw error;
      }

      const saved = Array.isArray(data) ? data[0] : data;
      const savedId = saved?.id || saved?.recetas_id || recipeId;

      return {
        ...saved,
        id: savedId,
        recetas_id: savedId,
        producto_id: recipe.producto_id || saved?.producto_id || null
      };
    } catch (e) {
      console.error("saveRecipeWithDetails error:", e);
      throw e;
    }
  }

  async function replaceRecipeDetails(recipeId, detalles) {
    const supabase = getSupabase();

    try {
      const { error: deleteError } = await supabase
        .from("receta_detalle")
        .delete()
        .eq("receta_id", recipeId);

      if (deleteError) throw deleteError;

      const rows = (detalles || []).map((d) => ({
        receta_id: recipeId,
        insumo_id: d.insumo_id,
        cantidad: Number(d.cantidad || 0) || 0,
        desperdicio: Number(d.desperdicio || 0) || 0
      }));

      if (rows.length) {
        const { error: insertError } = await supabase
          .from("receta_detalle")
          .insert(rows);

        if (insertError) throw insertError;
      }

      return true;
    } catch (e) {
      console.error("replaceRecipeDetails error:", e);
      throw e;
    }
  }

  async function deleteRecipe(recipeId) {
    const supabase = getSupabase();

    try {
      await supabase.from("productos_preparados").delete().eq("receta_id", recipeId);
      await supabase.from("receta_detalle").delete().eq("receta_id", recipeId);

      const { error } = await supabase
        .from("recetas")
        .delete()
        .eq("recetas_id", recipeId);

      if (error) throw error;
      return true;
    } catch (e) {
      console.error("deleteRecipe error:", e);
      throw e;
    }
  }

  async function createProduct(payload) {
    const supabase = getSupabase();

    try {
      const insertPayload = {
        sucursal_id: payload.sucursal_id ?? state.context?.sucursalId ?? global.adminSucursal ?? null,
        nombre: payload.nombre,
        precio: Number(payload.precio || 0) || 0,
        costo_promedio: Number(payload.costo_promedio || 0) || 0,
        activo: payload.activo !== false
      };

      const { data, error } = await supabase
        .from("productos")
        .insert(insertPayload)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      const product = data || insertPayload;
      const productId = normalizeId(product, "productos");

      if (payload.tipo_producto === "insumo") {
        await upsertInsumoProduct(productId, payload.unidad_medida || "unidad");
      }

      const stock = Number(payload.stock || 0) || 0;
      if (stock > 0) {
        await registerStockMovement({
          producto_id: productId,
          tipo: "entrada",
          cantidad: stock,
          costo: Number(payload.costo_promedio || 0) || 0,
          observacion: "Stock inicial"
        });
      }

      state.productsCache[productId] = product;
      return await getProductById(productId);
    } catch (e) {
      console.error("createProduct error:", e);
      throw e;
    }
  }

  async function updateProduct(productId, payload) {
    const supabase = getSupabase();

    try {
      const updatePayload = {};

      if (payload.nombre !== undefined) updatePayload.nombre = payload.nombre;
      if (payload.precio !== undefined) updatePayload.precio = Number(payload.precio || 0) || 0;
      if (payload.costo_promedio !== undefined) updatePayload.costo_promedio = Number(payload.costo_promedio || 0) || 0;
      if (payload.activo !== undefined) updatePayload.activo = Boolean(payload.activo);
      if (payload.sucursal_id !== undefined) updatePayload.sucursal_id = payload.sucursal_id;

      const { data, error } = await supabase
        .from("productos")
        .update(updatePayload)
        .eq("productos_id", productId)
        .select("*")
        .maybeSingle();

      if (error) throw error;

      if (payload.tipo_producto === "insumo" && payload.unidad_medida) {
        await upsertInsumoProduct(productId, payload.unidad_medida);
      } else if (payload.tipo_producto === "trago_preparado") {
        // El vínculo se maneja al guardar la receta.
      } else if (payload.tipo_producto === "botella" || payload.tipo_producto === "servicio") {
        await removeInsumoProduct(productId).catch(() => {});
      }

      const product = data || { productos_id: productId, ...updatePayload };
      state.productsCache[productId] = product;
      return await getProductById(productId);
    } catch (e) {
      console.error("updateProduct error:", e);
      throw e;
    }
  }

  async function deleteProduct(productId) {
    const supabase = getSupabase();

    try {
      const { error } = await supabase
        .from("productos")
        .update({ activo: false })
        .eq("productos_id", productId);

      if (error) throw error;

      state.productsCache[productId] = {
        ...(state.productsCache[productId] || {}),
        activo: false
      };

      return true;
    } catch (e) {
      console.error("deleteProduct(error lógico) error:", e);
      throw e;
    }
  }

  async function subscribeRealtime(onProductsChange, onSalesChange) {
    if (typeof supabase.channel !== "function") return null;

    try {
      cleanupRealtime();

      state.productsChannel = supabase
        .channel("inventory-products-channel")
        .on("postgres_changes", { event: "*", schema: "public", table: "productos" }, async () => {
          if (typeof onProductsChange === "function") await onProductsChange();
        })
        .subscribe();

      state.salesChannel = supabase
        .channel("inventory-sales-channel")
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

  function cleanupRealtime() {
    try {
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

  global.inventoryModel = {
    LOW_STOCK_THRESHOLD,
    state,
    currency,
    getValue,
    parseDate,
    toNumber,
    setContext,
    getContext,
    setCurrentUser,
    getCurrentUser,
    normalizeId,
    normalizeProduct,
    normalizeVenta,
    saleDetailText,
    bootstrapAuth,
    loadProducts,
    getProducts,
    loadSales,
    getSalesBetween,
    getSalesForToday,
    getSalesForWeek,
    getSalesForMonth,
    getTopSeller,
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport,
    getMonthlyProductSalesMap,
    getSuggestionForProduct,
    fetchUserName,
    fetchTableRows,
    fetchManyByIds,
    getCart,
    getSubtotal,
    clearCart,
    removeCartItem,
    updateCartQuantity,
    addToCart,
    finalizeSale,
    saveDraft,
    registerStockMovement,
    getMovementHistory,
    getRecipes,
    getRecipeByProductId,
    getRecipeDetails,
    upsertRecipe,
    saveRecipeWithDetails,
    replaceRecipeDetails,
    deleteRecipe,
    linkPreparedProduct,
    unlinkPreparedProduct,
    upsertInsumoProduct,
    removeInsumoProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    subscribeRealtime,
    cleanupRealtime
  };

  global.salesModel = global.inventoryModel;
})(window);