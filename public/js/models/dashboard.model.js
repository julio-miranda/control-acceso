// js/models/dashboard.model.js
(function (global) {
  "use strict";

  function getSupabase() {
    if (!global.supabase) {
      throw new Error("Supabase no está inicializado.");
    }
    return global.supabase;
  }

  function logError(context, error, extra = {}) {
    console.log(`[DashboardModel] ${context}`, {
      message: error?.message,
      error,
      ...extra
    });
  }

  const ID_CANDIDATES = {
    usuarios: ["usuarios_id", "id"],
    contactos: ["contactos_id", "id"],
    sucursales: ["sucursales_id", "id"],
    empresa: ["empresa_id", "id"],
    productos: ["productos_id", "id"],
    clientes_vip: ["clientes_vip_id", "id"],
    ventas: ["ventas_id", "id"],
    venta_detalle: ["venta_detalle_id", "id"],
    recetas: ["recetas_id", "id"],
    receta_detalle: ["receta_detalle_id", "id"],
    mesas: ["mesas_id", "id"],
    jornadas: ["jornadas_id", "id"],
    movimientos_stock_base: ["movimientos_stock_base_id", "id"]
  };

  function getIdCandidates(table) {
    return ID_CANDIDATES[table] || ["id"];
  }

  function composeSelect(fields, idColumn) {
    const base = String(fields || "").trim();
    if (!idColumn || idColumn === "id") {
      return base ? `id,${base}` : "id";
    }
    return base ? `id:${idColumn},${base}` : `id:${idColumn}`;
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

    if (value?.seconds) {
      const d = new Date(value.seconds * 1000);
      return Number.isNaN(d.getTime()) ? null : d;
    }

    if (typeof value?.toDate === "function") {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }

    return null;
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

  function normalizeRowId(row, idColumn) {
    if (!row) return row;
    if (row.id == null && idColumn && row[idColumn] != null) {
      row.id = row[idColumn];
    }
    return row;
  }

  async function queryWithIdFallback(table, options, buildQuery) {
    const supabase = getSupabase();
    const candidates = getIdCandidates(table);
    let lastError = null;

    for (const idColumn of candidates) {
      try {
        const query = buildQuery(supabase.from(table), idColumn);
        const { data, error } = await query;

        if (error) {
          lastError = error;
          continue;
        }

        const rows = Array.isArray(data) ? data : (data ? [data] : []);
        return {
          data: rows.map(row => normalizeRowId({ ...row }, idColumn)),
          error: null,
          idColumn
        };
      } catch (err) {
        lastError = err;
      }
    }

    logError(`queryWithIdFallback(${table})`, lastError, options || {});
    return { data: null, error: lastError, idColumn: null };
  }

  async function fetchManyByIds(table, ids, select = "*") {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return {};

    try {
      const { data, error } = await queryWithIdFallback(
        table,
        { ids: unique, select },
        (qb, idColumn) => qb.select(composeSelect(select, idColumn)).in(idColumn, unique)
      );

      if (error) return {};
      return Object.fromEntries((data || []).map(row => [row.id, row]));
    } catch (err) {
      logError(`fetchManyByIds(${table})(catch)`, err, { ids: unique });
      return {};
    }
  }

  async function fetchOneById(table, id, select = "*") {
    if (!id) return null;

    try {
      const { data, error } = await queryWithIdFallback(
        table,
        { id, select },
        (qb, idColumn) => qb.select(composeSelect(select, idColumn)).eq(idColumn, id).maybeSingle()
      );

      if (error) return null;
      return data?.[0] || null;
    } catch (err) {
      logError(`fetchOneById(${table})(catch)`, err, { id });
      return null;
    }
  }

  async function fetchAllRows(table, select = "*", buildExtraQuery = null) {
    try {
      const { data, error } = await queryWithIdFallback(
        table,
        { select },
        (qb, idColumn) => {
          let q = qb.select(composeSelect(select, idColumn));
          if (typeof buildExtraQuery === "function") {
            q = buildExtraQuery(q, idColumn);
          }
          return q;
        }
      );

      if (error) return [];
      return data || [];
    } catch (err) {
      logError(`fetchAllRows(${table})(catch)`, err);
      return [];
    }
  }

  async function getAuthUser() {
    const supabase = getSupabase();

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        logError("getAuthUser", error);
      }
      return data?.user || null;
    } catch (err) {
      logError("getAuthUser(catch)", err);
      return null;
    }
  }

  async function getCurrentUserProfile(userId) {
    const supabase = getSupabase();

    try {
      const authUser = await getAuthUser();

      const user = await fetchOneById(
        "usuarios",
        userId,
        "role,sucursal_id,contacto_id,created_at,updated_at"
      );

      if (!user) {
        console.warn("[DashboardModel] Usuario no encontrado en tabla usuarios", { userId });

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
        fetchManyByIds(
          "contactos",
          user.contacto_id ? [user.contacto_id] : [],
          "nombre,telefono,email,identificacion,direccion,created_at,updated_at"
        ),
        fetchManyByIds(
          "sucursales",
          user.sucursal_id ? [user.sucursal_id] : [],
          "nombre,codigo,lat,lng,created_at,empresa_id"
        )
      ]);

      const contacto = user.contacto_id ? contactsMap[user.contacto_id] : null;
      const sucursal = user.sucursal_id ? sucursalesMap[user.sucursal_id] : null;

      let empresa = null;
      if (sucursal?.empresa_id) {
        empresa = await fetchOneById("empresa", sucursal.empresa_id, "nombre");
      }

      return {
        id: user.id,
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
          user.role ||
          authUser?.app_metadata?.role ||
          authUser?.user_metadata?.role ||
          "empleado"
        ).toLowerCase(),
        sucursal_id: user.sucursal_id || null,
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

  async function getProducts() {
    try {
      const products = await fetchAllRows(
        "productos",
        "sucursal_id,nombre,precio,created_at,updated_at,costo_promedio,activo",
        (q) => q.order("nombre", { ascending: true })
      );

      const movements = await fetchAllRows(
        "movimientos_stock_base",
        "producto_id,tipo,cantidad"
      );

      const stockMap = {};
      (movements || []).forEach(row => {
        const productId = row.producto_id;
        const qty = toNumber(row.cantidad);
        if (!productId || !Number.isFinite(qty)) return;

        const type = String(row.tipo || "").toLowerCase();
        let sign = 1;

        if (type === "salida" || type === "merma" || type === "consumo_receta") {
          sign = -1;
        } else if (type === "ajuste") {
          sign = 1;
        }

        stockMap[productId] = toNumber(stockMap[productId]) + (qty * sign);
      });

      return (products || []).map(product => ({
        ...product,
        stock: toNumber(stockMap[product.id])
      }));
    } catch (err) {
      logError("getProducts(catch)", err);
      return [];
    }
  }

  async function getVipClients() {
    try {
      const clients = await fetchAllRows(
        "clientes_vip",
        "sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id",
        (q) => q.order("fecha_alta", { ascending: false })
      );

      const contactIds = (clients || []).map(c => c.contacto_id).filter(Boolean);
      const contactsMap = await fetchManyByIds(
        "contactos",
        contactIds,
        "nombre,telefono,email,identificacion,direccion,created_at,updated_at"
      );

      return (clients || []).map(client => {
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

  async function decorateSales(rows) {
    const userIds = [...new Set((rows || []).map(r => r.usuario_id).filter(Boolean))];
    const clientIds = [...new Set((rows || []).map(r => r.cliente_vip_id).filter(Boolean))];

    const [usersMap, clientsMap] = await Promise.all([
      fetchManyByIds("usuarios", userIds, "role,sucursal_id,contacto_id,created_at,updated_at"),
      fetchManyByIds("clientes_vip", clientIds, "sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
    ]);

    const userContactIds = Object.values(usersMap).map(u => u.contacto_id).filter(Boolean);
    const clientContactIds = Object.values(clientsMap).map(c => c.contacto_id).filter(Boolean);
    const userSucursalIds = Object.values(usersMap).map(u => u.sucursal_id).filter(Boolean);

    const [userContactsMap, clientContactsMap, sucursalesMap] = await Promise.all([
      fetchManyByIds("contactos", userContactIds, "nombre,telefono,email,identificacion,direccion,created_at,updated_at"),
      fetchManyByIds("contactos", clientContactIds, "nombre,telefono,email,identificacion,direccion,created_at,updated_at"),
      fetchManyByIds("sucursales", userSucursalIds, "nombre,codigo,lat,lng,created_at,empresa_id")
    ]);

    const empresaIds = [...new Set(Object.values(sucursalesMap).map(s => s.empresa_id).filter(Boolean))];
    const empresasMap = await fetchManyByIds("empresa", empresaIds, "nombre");

    return (rows || []).map(row => {
      const user = usersMap[row.usuario_id] || null;
      const userContact = user?.contacto_id ? userContactsMap[user.contacto_id] : null;
      const sucursal = user?.sucursal_id ? sucursalesMap[user.sucursal_id] : null;
      const empresa = sucursal?.empresa_id ? empresasMap[sucursal.empresa_id] : null;

      const client = clientsMap[row.cliente_vip_id] || null;
      const clientContact = client?.contacto_id ? clientContactsMap[client.contacto_id] : null;

      return {
        ...row,
        usuario_nombre: userContact?.nombre || null,
        usuario_email: userContact?.email || null,
        sucursal_id: user?.sucursal_id || null,
        sucursal_nombre: sucursal?.nombre || null,
        empresa_id: sucursal?.empresa_id || null,
        empresa_nombre: empresa?.nombre || null,
        cliente_nombre: clientContact?.nombre || null,
        cliente_email: clientContact?.email || null,
        cliente_telefono: clientContact?.telefono || null,
        cliente_identificacion: clientContact?.identificacion || null
      };
    });
  }

  async function getSalesBetween(startDate, endDate) {
    try {
      const supabase = getSupabase();
      let query = supabase
        .from("ventas")
        .select("usuario_id,subtotal,descuento,impuesto,total,metodo_pago,estado,observacion,created_at,cliente_vip_id,evento_id")
        .eq("estado", "finalizada")
        .order("created_at", { ascending: false });

      if (startDate) query = query.gte("created_at", toIso(startDate));
      if (endDate) query = query.lt("created_at", toIso(endDate));

      const { data, error } = await query;

      if (error) {
        logError("getSalesBetween(ventas)", error, { startDate, endDate });
        return [];
      }

      return await decorateSales(data || []);
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
    try {
      const sales = await fetchAllRows(
        "ventas",
        "usuario_id,subtotal,descuento,impuesto,total,created_at,estado",
        (q) => q.eq("estado", "finalizada")
      );

      const grouped = new Map();

      (sales || []).forEach(row => {
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
      const { data, error } = await supabase
        .from("venta_detalle")
        .select("producto_id,cantidad,ventas!inner(created_at,estado)")
        .eq("ventas.estado", "finalizada")
        .gte("ventas.created_at", toIso(monthStart))
        .lt("ventas.created_at", toIso(nextMonthStart));

      if (error) {
        logError("getMonthlyProductSalesMap", error);
        return { unitsMap: {}, boxesMap: {}, totalBoxes: 0 };
      }

      const unitsMap = {};
      const boxesMap = {};
      let totalBoxes = 0;

      (data || []).forEach(row => {
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

  global.DashboardModel = {
    getCurrentUserProfile,
    getProducts,
    getVipClients,
    getSalesBetween,
    getSalesForToday,
    getSalesForWeek,
    getSalesForMonth,
    getTopSeller,
    getDailyReport,
    getWeeklyReport,
    getMonthlyReport,
    getMonthlyProductSalesMap,
    toDate,
    toNumber,
    getTodayStart,
    getTomorrowStart,
    getMonthStart,
    getNextMonthStart,
    getWeekStart,
    getNextWeekStart
  };
})(window);