// js/models/admin.asistencias.model.js
(function (global) {
  class AdminAsistenciasModel {
    constructor(supabaseClient) {
      this.supabase = supabaseClient;
    }

    async getAsistencias({ fechaInicio, fechaFin, empresaId = null, sucursalId = null }) {
      if (!this.supabase) throw new Error("Supabase no está inicializado.");

      const decorateRows = async (rows) => {
        const userIds = [...new Set((rows || []).map((r) => r.usuario_id).filter(Boolean))];
        if (!userIds.length) return rows || [];

        const { data: usuarios, error: usuariosError } = await this.supabase
          .from("usuarios")
          .select("id,contacto_id,sucursal_id,role,created_at,updated_at")
          .in("id", userIds);

        if (usuariosError) throw usuariosError;

        const sucursalIds = [...new Set((usuarios || []).map((u) => u.sucursal_id).filter(Boolean))];
        const contactoIds = [...new Set((usuarios || []).map((u) => u.contacto_id).filter(Boolean))];

        const [sucursalesRes, contactosRes] = await Promise.all([
          sucursalIds.length
            ? this.supabase.from("sucursales").select("id,nombre,codigo,empresa_id").in("id", sucursalIds)
            : Promise.resolve({ data: [], error: null }),
          contactoIds.length
            ? this.supabase.from("contactos").select("id,nombre,telefono,email,identificacion,direccion").in("id", contactoIds)
            : Promise.resolve({ data: [], error: null })
        ]);

        if (sucursalesRes.error) throw sucursalesRes.error;
        if (contactosRes.error) throw contactosRes.error;

        const sucursalesMap = Object.fromEntries((sucursalesRes.data || []).map((s) => [s.id, s]));
        const contactosMap = Object.fromEntries((contactosRes.data || []).map((c) => [c.id, c]));
        const usuariosMap = Object.fromEntries((usuarios || []).map((u) => [u.id, u]));

        const empresaIds = [...new Set((sucursalesRes.data || []).map((s) => s.empresa_id).filter(Boolean))];
        const empresasRes = empresaIds.length
          ? await this.supabase.from("empresa").select("id,nombre").in("id", empresaIds)
          : { data: [], error: null };

        if (empresasRes.error) throw empresasRes.error;
        const empresasMap = Object.fromEntries((empresasRes.data || []).map((e) => [e.id, e]));

        return (rows || []).map((row) => {
          const usuario = usuariosMap[row.usuario_id] || null;
          const contacto = usuario?.contacto_id ? contactosMap[usuario.contacto_id] : null;
          const sucursal = usuario?.sucursal_id ? sucursalesMap[usuario.sucursal_id] : null;
          const empresa = sucursal?.empresa_id ? empresasMap[sucursal.empresa_id] : null;

          return {
            ...row,
            usuario_nombre: contacto?.nombre || row.usuario_nombre || "Sin nombre",
            usuario_email: contacto?.email || row.usuario_email || null,
            sucursal_id: usuario?.sucursal_id || row.sucursal_id || null,
            sucursal_nombre: sucursal?.nombre || row.sucursal_nombre || null,
            empresa_id: sucursal?.empresa_id || row.empresa_id || null,
            empresa_nombre: empresa?.nombre || row.empresa_nombre || null
          };
        });
      };

      let query = this.supabase
        .from("asistencias")
        .select("id,usuario_id,jornada_id,fecha,entrada_time,salida_time,status,justificacion,created_at,entrada_raw,salida_raw")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin);

      const { data, error } = await query.order("fecha", { ascending: false });
      if (error) throw error;

      const decorated = await decorateRows(data || []);

      return decorated.filter((row) => {
        if (sucursalId && String(row.sucursal_id || "") !== String(sucursalId)) return false;
        if (empresaId && String(row.empresa_id || "") !== String(empresaId)) return false;
        return true;
      });
    }

    async deleteAsistencia(id) {
      const { error } = await this.supabase
        .from("asistencias")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    }

    async consentirEntrada(id) {
      const { error } = await this.supabase
        .from("asistencias")
        .update({ entrada_raw: "Consentida" })
        .eq("id", id);

      if (error) throw error;
      return true;
    }

    async consentirSalida(id) {
      const { error } = await this.supabase
        .from("asistencias")
        .update({ salida_raw: "Consentida" })
        .eq("id", id);

      if (error) throw error;
      return true;
    }

    async getJornadas({ empresaId = null, sucursalId = null } = {}) {
      if (!this.supabase) throw new Error("Supabase no está inicializado.");

      const normalize = (rows) => {
        return (rows || []).map((j) => ({
          ...j,
          empresa_id: j.empresa_id ?? null,
          sucursal_id: j.sucursal_id ?? null
        }));
      };

      const filterRows = async (rows) => {
        const normalized = normalize(rows);
        const sucursalIds = [...new Set(normalized.map((j) => j.sucursal_id).filter(Boolean))];

        const sucRes = sucursalIds.length
          ? await this.supabase.from("sucursales").select("id,nombre,codigo,empresa_id").in("id", sucursalIds)
          : { data: [], error: null };

        if (sucRes.error) throw sucRes.error;

        const sucMap = Object.fromEntries((sucRes.data || []).map((s) => [s.id, s]));
        const empIds = [...new Set((sucRes.data || []).map((s) => s.empresa_id).filter(Boolean))];
        const empRes = empIds.length
          ? await this.supabase.from("empresa").select("id,nombre").in("id", empIds)
          : { data: [], error: null };

        if (empRes.error) throw empRes.error;

        const empMap = Object.fromEntries((empRes.data || []).map((e) => [e.id, e]));

        return normalized
          .map((j) => {
            const suc = j.sucursal_id ? sucMap[j.sucursal_id] : null;
            const emp = suc?.empresa_id ? empMap[suc.empresa_id] : null;
            return {
              ...j,
              sucursal_nombre: suc?.nombre || null,
              empresa_id: suc?.empresa_id || null,
              empresa_nombre: emp?.nombre || null
            };
          })
          .filter((j) => {
            if (empresaId && String(j.empresa_id || "") !== String(empresaId)) return false;
            if (sucursalId && String(j.sucursal_id || "") !== String(sucursalId)) return false;
            return true;
          });
      };

      const { data, error } = await this.supabase
        .from("jornadas")
        .select("id,nombre,hora_entrada,hora_salida,sucursal_id,activo");

      if (error) throw error;

      return await filterRows(data || []);
    }

    async getJornadaById(id) {
      const { data, error } = await this.supabase
        .from("jornadas")
        .select("id,nombre,hora_entrada,hora_salida,sucursal_id,activo")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    }

    async saveJornada(jornada, editingId = null) {
      const payload = {
        nombre: jornada?.nombre ?? "",
        hora_entrada: jornada?.hora_entrada ?? null,
        hora_salida: jornada?.hora_salida ?? null,
        sucursal_id: jornada?.sucursal_id ?? null,
        activo: typeof jornada?.activo === "boolean" ? jornada.activo : true
      };

      if (editingId) {
        const { error } = await this.supabase
          .from("jornadas")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
        return editingId;
      }

      const { data, error } = await this.supabase
        .from("jornadas")
        .insert([payload])
        .select("id,nombre,hora_entrada,hora_salida,sucursal_id,activo")
        .maybeSingle();

      if (error) throw error;
      return data;
    }

    async deleteJornada(id) {
      const { error } = await this.supabase
        .from("jornadas")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    }
  }

  global.AdminAsistenciasModel = AdminAsistenciasModel;
})(window);