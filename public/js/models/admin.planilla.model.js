// js/models/admin.planilla.model.js
(function (global) {
  function getSupabase() {
    if (!global.supabase) {
      throw new Error("Supabase no inicializado.");
    }
    return global.supabase;
  }

  function logError(context, error, extra = {}) {
    console.log(`[PlanillaModel] ${context}`, {
      message: error?.message,
      error,
      ...extra
    });
  }

  const PLANILLA_AJUSTES_KEY = "planilla_ajustes_v1";
  const HORAS_EXTRA_FACTOR = 2;
  const RENTA_THRESHOLD = 550;
  const RENTA_RATE = 0.10;

  function parseTimeString(timeStr) {
    if (!timeStr) return null;
    timeStr = String(timeStr).trim();

    const ampm = /(\d{1,2}:\d{2}(?::\d{2})?)\s*([ap]\.?m\.?)/i.exec(timeStr);
    if (ampm) {
      let [, t, ap] = ampm;
      const parts = t.split(":").map((n) => Number(n));
      let hh = parts[0], mm = parts[1] || 0, ss = parts[2] || 0;
      const isPM = /p/i.test(ap);

      if (isPM && hh < 12) hh += 12;
      if (!isPM && hh === 12) hh = 0;

      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }

    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
    if (match) {
      const hh = Number(match[1]);
      const mm = Number(match[2]);
      const ss = Number(match[3] || 0);

      return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }

    return null;
  }

  function crearFechaCompleta(fechaStr, timeStr) {
    if (!fechaStr) return null;

    const tnorm = parseTimeString(timeStr) || "00:00:00";
    const s = `${fechaStr}T${tnorm}`;
    const d = new Date(s);

    if (!isNaN(d.getTime())) return d;

    try {
      const [y, m, day] = String(fechaStr).split("-").map((n) => Number(n));
      const [hh, mm, ss] = tnorm.split(":").map((n) => Number(n));
      return new Date(y, m - 1, day, hh, mm, ss);
    } catch (e) {
      return new Date(s);
    }
  }

  function esJornadaNocturna(jornadaNombreOrObj) {
    const name =
      typeof jornadaNombreOrObj === "string"
        ? jornadaNombreOrObj.toLowerCase()
        : (jornadaNombreOrObj?.nombre || "").toString().toLowerCase();

    if (!name) return false;
    if (name.includes("noche") || name.includes("noct") || name.includes("night")) return true;

    if (jornadaNombreOrObj && jornadaNombreOrObj.start && jornadaNombreOrObj.end) {
      const s = parseTimeString(jornadaNombreOrObj.start) || "00:00:00";
      const e = parseTimeString(jornadaNombreOrObj.end) || "00:00:00";
      const sh = Number(s.split(":")[0]);
      const eh = Number(e.split(":")[0]);

      if (sh >= 20 || eh <= 6) return true;
    }

    return false;
  }

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

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function roundMoney(value) {
    return Number(toNumber(value).toFixed(2));
  }

  function getPayrollPeriodKey(fechaInicio, fechaFin) {
    return `${fechaInicio || ""}__${fechaFin || ""}`;
  }

  function readPayrollAdjustments() {
    try {
      if (!global.localStorage) return {};
      return JSON.parse(global.localStorage.getItem(PLANILLA_AJUSTES_KEY) || "{}") || {};
    } catch (e) {
      console.warn("readPayrollAdjustments:", e);
      return {};
    }
  }

  function writePayrollAdjustments(data) {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(PLANILLA_AJUSTES_KEY, JSON.stringify(data || {}));
      return true;
    } catch (e) {
      console.warn("writePayrollAdjustments:", e);
      return false;
    }
  }

  function getPayrollAdjustment(fechaInicio, fechaFin, uid) {
    const all = readPayrollAdjustments();
    const period = getPayrollPeriodKey(fechaInicio, fechaFin);
    const row = all?.[period]?.[uid] || {};

    return {
      bonificacion: roundMoney(row.bonificacion || 0),
      ayudaEconomica: roundMoney(row.ayudaEconomica || 0),
      nota: String(row.nota || "")
    };
  }

  function setPayrollAdjustment(fechaInicio, fechaFin, uid, adjustment = {}) {
    if (!uid) return false;

    const all = readPayrollAdjustments();
    const period = getPayrollPeriodKey(fechaInicio, fechaFin);

    if (!all[period]) all[period] = {};
    all[period][uid] = {
      bonificacion: roundMoney(adjustment.bonificacion || 0),
      ayudaEconomica: roundMoney(adjustment.ayudaEconomica || 0),
      nota: String(adjustment.nota || "").trim()
    };

    return writePayrollAdjustments(all);
  }

  function createPayrollGroup() {
    return {
      horasNorm: 0,
      horasExt: 0,
      salarioBase: 0,
      pagoHorasExtras: 0,
      recargoNocturno: 0,
      bruto: 0
    };
  }

  function addPayrollAmounts(group, norm, ext, salH, aplicarNocturno, jornada) {
    const nocturnoFactor = aplicarNocturno && esJornadaNocturna(jornada) ? 0.5 : 0;
    const baseNormal = norm * salH;
    const baseExtra = ext * salH * HORAS_EXTRA_FACTOR;
    const recargoNocturno = (baseNormal + baseExtra) * nocturnoFactor;

    group.horasNorm += norm;
    group.horasExt += ext;
    group.salarioBase += baseNormal;
    group.pagoHorasExtras += baseExtra;
    group.recargoNocturno += recargoNocturno;
    group.bruto += baseNormal + baseExtra + recargoNocturno;
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

      return Object.fromEntries((data || []).map(row => [row.id, row]));
    } catch (err) {
      logError(`fetchManyByIds(${table})(catch)`, err, { ids: unique });
      return {};
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

      const { data: viewUser, error: viewError } = await supabase
        .from("v_usuarios")
        .select("id,nombre,email,telefono,direccion,role,sucursal_id,empresa_id,created_at")
        .eq("id", userId)
        .maybeSingle();

      if (viewError) {
        logError("getCurrentUserProfile(v_usuarios)", viewError, { userId });
      } else if (viewUser) {
        return {
          ...viewUser,
          role: String(viewUser.role || "empleado").toLowerCase(),
          incomplete_profile: false
        };
      }

      const { data: user, error } = await supabase
        .from("usuarios")
        .select("id,role,sucursal_id,contacto_id,created_at,updated_at,afp,isss,salario_h,descripcion")
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        logError("getCurrentUserProfile(usuarios)", error, { userId });
      }

      if (!user) {
        console.warn("[PlanillaModel] Usuario no encontrado en tabla usuarios", { userId });

        return {
          id: authUser?.id || userId,
          nombre:
            authUser?.user_metadata?.nombre ||
            authUser?.app_metadata?.nombre ||
            authUser?.email ||
            "Usuario",
          email: authUser?.email || null,
          telefono: null,
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
          salario_h: 0,
          afp: null,
          isss: null,
          incomplete_profile: true
        };
      }

      const [contactosMap, sucursalesMap] = await Promise.all([
        fetchManyByIds(
          "contactos",
          user.contacto_id ? [user.contacto_id] : [],
          "id,nombre,telefono,email,identificacion,direccion,created_at,updated_at"
        ),
        fetchManyByIds(
          "sucursales",
          user.sucursal_id ? [user.sucursal_id] : [],
          "id,nombre,codigo,lat,lng,created_at,empresa_id"
        )
      ]);

      const contacto = user.contacto_id ? contactosMap[user.contacto_id] : null;
      const sucursal = user.sucursal_id ? sucursalesMap[user.sucursal_id] : null;

      let empresa = null;
      if (sucursal?.empresa_id) {
        const { data: empresaData, error: empresaError } = await supabase
          .from("empresa")
          .select("id,nombre")
          .eq("id", sucursal.empresa_id)
          .maybeSingle();

        if (empresaError) {
          logError("getCurrentUserProfile(empresa)", empresaError, {
            userId,
            empresa_id: sucursal.empresa_id
          });
        } else {
          empresa = empresaData || null;
        }
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
        direccion: contacto?.direccion || null,
        identificacion: contacto?.identificacion || null,
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
        salario_h: toNumber(user.salario_h),
        afp: user.afp || null,
        isss: user.isss || null,
        incomplete_profile: false
      };
    } catch (err) {
      logError("getCurrentUserProfile(catch)", err, { userId });

      return {
        id: userId,
        nombre: "Usuario",
        email: null,
        telefono: null,
        direccion: null,
        role: "empleado",
        sucursal_id: null,
        sucursal_nombre: null,
        empresa_id: null,
        empresa_nombre: null,
        salario_h: 0,
        afp: null,
        isss: null,
        incomplete_profile: true
      };
    }
  }

  async function getProducts() {
    const supabase = getSupabase();

    try {
      let query = supabase
        .from("productos")
        .select("id,sucursal_id,nombre,precio,created_at,updated_at,costo_promedio,activo")
        .order("nombre", { ascending: true });

      if (global.adminSucursal) {
        query = query.eq("sucursal_id", global.adminSucursal);
      }

      const { data: products, error: productsError } = await query;

      if (productsError) {
        logError("getProducts(productos)", productsError);
        return [];
      }

      const { data: movements, error: movError } = await supabase
        .from("movimientos_stock_base")
        .select("producto_id,tipo,cantidad");

      if (movError) {
        logError("getProducts(movimientos_stock_base)", movError);
      }

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
    const supabase = getSupabase();

    try {
      let query = supabase
        .from("clientes_vip")
        .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
        .order("fecha_alta", { ascending: false });

      if (global.adminSucursal) {
        query = query.eq("sucursal_id", global.adminSucursal);
      }

      const { data: clients, error } = await query;

      if (error) {
        logError("getVipClients(clientes_vip)", error);
        return [];
      }

      const contactIds = (clients || [])
        .map(c => c.contacto_id)
        .filter(Boolean);

      const contactsMap = await fetchManyByIds(
        "contactos",
        contactIds,
        "id,nombre,telefono,email,identificacion,direccion,created_at,updated_at"
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
      fetchManyByIds("usuarios", userIds, "id,role,sucursal_id,contacto_id,created_at,updated_at"),
      fetchManyByIds("clientes_vip", clientIds, "id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
    ]);

    const userContactIds = Object.values(usersMap).map(u => u.contacto_id).filter(Boolean);
    const clientContactIds = Object.values(clientsMap).map(c => c.contacto_id).filter(Boolean);
    const userSucursalIds = Object.values(usersMap).map(u => u.sucursal_id).filter(Boolean);

    const [userContactsMap, clientContactsMap, sucursalesMap] = await Promise.all([
      fetchManyByIds("contactos", userContactIds, "id,nombre,telefono,email,identificacion,direccion,created_at,updated_at"),
      fetchManyByIds("contactos", clientContactIds, "id,nombre,telefono,email,identificacion,direccion,created_at,updated_at"),
      fetchManyByIds("sucursales", userSucursalIds, "id,nombre,codigo,lat,lng,created_at,empresa_id")
    ]);

    const empresaIds = [...new Set(Object.values(sucursalesMap).map(s => s.empresa_id).filter(Boolean))];
    const empresasMap = await fetchManyByIds("empresa", empresaIds, "id,nombre");

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

      (data || []).forEach(row => {
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

  async function cargarJornadasMap() {
    const supabase = getSupabase();

    try {
      const { data: jornadasSnap, error } = await supabase
        .from("jornadas")
        .select("id,nombre,hora_entrada,hora_salida,sucursal_id,activo");

      if (error) throw error;

      const jornadasMap = {};
      (jornadasSnap || []).forEach((row) => {
        const data = row || {};
        jornadasMap[data.id] = {
          id: data.id,
          nombre: data.nombre,
          start: data.hora_entrada || "00:00",
          end: data.hora_salida || "00:00",
          sucursal_id: data.sucursal_id || null,
          activo: data.activo !== false
        };
      });

      return jornadasMap;
    } catch (e) {
      console.error("Error cargarJornadasMap:", e);
      return {};
    }
  }

  async function fetchUsuarioJornadasPara(usuariosIds = []) {
    const supabase = getSupabase();
    if (!Array.isArray(usuariosIds) || usuariosIds.length === 0) return {};

    try {
      const { data, error } = await supabase
        .from("usuario_jornadas")
        .select("usuario_id,jornada_id")
        .in("usuario_id", usuariosIds);

      if (error) throw error;

      const map = {};
      (data || []).forEach((r) => {
        if (!map[r.usuario_id]) map[r.usuario_id] = [];
        map[r.usuario_id].push(r.jornada_id);
      });

      return map;
    } catch (e) {
      console.error("fetchUsuarioJornadasPara error:", e);
      return {};
    }
  }

  async function hayNocturnasEnPeriodo(jornadasMap, fechaInicio, fechaFin) {
    const supabase = getSupabase();

    try {
      let empQ = supabase
        .from("v_usuarios")
        .select("id,empresa_id,sucursal_id,role")
        .eq("role", "empleado");

      if (global.adminEmpresa) empQ = empQ.eq("empresa_id", global.adminEmpresa);
      if (global.adminSucursal) empQ = empQ.eq("sucursal_id", global.adminSucursal);

      const { data: empData, error: empErr } = await empQ;
      if (empErr) throw empErr;

      const empleadosSet = new Set((empData || []).map((u) => u.id));

      const { data: asSnap, error: asErr } = await supabase
        .from("asistencias")
        .select("usuario_id,jornada_id,fecha,entrada_time,salida_time,entrada_raw,salida_raw")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin);

      if (asErr) throw asErr;

      let hay = false;
      (asSnap || []).forEach((doc) => {
        if (!doc) return;

        const uid = doc.usuario_id;
        if ((global.adminEmpresa || global.adminSucursal) && !empleadosSet.has(uid)) return;

        const jm = jornadasMap[doc.jornada_id];
        if (jm && esJornadaNocturna(jm)) hay = true;
      });

      return hay;
    } catch (e) {
      console.error("hayNocturnasEnPeriodo error:", e);
      return false;
    }
  }

  async function calcularPlanillaSemanalData(fechaInicio, fechaFin, aplicarNocturno = false, jornadasMap = null) {
    const supabase = getSupabase();

    if (!jornadasMap) {
      jornadasMap = await cargarJornadasMap();
    }

    try {
      let baseQuery = supabase
        .from("v_usuarios")
        .select("id,empresa_id,sucursal_id,role")
        .eq("role", "empleado");

      if (global.adminEmpresa) baseQuery = baseQuery.eq("empresa_id", global.adminEmpresa);
      if (global.adminSucursal) baseQuery = baseQuery.eq("sucursal_id", global.adminSucursal);

      const { data: baseUsers, error: baseErr } = await baseQuery;
      if (baseErr) throw baseErr;

      const baseIds = (baseUsers || []).map((u) => u.id);
      if (!baseIds.length) {
        return {
          rows: [],
          empleados: {},
          asistencias: [],
          jornadasMap
        };
      }

      const { data: empSnap, error: empErr } = await supabase
        .from("usuarios")
        .select("id,role,sucursal_id,contacto_id,created_at,updated_at,afp,isss,salario_h,descripcion")
        .in("id", baseIds);

      if (empErr) throw empErr;

      const empleados = {};
      const empIds = [];

      (empSnap || []).forEach((doc) => {
        empleados[doc.id] = { id: doc.id, ...doc };
        empIds.push(doc.id);
      });

      const [contactIds, sucursalIds] = [
        empSnap ? [...new Set((empSnap || []).map((e) => e.contacto_id).filter(Boolean))] : [],
        empSnap ? [...new Set((empSnap || []).map((e) => e.sucursal_id).filter(Boolean))] : []
      ];

      const [contactsMap, sucursalesMap] = await Promise.all([
        fetchManyByIds("contactos", contactIds, "id,nombre,telefono,email,identificacion,direccion,created_at,updated_at"),
        fetchManyByIds("sucursales", sucursalIds, "id,nombre,codigo,lat,lng,created_at,empresa_id")
      ]);

      const usuJMap = await fetchUsuarioJornadasPara(empIds);

      Object.keys(empleados).forEach((uid) => {
        const e = empleados[uid];
        const contacto = e.contacto_id ? contactsMap[e.contacto_id] : null;
        const sucursal = e.sucursal_id ? sucursalesMap[e.sucursal_id] : null;

        e.nombre = contacto?.nombre || e.nombre || "Desconocido";
        e.email = contacto?.email || null;
        e.telefono = contacto?.telefono || null;
        e.identificacion = contacto?.identificacion || null;
        e.direccion = contacto?.direccion || null;
        e.sucursal_nombre = sucursal?.nombre || null;
        e.empresa_id = sucursal?.empresa_id || null;

        const jDirect = e.jornada_id || e.jornadaId || null;

        if (jDirect) {
          e._jornada_asignada = jDirect;
        } else {
          const arr = usuJMap[uid] || [];
          e._jornada_asignada = arr.length > 0 ? arr[0] : null;
        }
      });

      const { data: asSnap, error: asErr } = await supabase
        .from("asistencias")
        .select("*")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin);

      if (asErr) throw asErr;

      const grupos = {};
      const fechasAtendidas = {};

      (asSnap || []).forEach((d) => {
        if (!d) return;

        const uid = d.usuario_id || d.userId || d.user || d.usuario || d.usuarioId || null;
        if (!uid || !empleados[uid]) return;
        if (!d.fecha || d.fecha < fechaInicio || d.fecha > fechaFin) return;

        const entrada_raw = String(d.entrada_raw || d.entrada || d.entrada_time || d.entradaTime || "").trim();
        const salida_raw = String(d.salida_raw || d.salida || d.salida_time || d.salidaTime || "").trim();

        const entrada_time_norm = d.entrada_time
          ? parseTimeString(d.entrada_time)
          : (parseTimeString(entrada_raw) || null);

        const salida_time_norm = d.salida_time
          ? parseTimeString(d.salida_time)
          : (parseTimeString(salida_raw) || null);

        const esEntradaConsentida =
          entrada_raw.toLowerCase() === "consentida";

        const esSalidaConsentida =
          salida_raw.toLowerCase() === "consentida";

        const entradaValida =
          !!entrada_time_norm || esEntradaConsentida;

        const salidaValida =
          !!salida_time_norm || esSalidaConsentida;

        /*
          Casos válidos:
          - entrada registrada + salida registrada
          - entrada consentida + salida registrada
          - entrada registrada + salida consentida
          - entrada consentida + salida consentida
        */
        if (!entradaValida || !salidaValida) {
          return;
        }

        if (!grupos[uid]) {
          grupos[uid] = createPayrollGroup();
          fechasAtendidas[uid] = new Set();
        }

        fechasAtendidas[uid].add(d.fecha);

        const empleado = empleados[uid];
        const jmId = d.jornada_id || d.jornadaId || empleado._jornada_asignada;
        const jm = jornadasMap[jmId];
        if (!jm) return;

        const jornadaStart = crearFechaCompleta(d.fecha, jm.start);
        let jornadaEnd = crearFechaCompleta(d.fecha, jm.end);

        if (jornadaEnd <= jornadaStart) {
          jornadaEnd.setDate(jornadaEnd.getDate() + 1);
        }

        let realStart = esEntradaConsentida
          ? jornadaStart
          : (entrada_time_norm ? crearFechaCompleta(d.fecha, entrada_time_norm) : jornadaStart);

        let realEnd = esSalidaConsentida
          ? new Date(jornadaEnd)
          : crearFechaCompleta(d.fecha, salida_time_norm);

        if (realEnd && realEnd <= realStart) {
          realEnd.setDate(realEnd.getDate() + 1);
        }

        if (realEnd && realEnd < realStart) realEnd = null;

        let norm = 0;
        let ext = 0;

        if (realEnd) {
          const startMs = +realStart;
          const endMs = +realEnd;
          const jStartMs = +jornadaStart;
          const jEndMs = +jornadaEnd;

          const overlapStart = Math.max(startMs, jStartMs);
          const overlapEnd = Math.min(endMs, jEndMs);

          if (overlapEnd > overlapStart) norm = (overlapEnd - overlapStart) / 3600000;
          ext = Math.max(0, (endMs - jEndMs) / 3600000);
        } else {
          const dur = Math.max(0, (+jornadaEnd - +jornadaStart) / 3600000);
          norm = esEntradaConsentida ? dur : (dur / 2);
          ext = 0;
        }

        norm = Math.round(norm * 100) / 100;
        ext = Math.round(ext * 100) / 100;

        const salH = Number(empleado.salario_h || 0) || 0;
        addPayrollAmounts(grupos[uid], norm, ext, salH, aplicarNocturno, jm);
      });

      const start = new Date(fechaInicio);
      const end = new Date(fechaFin);
      let totalDias = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) totalDias++;

      for (const uid in empleados) {
        const empleado = empleados[uid];
        if (empleado && empleado.viajero) {
          const reg = fechasAtendidas[uid]?.size || 0;
          const falt = totalDias - reg;

          if (falt > 0) {
            const jmId = empleado._jornada_asignada;
            const jm = jmId ? jornadasMap[jmId] : null;

            if (jm) {
              if (!grupos[uid]) grupos[uid] = createPayrollGroup();

              const dur = (crearFechaCompleta(fechaInicio, jm.end) - crearFechaCompleta(fechaInicio, jm.start)) / 3600000;
              const salH = Number(empleado.salario_h || 0) || 0;
              addPayrollAmounts(grupos[uid], falt * dur, 0, salH, aplicarNocturno, jm);
            }
          }
        }
      }

      const rows = Object.keys(grupos)
        .map((uid) => {
          const e = empleados[uid] || { nombre: "Desconocido" };
          const g = grupos[uid];
          const adjustment = getPayrollAdjustment(fechaInicio, fechaFin, uid);
          const bonificacion = roundMoney(adjustment.bonificacion);
          const ayudaEconomica = roundMoney(adjustment.ayudaEconomica);
          const ingresoGravado = roundMoney(g.bruto + bonificacion);
          const isss = e.isss ? ingresoGravado * 0.03 : 0;
          const afp = e.afp ? ingresoGravado * 0.075 : 0;
          const rentaBase = Math.max(0, ingresoGravado - isss - afp);
          const renta = rentaBase > RENTA_THRESHOLD
            ? (rentaBase - RENTA_THRESHOLD) * RENTA_RATE
            : 0;
          const deducciones = isss + afp + renta;
          const neto = ingresoGravado + ayudaEconomica - deducciones;

          return {
            uid,
            nombre: e.nombre || "Desconocido",
            salarioHora: roundMoney(e.salario_h || 0),
            horasNormales: Number((g.horasNorm || 0).toFixed(2)),
            horasExtras: Number((g.horasExt || 0).toFixed(2)),
            totalHoras: Number(((g.horasNorm || 0) + (g.horasExt || 0)).toFixed(2)),
            salarioBase: roundMoney(g.salarioBase || 0),
            pagoHorasExtras: roundMoney(g.pagoHorasExtras || 0),
            recargoNocturno: roundMoney(g.recargoNocturno || 0),
            bonificacion,
            ayudaEconomica,
            ingresoGravado,
            totalBruto: roundMoney(g.bruto + bonificacion + ayudaEconomica),
            isss: roundMoney(isss),
            afp: roundMoney(afp),
            renta: roundMoney(renta),
            deducciones: roundMoney(deducciones),
            totalNeto: roundMoney(neto),
            ajusteNota: adjustment.nota
          };
        })
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es", { sensitivity: "base" }));

      return {
        rows,
        empleados,
        asistencias: asSnap || [],
        jornadasMap
      };
    } catch (e) {
      console.error("calcularPlanillaSemanalData error:", e);
      throw e;
    }
  }

  global.PlanillaModel = {
    parseTimeString,
    crearFechaCompleta,
    esJornadaNocturna,
    obtenerSemanaActual,
    sanitizeFileName,
    cargarJornadasMap,
    hayNocturnasEnPeriodo,
    fetchUsuarioJornadasPara,
    getPayrollAdjustment,
    setPayrollAdjustment,
    calcularPlanillaSemanalData,
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
    getNextWeekStart,
    HORAS_EXTRA_FACTOR,
    RENTA_THRESHOLD,
    RENTA_RATE
  };

  global.parseTimeString = global.parseTimeString || parseTimeString;
  global.crearFechaCompleta = global.crearFechaCompleta || crearFechaCompleta;
  global.esJornadaNocturna = global.esJornadaNocturna || esJornadaNocturna;
  global.obtenerSemanaActual = global.obtenerSemanaActual || obtenerSemanaActual;
})(window);
