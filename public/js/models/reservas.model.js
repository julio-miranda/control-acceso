// js/models/reservas.model.js
(function (window) {
  "use strict";

  const supabase = window.supabase;
  const AuthModel = window.AuthModel || null;

  if (!supabase) {
    console.error("Supabase no inicializado.");
    return;
  }

  const state = {
    currentUser: null,
    eventsCache: [],
    tablesCache: [],
    vipCache: [],
    reservationsCache: [],
    currentEmpresaId: null,
    currentSucursalId: null
  };

  function currency(n) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(Number(n || 0));
  }

  function numberOrZero(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") return new Date(value);
    if (value && typeof value === "object" && value.seconds) return new Date(value.seconds * 1000);
    return null;
  }

  function formatDate(value) {
    const d = parseDate(value);
    return d ? d.toLocaleString() : "—";
  }

  function normalizeText(value) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  }

  function setCurrentUser(user) {
    state.currentUser = user || null;
    state.currentEmpresaId = user?.empresa_id || null;
    state.currentSucursalId = user?.sucursal_id || null;

    if (user) {
      window.adminEmpresa = user.empresa_id ? String(user.empresa_id) : "";
      window.adminSucursal = user.sucursal_id ? String(user.sucursal_id) : "";
      window.adminEmpresaNombre = user.empresa_nombre || window.adminEmpresaNombre || "";
    }

    return state.currentUser;
  }

  function getCurrentUser() {
    return state.currentUser;
  }

  async function getSessionUid() {
    try {
      if (AuthModel && typeof AuthModel.getCurrentUser === "function") {
        const authResult = await AuthModel.getCurrentUser();
        const user = authResult?.user || authResult?.data?.user || authResult?.session?.user || null;
        if (user?.id) return user.id;
      }

      if (typeof AuthModel?.getSessionData === "function") {
        const s = await AuthModel.getSessionData();
        if (s && s.uid) return s.uid;
      }

      return null;
    } catch (e) {
      console.warn("getSessionUid error:", e);
      return null;
    }
  }

  async function loadContactsByIds(ids) {
    const uniqueIds = [...new Set((ids || []).map(v => String(v || "").trim()).filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const { data, error } = await supabase
      .from("contactos")
      .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
      .in("id", uniqueIds);

    if (error) throw error;

    return new Map((data || []).map(row => [String(row.id), row]));
  }

  async function loadVipByIds(ids) {
    const uniqueIds = [...new Set((ids || []).map(v => String(v || "").trim()).filter(Boolean))];
    if (!uniqueIds.length) return new Map();

    const { data, error } = await supabase
      .from("clientes_vip")
      .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
      .in("id", uniqueIds);

    if (error) throw error;

    const contactIds = (data || []).map(v => v.contacto_id).filter(Boolean);
    const contacts = await loadContactsByIds(contactIds);

    return new Map((data || []).map(row => {
      const contacto = row.contacto_id ? (contacts.get(String(row.contacto_id)) || null) : null;
      return [String(row.id), normalizeVip({ ...row, contacto })];
    }));
  }

  async function fetchUserFromDBById(uid) {
    try {
      const { data, error } = await supabase
        .from("v_usuarios")
        .select("id,nombre,email,telefono,direccion,role,sucursal_id,empresa_id,created_at")
        .eq("id", uid)
        .maybeSingle();

      if (error) {
        console.warn("Error consultando usuario:", error);
        return null;
      }

      if (!data) return null;

      return {
        ...data,
        role: String(data.role || "empleado").toLowerCase()
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
      if (!uid) return null;

      const authUser = await getAuthUser();
      const userDB = await fetchUserFromDBById(uid);

      if (userDB) {
        return setCurrentUser(userDB);
      }

      const fallback = {
        id: uid,
        nombre:
          authUser?.user_metadata?.nombre ||
          authUser?.app_metadata?.nombre ||
          authUser?.email ||
          "Usuario",
        email: authUser?.email || null,
        telefono: authUser?.user_metadata?.telefono || null,
        direccion: authUser?.user_metadata?.direccion || null,
        role: String(
          authUser?.app_metadata?.role ||
          authUser?.user_metadata?.role ||
          "empleado"
        ).toLowerCase(),
        sucursal_id:
          authUser?.app_metadata?.sucursal_id ||
          authUser?.user_metadata?.sucursal_id ||
          null,
        empresa_id:
          authUser?.app_metadata?.empresa_id ||
          authUser?.user_metadata?.empresa_id ||
          null,
        empresa_nombre:
          authUser?.app_metadata?.empresa_nombre ||
          authUser?.user_metadata?.empresa_nombre ||
          null
      };

      return setCurrentUser(fallback);
    } catch (e) {
      console.error("bootstrapAuth error:", e);
      return null;
    }
  }

  async function getAuthUser() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.warn("getAuthUser error:", error);
      }
      return data?.user || null;
    } catch (e) {
      console.warn("getAuthUser catch:", e);
      return null;
    }
  }

  function getUserSucursalFilter() {
    return state.currentSucursalId ?? window.adminSucursal ?? null;
  }

  function getUserEmpresaFilter() {
    return state.currentEmpresaId ?? window.adminEmpresa ?? null;
  }

  async function findContactMatch(data) {
    try {
      if (!data) return null;

      if (data.identificacion) {
        const { data: byId, error } = await supabase
          .from("contactos")
          .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
          .eq("identificacion", data.identificacion)
          .maybeSingle();

        if (!error && byId) return byId;
      }

      if (data.email) {
        const { data: byEmail, error } = await supabase
          .from("contactos")
          .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
          .ilike("email", data.email)
          .maybeSingle();

        if (!error && byEmail) return byEmail;
      }

      if (data.nombre && data.telefono) {
        const { data: byNamePhone, error } = await supabase
          .from("contactos")
          .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
          .eq("nombre", data.nombre)
          .eq("telefono", data.telefono)
          .maybeSingle();

        if (!error && byNamePhone) return byNamePhone;
      }

      return null;
    } catch (e) {
      console.warn("findContactMatch error:", e);
      return null;
    }
  }

  function buildContactSnapshotData(payload = {}, fallback = {}) {
    const nombre = normalizeText(payload.nombre ?? fallback.nombre) || normalizeText(fallback.email) || "Sin nombre";

    const data = {
      nombre,
      telefono: normalizeText(payload.telefono ?? fallback.telefono),
      email: normalizeText(payload.email ?? fallback.email),
      identificacion: normalizeText(payload.identificacion ?? fallback.identificacion),
      direccion: normalizeText(payload.direccion ?? fallback.direccion)
    };

    const hasMeaningfulData =
      Boolean(data.nombre) ||
      Boolean(data.telefono) ||
      Boolean(data.email) ||
      Boolean(data.identificacion) ||
      Boolean(data.direccion);

    return hasMeaningfulData ? data : null;
  }

  async function saveContactSnapshot(existingContactId, payload = {}, fallback = {}) {
    const data = buildContactSnapshotData(payload, fallback);
    if (!data) return existingContactId || null;

    if (existingContactId) {
      const { error } = await supabase
        .from("contactos")
        .update(data)
        .eq("id", existingContactId);

      if (error) throw error;
      return existingContactId;
    }

    const existing = await findContactMatch(data);
    if (existing?.id) {
      const { error } = await supabase
        .from("contactos")
        .update(data)
        .eq("id", existing.id);

      if (error) throw error;

      return existing.id;
    }

    const { data: inserted, error } = await supabase
      .from("contactos")
      .insert([data])
      .select("id")
      .single();

    if (error) throw error;
    return inserted?.id || null;
  }

  function getVipById(vipId) {
    return state.vipCache.find(v => String(v.id) === String(vipId)) || null;
  }

  function getContactFromVip(vip) {
    if (!vip) return null;

    return vip.contacto || {
      id: vip.contacto_id || null,
      nombre: vip.nombre || null,
      telefono: vip.telefono || null,
      email: vip.email || null,
      identificacion: vip.identificacion || null,
      direccion: vip.direccion || null
    };
  }

  function normalizeEvent(row) {
    const contact = row.responsable_contacto || null;

    return {
      id: row.id,
      sucursal_id: row.sucursal_id,
      nombre: row.nombre || "Sin nombre",
      descripcion: row.descripcion || "",
      fecha_inicio: row.fecha_inicio || null,
      fecha_fin: row.fecha_fin || null,
      capacidad: numberOrZero(row.capacidad),
      precio_entrada: numberOrZero(row.precio_entrada),
      estado: row.estado || "programado",
      tipo: row.tipo || "evento_con_entrada",
      requiere_reservacion: !!row.requiere_reservacion,
      es_gratuito: !!row.es_gratuito,
      entrada_gratis: !!row.entrada_gratis,
      responsable_contacto_id: row.responsable_contacto_id || null,
      responsable_nombre: contact?.nombre || "",
      responsable_telefono: contact?.telefono || "",
      responsable_email: contact?.email || "",
      responsable_identificacion: contact?.identificacion || "",
      responsable_direccion: contact?.direccion || "",
      creado_por_usuario_id: row.creado_por_usuario_id || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  }

  function normalizeTable(row) {
    return {
      id: row.id,
      sucursal_id: row.sucursal_id,
      numero: row.numero || "",
      capacidad: numberOrZero(row.capacidad),
      estado: row.estado || "disponible",
      descripcion: row.descripcion || "",
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  }

  function normalizeVip(row) {
    const contacto = row.contacto || null;

    return {
      id: row.id,
      sucursal_id: row.sucursal_id,
      contacto_id: row.contacto_id || null,
      nombre: contacto?.nombre || "Sin nombre",
      telefono: contacto?.telefono || "",
      email: contacto?.email || "",
      identificacion: contacto?.identificacion || "",
      direccion: contacto?.direccion || "",
      notas: row.notas || "",
      activo: row.activo !== false,
      fecha_alta: row.fecha_alta || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      contacto
    };
  }

  function normalizeReservation(row) {
    const vip = row.cliente_vip || null;
    const vipContact = vip?.contacto || null;
    const resp = row.responsable_contacto || null;
    const event = row.evento || null;
    const mesa = row.mesa || null;
    const eventContact = event?.responsable_contacto || null;

    return {
      id: row.id,
      evento_id: row.evento_id,
      evento_nombre: event?.nombre || row.evento_nombre || "Sin evento",
      evento_tipo: event?.tipo || row.evento_tipo || "",
      evento_sucursal_id: event?.sucursal_id || null,
      sucursal_id: event?.sucursal_id || mesa?.sucursal_id || null,
      sucursal_nombre: row.sucursal_nombre || "",
      empresa_id: row.empresa_id || "",
      mesa_id: row.mesa_id || null,
      mesa_numero: mesa?.numero || row.numero_mesa || "",
      mesa_capacidad: numberOrZero(mesa?.capacidad ?? row.mesa_capacidad),
      cliente_vip_id: row.cliente_vip_id || null,
      cliente_vip_nombre: vipContact?.nombre || row.cliente_vip_nombre || "",
      cliente_nombre: resp?.nombre || vipContact?.nombre || row.cliente_nombre || "",
      cliente_telefono: resp?.telefono || vipContact?.telefono || row.cliente_telefono || "",
      cliente_email: resp?.email || vipContact?.email || row.cliente_email || "",
      cliente_identificacion: resp?.identificacion || vipContact?.identificacion || row.cliente_identificacion || "",
      cliente_direccion: resp?.direccion || vipContact?.direccion || row.cliente_direccion || "",
      cantidad_personas: numberOrZero(row.cantidad_personas),
      numero_mesa: row.numero_mesa || mesa?.numero || "",
      monto_reserva: numberOrZero(row.monto_reserva),
      estado: row.estado || "pendiente",
      observacion: row.observacion || "",
      responsable_contacto_id: row.responsable_contacto_id || null,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      cliente_vip: vip,
      responsable_contacto: resp,
      evento_contacto: eventContact
    };
  }

  function getEventTypes() {
    return [
      {
        value: "fiesta_dj",
        label: "Fiestas con DJ",
        description: "Eventos con música en vivo o DJ, ambiente nocturno y control de acceso."
      },
      {
        value: "evento_con_entrada",
        label: "Eventos con entrada pagada",
        description: "Actividades con cobro de entrada y cupo controlado."
      },
      {
        value: "promocion",
        label: "Promociones sin entrada",
        description: "Eventos promocionales o especiales de acceso libre."
      },
      {
        value: "reservacion_mesas",
        label: "Reservaciones de mesas",
        description: "Eventos orientados a reserva de mesas y atención VIP."
      }
    ];
  }

  async function loadEvents() {
    const sucursalId = getUserSucursalFilter();

    let q = supabase
      .from("eventos")
      .select("id,sucursal_id,nombre,descripcion,fecha_inicio,fecha_fin,capacidad,precio_entrada,estado,created_at,updated_at,tipo,requiere_reservacion,es_gratuito,entrada_gratis,responsable_contacto_id,creado_por_usuario_id")
      .order("fecha_inicio", { ascending: true });

    if (sucursalId) {
      q = q.eq("sucursal_id", sucursalId);
    }

    const { data, error } = await q;
    if (error) throw error;

    const contactIds = (data || []).map(r => r.responsable_contacto_id).filter(Boolean);
    const contacts = await loadContactsByIds(contactIds);

    state.eventsCache = (data || []).map(row => normalizeEvent({
      ...row,
      responsable_contacto: row.responsable_contacto_id ? (contacts.get(String(row.responsable_contacto_id)) || null) : null
    }));

    return state.eventsCache.slice();
  }

  async function loadTables() {
    const sucursalId = getUserSucursalFilter();

    let q = supabase
      .from("mesas")
      .select("id:mesas_id,sucursal_id,numero,capacidad,estado,descripcion,created_at,updated_at")
      .order("numero", { ascending: true });

    if (sucursalId) {
      q = q.eq("sucursal_id", sucursalId);
    }

    const { data, error } = await q;
    if (error) throw error;

    state.tablesCache = (data || []).map(normalizeTable);
    return state.tablesCache.slice();
  }

  async function loadVipClients() {
    const sucursalId = getUserSucursalFilter();

    let q = supabase
      .from("clientes_vip")
      .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
      .order("created_at", { ascending: false });

    if (sucursalId) {
      q = q.eq("sucursal_id", sucursalId);
    }

    const { data, error } = await q;
    if (error) throw error;

    const contactIds = (data || []).map(r => r.contacto_id).filter(Boolean);
    const contacts = await loadContactsByIds(contactIds);

    state.vipCache = (data || []).map(row => normalizeVip({
      ...row,
      contacto: row.contacto_id ? (contacts.get(String(row.contacto_id)) || null) : null
    }));

    return state.vipCache.slice();
  }

  async function loadReservations() {
    const sucursalId = getUserSucursalFilter();

    const { data, error } = await supabase
      .from("reservaciones_mesas")
      .select("id,evento_id,cliente_vip_id,cantidad_personas,numero_mesa,monto_reserva,estado,created_at,updated_at,mesa_id,observacion,responsable_contacto_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = data || [];
    const eventIds = [...new Set(rows.map(r => r.evento_id).filter(Boolean).map(String))];
    const mesaIds = [...new Set(rows.map(r => r.mesa_id).filter(Boolean).map(String))];
    const vipIds = [...new Set(rows.map(r => r.cliente_vip_id).filter(Boolean).map(String))];
    const contactIds = [...new Set(rows.map(r => r.responsable_contacto_id).filter(Boolean).map(String))];

    const [eventsMap, tablesMap, vipMap, contactsMap] = await Promise.all([
      (async () => {
        if (!eventIds.length) return new Map();
        const { data: events, error: eError } = await supabase
          .from("eventos")
          .select("id,sucursal_id,nombre,descripcion,fecha_inicio,fecha_fin,capacidad,precio_entrada,estado,created_at,updated_at,tipo,requiere_reservacion,es_gratuito,entrada_gratis,responsable_contacto_id,creado_por_usuario_id")
          .in("id", eventIds);

        if (eError) throw eError;

        const contacts = await loadContactsByIds((events || []).map(ev => ev.responsable_contacto_id).filter(Boolean));
        return new Map((events || []).map(ev => [
          String(ev.id),
          normalizeEvent({
            ...ev,
            responsable_contacto: ev.responsable_contacto_id ? (contacts.get(String(ev.responsable_contacto_id)) || null) : null
          })
        ]));
      })(),
      (async () => {
        if (!mesaIds.length) return new Map();
        const { data: mesas, error: mError } = await supabase
          .from("mesas")
          .select("id:mesas_id,sucursal_id,numero,capacidad,estado,descripcion,created_at,updated_at")
          .in("id", mesaIds);

        if (mError) throw mError;

        return new Map((mesas || []).map(m => [String(m.id), normalizeTable(m)]));
      })(),
      loadVipByIds(vipIds),
      loadContactsByIds(contactIds)
    ]);

    const normalized = rows.map(row => {
      const evento = row.evento_id ? (eventsMap.get(String(row.evento_id)) || null) : null;
      const mesa = row.mesa_id ? (tablesMap.get(String(row.mesa_id)) || null) : null;
      const vip = row.cliente_vip_id ? (vipMap.get(String(row.cliente_vip_id)) || null) : null;
      const responsable = row.responsable_contacto_id ? (contactsMap.get(String(row.responsable_contacto_id)) || null) : null;

      return normalizeReservation({
        ...row,
        evento,
        mesa,
        cliente_vip: vip,
        responsable_contacto: responsable
      });
    });

    state.reservationsCache = sucursalId
      ? normalized.filter(r => String(r.evento_sucursal_id || "") === String(sucursalId))
      : normalized;

    return state.reservationsCache.slice();
  }

  function resolveReservedTableIds(eventId) {
    return new Set(
      state.reservationsCache
        .filter(r =>
          String(r.evento_id) === String(eventId) &&
          ["pendiente", "confirmada"].includes(String(r.estado || "").toLowerCase()) &&
          r.mesa_id
        )
        .map(r => r.mesa_id)
    );
  }

  async function loadAvailableTablesForEvent(eventId, people) {
    const event = state.eventsCache.find(e => String(e.id) === String(eventId)) || null;
    const needed = Math.max(1, numberOrZero(people) || 1);

    let sucursalId = event?.sucursal_id || getUserSucursalFilter();
    if (!event) {
      const { data, error } = await supabase
        .from("eventos")
        .select("id,sucursal_id,nombre,descripcion,fecha_inicio,fecha_fin,capacidad,precio_entrada,estado,created_at,updated_at,tipo,requiere_reservacion,es_gratuito,entrada_gratis,responsable_contacto_id,creado_por_usuario_id")
        .eq("id", eventId)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        sucursalId = data.sucursal_id || sucursalId;
      }
    }

    const reservedTableIds = resolveReservedTableIds(eventId);

    const tables = state.tablesCache
      .filter(t =>
        String(t.sucursal_id) === String(sucursalId) &&
        t.estado === "disponible" &&
        t.capacidad >= needed &&
        !reservedTableIds.has(t.id)
      )
      .sort((a, b) => a.capacidad - b.capacidad);

    return { event, tables };
  }

  function getEventTypeIsAllowed(tipo) {
    return getEventTypes().some(t => t.value === tipo);
  }

  async function getEventById(eventId) {
    const found = state.eventsCache.find(e => String(e.id) === String(eventId));
    if (found) return found;

    const { data, error } = await supabase
      .from("eventos")
      .select("id,sucursal_id,nombre,descripcion,fecha_inicio,fecha_fin,capacidad,precio_entrada,estado,created_at,updated_at,tipo,requiere_reservacion,es_gratuito,entrada_gratis,responsable_contacto_id,creado_por_usuario_id")
      .eq("id", eventId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const contacts = data.responsable_contacto_id
      ? await loadContactsByIds([data.responsable_contacto_id])
      : new Map();

    return normalizeEvent({
      ...data,
      responsable_contacto: data.responsable_contacto_id ? (contacts.get(String(data.responsable_contacto_id)) || null) : null
    });
  }

  async function createEvent(payload) {
    const sucursalId = getUserSucursalFilter();
    const uid = await getSessionUid();

    if (!sucursalId) {
      return { ok: false, message: "No se pudo identificar la sucursal." };
    }

    if (!payload?.nombre || !String(payload.nombre).trim()) {
      return { ok: false, message: "El nombre del evento es obligatorio." };
    }

    if (!payload?.fecha_inicio) {
      return { ok: false, message: "La fecha de inicio es obligatoria." };
    }

    const tipo = String(payload.tipo || "evento_con_entrada");
    if (!getEventTypeIsAllowed(tipo)) {
      return { ok: false, message: "Tipo de evento inválido." };
    }

    let vip = null;
    if (payload.responsable_vip_id) {
      vip = getVipById(payload.responsable_vip_id);
      if (!vip) {
        const vipMap = await loadVipByIds([payload.responsable_vip_id]);
        vip = vipMap.get(String(payload.responsable_vip_id)) || null;
      }
    }

    const contactId = await saveContactSnapshot(
      null,
      {
        nombre: payload.responsable_nombre,
        telefono: payload.responsable_telefono,
        email: payload.responsable_email,
        identificacion: payload.responsable_identificacion,
        direccion: payload.responsable_direccion
      },
      getContactFromVip(vip) || {}
    );

    const insertData = {
      sucursal_id: sucursalId,
      nombre: String(payload.nombre).trim(),
      descripcion: normalizeText(payload.descripcion),
      fecha_inicio: payload.fecha_inicio,
      fecha_fin: payload.fecha_fin || null,
      capacidad: payload.capacidad ? numberOrZero(payload.capacidad) : null,
      precio_entrada: numberOrZero(payload.precio_entrada) || 0,
      estado: payload.estado || "programado",
      tipo,
      requiere_reservacion: !!payload.requiere_reservacion,
      es_gratuito: !!payload.es_gratuito,
      entrada_gratis: payload.entrada_gratis === undefined ? true : !!payload.entrada_gratis,
      responsable_contacto_id: contactId,
      creado_por_usuario_id: payload.creado_por_usuario_id || uid || null
    };

    const { data, error } = await supabase
      .from("eventos")
      .insert([insertData])
      .select("id,sucursal_id,nombre,descripcion,fecha_inicio,fecha_fin,capacidad,precio_entrada,estado,created_at,updated_at,tipo,requiere_reservacion,es_gratuito,entrada_gratis,responsable_contacto_id,creado_por_usuario_id")
      .single();

    if (error) throw error;

    const contactMap = contactId ? await loadContactsByIds([contactId]) : new Map();
    const normalized = normalizeEvent({
      ...data,
      responsable_contacto: contactId ? (contactMap.get(String(contactId)) || null) : null
    });

    state.eventsCache.unshift(normalized);
    return { ok: true, data: normalized };
  }

  async function buildReservationContactData(payload = {}, vip = null, existingReservation = null) {
    const vipContact = getContactFromVip(vip);
    const fallback = existingReservation?.responsable_contacto || vipContact || {};

    return {
      nombre: payload.cliente_nombre ?? fallback.nombre ?? vipContact?.nombre ?? "Sin nombre",
      telefono: payload.cliente_telefono ?? fallback.telefono ?? vipContact?.telefono ?? null,
      email: payload.cliente_email ?? fallback.email ?? vipContact?.email ?? null,
      identificacion: payload.cliente_identificacion ?? fallback.identificacion ?? vipContact?.identificacion ?? null,
      direccion: payload.cliente_direccion ?? fallback.direccion ?? vipContact?.direccion ?? null
    };
  }

  async function resolveReservationMesa(payload, event, people) {
    const neededPeople = Math.max(1, numberOrZero(people) || 1);
    const sucursalId = event?.sucursal_id || getUserSucursalFilter();

    if (payload.mesa_id) {
      const { data, error } = await supabase
        .from("mesas")
        .select("id:mesas_id,sucursal_id,numero,capacidad,estado,descripcion,created_at,updated_at")
        .eq("id", payload.mesa_id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return { ok: false, message: "La mesa seleccionada no existe." };
      }

      const mesa = normalizeTable(data);

      if (String(mesa.sucursal_id) !== String(sucursalId)) {
        return { ok: false, message: "La mesa no pertenece a la sucursal del evento." };
      }

      if (mesa.estado !== "disponible") {
        return { ok: false, message: "La mesa no está disponible." };
      }

      if (numberOrZero(mesa.capacidad) < neededPeople) {
        return { ok: false, message: "La mesa no tiene capacidad suficiente." };
      }

      const activeConflict = state.reservationsCache.some(r =>
        String(r.evento_id) === String(event.id) &&
        String(r.mesa_id) === String(mesa.id) &&
        ["pendiente", "confirmada"].includes(String(r.estado || "").toLowerCase())
      );

      if (activeConflict) {
        return { ok: false, message: "La mesa ya está reservada para este evento." };
      }

      return { ok: true, mesa };
    }

    const { data: rpcMesaId, error: rpcError } = await supabase.rpc("asignar_mesa_automatica", {
      p_evento_id: event.id,
      p_sucursal_id: sucursalId,
      p_cantidad_personas: neededPeople
    });

    if (rpcError) {
      console.warn("RPC asignar_mesa_automatica falló, usando filtrado local:", rpcError);
      const available = await loadAvailableTablesForEvent(event.id, neededPeople);
      const mesa = available.tables?.[0] || null;
      return mesa ? { ok: true, mesa } : { ok: false, message: "No hay mesas disponibles para este evento." };
    }

    if (!rpcMesaId) {
      return { ok: false, message: "No hay mesas disponibles para este evento." };
    }

    const mesa = state.tablesCache.find(t => String(t.id) === String(rpcMesaId)) || null;
    if (mesa) return { ok: true, mesa };

    const { data, error } = await supabase
      .from("mesas")
      .select("id:mesas_id,sucursal_id,numero,capacidad,estado,descripcion,created_at,updated_at")
      .eq("id", rpcMesaId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return { ok: false, message: "No se pudo resolver la mesa asignada." };
    }

    return { ok: true, mesa: normalizeTable(data) };
  }

  async function insertReservationRow(payload, event, mesa, responsableContactoId) {
    const { data, error } = await supabase
      .from("reservaciones_mesas")
      .insert([{
        evento_id: event.id,
        cliente_vip_id: payload.cliente_vip_id || null,
        responsable_contacto_id: responsableContactoId || null,
        cantidad_personas: numberOrZero(payload.cantidad_personas) || 1,
        numero_mesa: mesa?.numero || null,
        monto_reserva: numberOrZero(payload.monto_reserva) || 0,
        estado: payload.estado || "pendiente",
        observacion: normalizeText(payload.observacion),
        mesa_id: mesa?.id || null
      }])
      .select("id")
      .single();

    if (error) throw error;
    return data;
  }

  async function updateTableState(tableId, stateName) {
    if (!tableId) return;
    await supabase
      .from("mesas")
      .update({ estado: stateName })
      .eq("id", tableId);
  }

  async function createReservation(payload, mode = "evento") {
    if (!payload?.evento_id) {
      return { ok: false, message: "Selecciona un evento." };
    }

    const event = await getEventById(payload.evento_id);
    if (!event) {
      return { ok: false, message: "El evento no existe." };
    }

    let vip = null;
    if (payload.cliente_vip_id) {
      vip = getVipById(payload.cliente_vip_id);
      if (!vip) {
        const vipMap = await loadVipByIds([payload.cliente_vip_id]);
        vip = vipMap.get(String(payload.cliente_vip_id)) || null;
      }
    }

    const contactData = await buildReservationContactData(payload, vip, null);
    const responsableContactoId = await saveContactSnapshot(null, contactData, getContactFromVip(vip) || {});

    const mesaResolution = await resolveReservationMesa(payload, event, payload.cantidad_personas);
    if (!mesaResolution.ok) {
      return { ok: false, message: mesaResolution.message || "No se pudo asignar la mesa." };
    }

    const mesa = mesaResolution.mesa || null;
    const inserted = await insertReservationRow(payload, event, mesa, responsableContactoId);

    if (mesa?.id) {
      await updateTableState(mesa.id, "reservada");
    }

    await loadReservations();
    return { ok: true, data: inserted };
  }

  async function createEventReservation(payload) {
    return createReservation(payload, "evento");
  }

  async function createTableReservation(payload) {
    return createReservation(payload, "mesa");
  }

  async function createMesa(payload) {
    const sucursalId = getUserSucursalFilter();

    if (!sucursalId) {
      return { ok: false, message: "No se pudo identificar la sucursal." };
    }

    if (!payload?.numero || !String(payload.numero).trim()) {
      return { ok: false, message: "El número de mesa es obligatorio." };
    }

    try {
      const { data: mesaId, error: rpcError } = await supabase.rpc("crear_mesa_app", {
        p_sucursal_id: sucursalId,
        p_numero: String(payload.numero).trim(),
        p_capacidad: numberOrZero(payload.capacidad) || 4,
        p_estado: payload.estado || "disponible",
        p_descripcion: normalizeText(payload.descripcion)
      });

      if (rpcError) throw rpcError;

      if (!mesaId) {
        return { ok: false, message: "No se pudo crear la mesa." };
      }

      const { data, error } = await supabase
        .from("mesas")
        .select("id:mesas_id,sucursal_id,numero,capacidad,estado,descripcion,created_at,updated_at")
        .eq("mesas_id", mesaId)
        .single();

      if (error) throw error;

      const normalized = normalizeTable({
        id: data.id,
        sucursal_id: data.sucursal_id,
        numero: data.numero,
        capacidad: data.capacidad,
        estado: data.estado,
        descripcion: data.descripcion,
        created_at: data.created_at,
        updated_at: data.updated_at
      });

      state.tablesCache.push(normalized);
      return { ok: true, data: normalized };
    } catch (error) {
      console.error("createMesa error:", error);
      return { ok: false, message: error.message || "No se pudo crear la mesa." };
    }
  }

  function resolveMesaStateByReservationStatus(status) {
    const s = String(status || "").toLowerCase();
    if (s === "cancelada" || s === "finalizada") return "disponible";
    if (s === "confirmada" || s === "pendiente") return "reservada";
    return "reservada";
  }

  async function updateReservation(reservationId, payload = {}) {
    const reservation = state.reservationsCache.find(r => String(r.id) === String(reservationId)) || null;
    if (!reservation) {
      return { ok: false, message: "Reserva no encontrada." };
    }

    let vip = null;
    if (payload.cliente_vip_id) {
      vip = getVipById(payload.cliente_vip_id);
      if (!vip) {
        const vipMap = await loadVipByIds([payload.cliente_vip_id]);
        vip = vipMap.get(String(payload.cliente_vip_id)) || null;
      }
    }

    const contactPayload = await buildReservationContactData(payload, vip, reservation);
    const responsableContactoId = await saveContactSnapshot(reservation.responsable_contacto_id, contactPayload, contactPayload);

    let mesa = reservation.mesa_id ? state.tablesCache.find(t => String(t.id) === String(reservation.mesa_id)) || null : null;

    if (payload.mesa_id && String(payload.mesa_id) !== String(reservation.mesa_id || "")) {
      const { data, error } = await supabase
        .from("mesas")
        .select("id:mesas_id,sucursal_id,numero,capacidad,estado,descripcion,created_at,updated_at")
        .eq("id", payload.mesa_id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return { ok: false, message: "La mesa nueva no existe." };
      }

      const newMesa = normalizeTable(data);
      const event = await getEventById(reservation.evento_id);

      if (event && String(newMesa.sucursal_id) !== String(event.sucursal_id)) {
        return { ok: false, message: "La mesa nueva no pertenece a la sucursal del evento." };
      }

      if (newMesa.estado !== "disponible") {
        return { ok: false, message: "La mesa nueva no está disponible." };
      }

      if (numberOrZero(newMesa.capacidad) < numberOrZero(payload.cantidad_personas ?? reservation.cantidad_personas)) {
        return { ok: false, message: "La mesa nueva no tiene capacidad suficiente." };
      }

      mesa = newMesa;
    }

    const updateData = {
      cliente_vip_id: payload.cliente_vip_id ?? reservation.cliente_vip_id ?? null,
      responsable_contacto_id: responsableContactoId || reservation.responsable_contacto_id || null,
      cantidad_personas: payload.cantidad_personas !== undefined ? numberOrZero(payload.cantidad_personas) : reservation.cantidad_personas,
      monto_reserva: payload.monto_reserva !== undefined ? numberOrZero(payload.monto_reserva) : reservation.monto_reserva,
      observacion: payload.observacion !== undefined ? normalizeText(payload.observacion) : reservation.observacion,
      estado: payload.estado || reservation.estado,
      mesa_id: payload.mesa_id !== undefined ? (payload.mesa_id || null) : reservation.mesa_id,
      numero_mesa: mesa?.numero || reservation.numero_mesa || null
    };

    const { data, error } = await supabase
      .from("reservaciones_mesas")
      .update(updateData)
      .eq("id", reservationId)
      .select("id")
      .maybeSingle();

    if (error) throw error;

    if (reservation.mesa_id && String(updateData.mesa_id || "") !== String(reservation.mesa_id)) {
      await updateTableState(reservation.mesa_id, "disponible");
    }

    if (updateData.mesa_id) {
      await updateTableState(updateData.mesa_id, resolveMesaStateByReservationStatus(updateData.estado));
    }

    await loadReservations();
    return { ok: true, data };
  }

  async function updateReservationStatus(reservationId, newStatus) {
    return await updateReservation(reservationId, { estado: newStatus });
  }

  async function deleteReservation(reservationId) {
    const reservation = state.reservationsCache.find(r => String(r.id) === String(reservationId)) || null;

    const { error } = await supabase
      .from("reservaciones_mesas")
      .delete()
      .eq("id", reservationId);

    if (error) throw error;

    if (reservation?.mesa_id) {
      await updateTableState(reservation.mesa_id, "disponible");
    }

    state.reservationsCache = state.reservationsCache.filter(r => String(r.id) !== String(reservationId));
    return { ok: true };
  }

  function getSummaryCounts() {
    const pending = state.reservationsCache.filter(r => String(r.estado) === "pendiente").length;
    const confirmed = state.reservationsCache.filter(r => String(r.estado) === "confirmada").length;
    const availableTables = state.tablesCache.filter(t => t.estado === "disponible").length;
    const activeEvents = state.eventsCache.filter(e => ["programado", "activo"].includes(String(e.estado).toLowerCase())).length;

    return {
      pending,
      confirmed,
      availableTables,
      activeEvents
    };
  }

  window.ReservasModel = {
    state,
    currency,
    numberOrZero,
    parseDate,
    formatDate,
    bootstrapAuth,
    getAuthUser,
    setCurrentUser,
    getCurrentUser,
    getUserEmpresaFilter,
    getUserSucursalFilter,
    getEventTypes,
    loadEvents,
    loadTables,
    loadVipClients,
    loadReservations,
    loadAvailableTablesForEvent,
    createEvent,
    createEventReservation,
    createTableReservation,
    createMesa,
    updateReservation,
    updateReservationStatus,
    deleteReservation,
    getSummaryCounts,

    loadEventos: loadEvents,
    loadMesas: loadTables,
    loadReservas: loadReservations,
    loadClientesVip: loadVipClients
  };
})(window);