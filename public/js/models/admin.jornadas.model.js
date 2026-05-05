(function (global) {
  const supabase = global.supabase;

  if (!supabase) {
    console.warn("Supabase no inicializado en admin.jornadas.model.js");
  }

  function parseTimeString(timeStr) {
    if (!timeStr) return null;
    timeStr = String(timeStr).trim();

    const ampm = /(\d{1,2}:\d{2}(?::\d{2})?)\s*([ap]\.?m\.?)/i.exec(timeStr);
    if (ampm) {
      const t = ampm[1];
      const ap = ampm[2];
      const parts = t.split(":").map(n => Number(n));
      let hh = parts[0];
      const mm = parts[1] || 0;
      const ss = parts[2] || 0;
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
    const tnorm = parseTimeString(timeStr) || "00:00:00";
    const s = `${fechaStr}T${tnorm}`;
    const d = new Date(s);

    if (isNaN(d)) {
      try {
        const [y, m, day] = fechaStr.split("-").map(n => Number(n));
        const [hh, mm, ss] = tnorm.split(":").map(n => Number(n));
        return new Date(y, m - 1, day, hh, mm, ss);
      } catch (e) {
        return new Date(s);
      }
    }

    return d;
  }

  function normalizeId(value) {
    if (value === null || typeof value === "undefined" || value === "") return null;
    return String(value);
  }

  function normalizeJornadaRow(doc) {
    return {
      id: normalizeId(doc.id),
      nombre: doc.nombre || "",
      horaEntrada: doc.hora_entrada || doc.horaEntrada || "",
      horaSalida: doc.hora_salida || doc.horaSalida || "",
      empresa_id: doc.empresa_id || doc.sucursal_empresa_id || doc.empresa || null,
      sucursal_id: normalizeId(doc.sucursal_id || doc.sucursal || null),
      activo: typeof doc.activo === "boolean" ? doc.activo : true
    };
  }

  function normalizeEmpresaId(value) {
    if (value === null || typeof value === "undefined" || value === "") return null;
    return String(value);
  }

  function matchesContext(row, ctx = {}) {
    const empresaId = normalizeEmpresaId(ctx.empresaId);
    const sucursalId = normalizeEmpresaId(ctx.sucursalId);

    const rowEmpresa = normalizeEmpresaId(row.empresa_id || row.sucursal_empresa_id || row.empresa || null);
    const rowSucursal = normalizeEmpresaId(row.sucursal_id || row.sucursal || null);

    if (empresaId && rowEmpresa && rowEmpresa !== empresaId) return false;
    if (sucursalId && rowSucursal && rowSucursal !== sucursalId) return false;

    return true;
  }

  async function getJornadas(ctx = {}) {
    if (!supabase) return [];

    try {
      let data = null;

      try {
        const res = await supabase.from("v_jornadas").select("*");
        if (res.error) throw res.error;
        data = res.data || [];
      } catch (e) {
        const res2 = await supabase.from("jornadas").select("*");
        if (res2.error) throw res2.error;
        data = res2.data || [];
      }

      return (data || []).map(normalizeJornadaRow).filter(row => matchesContext(row, ctx));
    } catch (err) {
      console.error("getJornadas error:", err);
      throw err;
    }
  }

  async function getJornadaById(id) {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("jornadas")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function saveJornada(payload, editingId = null) {
    if (!supabase) throw new Error("Supabase no disponible");

    const data = {
      nombre: payload.nombre || "",
      hora_entrada: payload.hora_entrada || payload.horaEntrada || "",
      hora_salida: payload.hora_salida || payload.horaSalida || "",
      sucursal_id: normalizeId(payload.sucursal_id || payload.sucursalId)
    };

    if (editingId) {
      const { error } = await supabase
        .from("jornadas")
        .update(data)
        .eq("id", editingId);

      if (error) throw error;
      return { ok: true, mode: "update" };
    }

    const { error } = await supabase
      .from("jornadas")
      .insert([data]);

    if (error) throw error;
    return { ok: true, mode: "insert" };
  }

  async function deleteJornada(id) {
    if (!supabase) throw new Error("Supabase no disponible");

    const { error } = await supabase.from("jornadas").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  async function getAsistencias(fechaInicio, fechaFin, ctx = {}) {
    if (!supabase) return [];

    let query = supabase
      .from("v_asistencias_final")
      .select("*")
      .gte("fecha", fechaInicio)
      .lte("fecha", fechaFin);

    if (ctx.empresaId) query = query.eq("empresa_id", ctx.empresaId);
    if (ctx.sucursalId) query = query.eq("sucursal_id", ctx.sucursalId);

    const { data, error } = await query.order("fecha", { ascending: false });
    if (error) throw error;

    return data || [];
  }

  async function deleteAsistencia(id) {
    if (!supabase) throw new Error("Supabase no disponible");

    const { error } = await supabase.from("asistencias").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  async function consentirSinEntrada(id) {
    if (!supabase) throw new Error("Supabase no disponible");

    const { error } = await supabase
      .from("asistencias")
      .update({ entrada_raw: "Consentida" })
      .eq("id", id);

    if (error) throw error;
    return true;
  }

  async function consentirSinSalida(id) {
    if (!supabase) throw new Error("Supabase no disponible");

    const { error } = await supabase
      .from("asistencias")
      .update({ salida_raw: "Consentida" })
      .eq("id", id);

    if (error) throw error;
    return true;
  }

  function getJornadasEnSelect(ctx = {}) {
    return getJornadas(ctx);
  }

  global.JornadasModel = {
    parseTimeString,
    crearFechaCompleta,
    normalizeJornadaRow,
    getJornadas,
    getJornadaById,
    saveJornada,
    deleteJornada,
    getAsistencias,
    deleteAsistencia,
    consentirSinEntrada,
    consentirSinSalida,
    getJornadasEnSelect
  };
})(window);