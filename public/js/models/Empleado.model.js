// js/models/Empleado.model.js
(function (global) {
  "use strict";

  function logError(context, error, extra = {}) {
    console.log(`[EmpleadoModel] ${context}`, {
      message: error?.message,
      error,
      ...extra
    });
  }

  class EmpleadoModel {
    static UNICA_EMPRESA_ID = "UNICA EMPRESA";
    static UNICA_EMPRESA_NOMBRE = "Vértigo";

    constructor(supabaseClient) {
      if (!supabaseClient) {
        throw new Error("Supabase no está inicializado.");
      }
      this.supabase = supabaseClient;
    }

    isUuid(value) {
      return typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value).trim());
    }

    normalizeId(value) {
      const v = (value ?? "").toString().trim();
      return v || null;
    }

    cleanText(value) {
      const v = value ?? "";
      if (v === '""' || v === "''" || v === "null" || v === "undefined") return "";
      return String(v).trim();
    }

    cleanNullableText(value) {
      const v = this.cleanText(value);
      return v === "" ? null : v;
    }

    cleanNumber(value, fallback = 0) {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    }

    mapEmpleadoViewRow(row) {
      if (!row) return null;

      return {
        id: row.id || null,
        nombre: row.nombre || "Sin nombre",
        email: row.email || null,
        telefono: row.telefono || null,
        identificacion: row.identificacion || null,
        direccion: row.direccion || null,
        identificacion_nombre: row.identificacion_nombre || null,
        nacimiento: row.nacimiento || null,
        afp: row.afp || null,
        isss: row.isss || null,
        descripcion: row.descripcion || null,
        salario_h: row.salario_h ?? 0,
        ayuda_economica: row.ayuda_economica ?? 0,
        bonificacion: row.bonificacion ?? 0,
        role: row.role || "empleado",
        sucursal_id: row.sucursal_id || null,
        sucursal_nombre: row.sucursal_nombre || null,
        sucursal_codigo: row.sucursal_codigo || null,
        empresa_id: row.empresa_id || EmpleadoModel.UNICA_EMPRESA_ID,
        empresa_nombre: row.empresa_nombre || EmpleadoModel.UNICA_EMPRESA_NOMBRE,
        contacto_id: row.contacto_id || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        contacto_created_at: row.contacto_created_at || null,
        contacto_updated_at: row.contacto_updated_at || null
      };
    }

    async getEmpresaById(id) {
      const empresaId = this.normalizeId(id) || EmpleadoModel.UNICA_EMPRESA_ID;

      try {
        const { data, error } = await this.supabase
          .from("empresa")
          .select("id,nombre")
          .eq("id", empresaId)
          .maybeSingle();

        if (error) {
          logError("getEmpresaById", error, { id: empresaId });
          throw error;
        }

        return data || {
          id: EmpleadoModel.UNICA_EMPRESA_ID,
          nombre: EmpleadoModel.UNICA_EMPRESA_NOMBRE
        };
      } catch (err) {
        logError("getEmpresaById(catch)", err, { id: empresaId });
        return {
          id: EmpleadoModel.UNICA_EMPRESA_ID,
          nombre: EmpleadoModel.UNICA_EMPRESA_NOMBRE
        };
      }
    }

    async getSucursalById(id) {
      const targetId = this.normalizeId(id);
      if (!targetId || !this.isUuid(targetId)) return null;

      const { data, error } = await this.supabase
        .from("sucursales")
        .select("id,nombre,codigo,empresa_id")
        .eq("id", targetId)
        .maybeSingle();

      if (error) {
        logError("getSucursalById", error, { id: targetId });
        throw error;
      }

      return data || null;
    }

    async getSucursalIdsByEmpresa(empresaId) {
      const targetEmpresaId = this.normalizeId(empresaId);
      if (!targetEmpresaId) return [];

      const { data, error } = await this.supabase
        .from("sucursales")
        .select("id")
        .eq("empresa_id", targetEmpresaId);

      if (error) {
        logError("getSucursalIdsByEmpresa", error, { empresaId: targetEmpresaId });
        throw error;
      }

      return (Array.isArray(data) ? data : [])
        .map(r => r.id)
        .filter(Boolean);
    }

    async getFirstSucursalIdByEmpresa(empresaId) {
      const targetEmpresaId = this.normalizeId(empresaId);
      if (!targetEmpresaId) return null;

      const { data, error } = await this.supabase
        .from("sucursales")
        .select("id")
        .eq("empresa_id", targetEmpresaId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        logError("getFirstSucursalIdByEmpresa", error, { empresaId: targetEmpresaId });
        throw error;
      }

      return data?.id || null;
    }

    async resolveSucursalId({ empresaId = null, preferredSucursalId = null } = {}) {
      const targetEmpresaId = this.normalizeId(empresaId);
      const preferred = this.normalizeId(preferredSucursalId);

      if (preferred && this.isUuid(preferred)) {
        const row = await this.getSucursalById(preferred).catch(err => {
          logError("resolveSucursalId(getSucursalById)", err, {
            empresaId: targetEmpresaId,
            preferredSucursalId: preferred
          });
          return null;
        });

        if (row?.id) {
          if (!targetEmpresaId || this.normalizeId(row.empresa_id) === targetEmpresaId) {
            return row.id;
          }

          logError(
            "resolveSucursalId(preferred mismatch empresa)",
            new Error("Sucursal no pertenece a la empresa actual"),
            {
              empresaId: targetEmpresaId,
              preferredSucursalId: preferred,
              row
            }
          );
        }
      }

      if (targetEmpresaId) {
        const byEmpresa = await this.getFirstSucursalIdByEmpresa(targetEmpresaId).catch(err => {
          logError("resolveSucursalId(getFirstSucursalIdByEmpresa)", err, { empresaId: targetEmpresaId });
          return null;
        });

        if (byEmpresa && this.isUuid(byEmpresa)) return byEmpresa;
      }

      const { data, error } = await this.supabase
        .from("sucursales")
        .select("id,empresa_id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        logError("resolveSucursalId(global fallback)", error, { empresaId: targetEmpresaId });
        throw error;
      }

      if (!data?.id || !this.isUuid(data.id)) return null;

      if (targetEmpresaId && this.normalizeId(data.empresa_id) !== targetEmpresaId) {
        return null;
      }

      return data.id;
    }

    async getContactsMapByIds(ids) {
      const unique = [...new Set((ids || []).filter(Boolean))];
      if (!unique.length) return {};

      const { data, error } = await this.supabase
        .from("contactos")
        .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
        .in("id", unique);

      if (error) {
        logError("getContactsMapByIds", error, { ids: unique });
        throw error;
      }

      return Object.fromEntries((data || []).map(row => [row.id, row]));
    }

    async getEmpleadoBaseById(id) {
      const { data, error } = await this.supabase
        .from("usuarios")
        .select("id,role,sucursal_id,contacto_id,nacimiento,identificacion_nombre,afp,isss,descripcion,salario_h,ayuda_economica,bonificacion,created_at,updated_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        logError("getEmpleadoBaseById", error, { id });
        throw error;
      }

      return data || null;
    }

    async getEmpleadoCombinadoById(id) {
      try {
        const { data, error } = await this.supabase
          .from("v_usuarios")
          .select("id,nombre,email,telefono,identificacion,direccion,identificacion_nombre,nacimiento,afp,isss,descripcion,salario_h,ayuda_economica,bonificacion,role,sucursal_id,sucursal_nombre,sucursal_codigo,empresa_id,empresa_nombre,contacto_id,created_at,updated_at,contacto_created_at,contacto_updated_at")
          .eq("id", id)
          .maybeSingle();

        if (!error && data) {
          return this.mapEmpleadoViewRow(data);
        }

        if (error) {
          logError("getEmpleadoCombinadoById(v_usuarios)", error, { id });
        }

        const base = await this.getEmpleadoBaseById(id);
        if (!base) return null;

        const contacto = await this.getContactsMapByIds(base.contacto_id ? [base.contacto_id] : [])
          .then(map => (base.contacto_id ? map[base.contacto_id] : null))
          .catch(() => null);

        let empresaId = EmpleadoModel.UNICA_EMPRESA_ID;
        let empresaNombre = EmpleadoModel.UNICA_EMPRESA_NOMBRE;
        let sucursalNombre = null;
        let sucursalCodigo = null;

        if (base.sucursal_id) {
          const sucursal = await this.getSucursalById(base.sucursal_id).catch(() => null);
          if (sucursal) {
            sucursalNombre = sucursal.nombre || null;
            sucursalCodigo = sucursal.codigo || null;
            if (sucursal.empresa_id) {
              empresaId = sucursal.empresa_id;
              const empresa = await this.getEmpresaById(empresaId).catch(() => null);
              empresaNombre = empresa?.nombre || empresaNombre;
            }
          }
        }

        return {
          id: base.id,
          nombre: contacto?.nombre || "Sin nombre",
          email: contacto?.email || null,
          telefono: contacto?.telefono || null,
          identificacion: contacto?.identificacion || null,
          direccion: contacto?.direccion || null,
          identificacion_nombre: base.identificacion_nombre || null,
          nacimiento: base.nacimiento || null,
          afp: base.afp || null,
          isss: base.isss || null,
          descripcion: base.descripcion || null,
          salario_h: base.salario_h || 0,
          ayuda_economica: base.ayuda_economica || 0,
          bonificacion: base.bonificacion || 0,
          role: base.role || "empleado",
          sucursal_id: base.sucursal_id || null,
          sucursal_nombre: sucursalNombre,
          sucursal_codigo: sucursalCodigo,
          empresa_id: empresaId,
          empresa_nombre: empresaNombre,
          contacto_id: base.contacto_id || null,
          created_at: base.created_at || null,
          updated_at: base.updated_at || null,
          contacto_created_at: contacto?.created_at || null,
          contacto_updated_at: contacto?.updated_at || null
        };
      } catch (err) {
        logError("getEmpleadoCombinadoById(catch)", err, { id });
        return null;
      }
    }

    async getEmpleados({ empresaId = null, sucursalId = null } = {}) {
      const targetEmpresaId = this.normalizeId(empresaId);
      const resolvedSucursalId = this.normalizeId(sucursalId);

      const sucursalIds = resolvedSucursalId
        ? [resolvedSucursalId]
        : targetEmpresaId
          ? await this.getSucursalIdsByEmpresa(targetEmpresaId).catch(err => {
              logError("getEmpleados -> getSucursalIdsByEmpresa", err, { empresaId: targetEmpresaId });
              return [];
            })
          : [];

      try {
        let q = this.supabase
          .from("v_usuarios")
          .select("id,nombre,email,telefono,identificacion,direccion,identificacion_nombre,nacimiento,afp,isss,descripcion,salario_h,ayuda_economica,bonificacion,role,sucursal_id,sucursal_nombre,sucursal_codigo,empresa_id,empresa_nombre,contacto_id,created_at,updated_at,contacto_created_at,contacto_updated_at")
          .eq("role", "empleado")
          .order("nombre", { ascending: true });

        if (targetEmpresaId) q = q.eq("empresa_id", targetEmpresaId);
        if (sucursalIds.length > 0) q = q.in("sucursal_id", sucursalIds);

        const { data, error } = await q;
        if (!error) {
          return (Array.isArray(data) ? data : []).map(row => this.mapEmpleadoViewRow(row));
        }

        logError("getEmpleados(v_usuarios)", error, { empresaId: targetEmpresaId, sucursalIds });
      } catch (err) {
        logError("getEmpleados(v_usuarios) catch", err, { empresaId: targetEmpresaId, sucursalIds });
      }

      let fallback = this.supabase
        .from("usuarios")
        .select("id,role,sucursal_id,contacto_id,nacimiento,identificacion_nombre,afp,isss,descripcion,salario_h,ayuda_economica,bonificacion,created_at,updated_at")
        .eq("role", "empleado")
        .order("created_at", { ascending: true });

      if (sucursalIds.length > 0) {
        fallback = fallback.in("sucursal_id", sucursalIds);
      }

      const { data, error } = await fallback;
      if (error) {
        logError("getEmpleados(fallback usuarios)", error, { empresaId: targetEmpresaId, sucursalIds });
        throw error;
      }

      const rows = Array.isArray(data) ? data : [];
      const contactsMap = await this.getContactsMapByIds(rows.map(r => r.contacto_id).filter(Boolean)).catch(() => ({}));

      const sucursalCache = new Map();
      const empresaCache = new Map();

      const mapped = [];
      for (const row of rows) {
        let sucursalNombre = null;
        let sucursalCodigo = null;
        let empresaIdRow = targetEmpresaId || EmpleadoModel.UNICA_EMPRESA_ID;
        let empresaNombre = EmpleadoModel.UNICA_EMPRESA_NOMBRE;

        if (row.sucursal_id) {
          if (sucursalCache.has(row.sucursal_id)) {
            const s = sucursalCache.get(row.sucursal_id);
            sucursalNombre = s?.nombre || null;
            sucursalCodigo = s?.codigo || null;
            empresaIdRow = s?.empresa_id || empresaIdRow;
          } else {
            const s = await this.getSucursalById(row.sucursal_id).catch(() => null);
            sucursalCache.set(row.sucursal_id, s);
            sucursalNombre = s?.nombre || null;
            sucursalCodigo = s?.codigo || null;
            empresaIdRow = s?.empresa_id || empresaIdRow;
          }

          if (empresaIdRow) {
            if (empresaCache.has(empresaIdRow)) {
              empresaNombre = empresaCache.get(empresaIdRow) || empresaNombre;
            } else {
              const emp = await this.getEmpresaById(empresaIdRow).catch(() => null);
              empresaNombre = emp?.nombre || empresaNombre;
              empresaCache.set(empresaIdRow, empresaNombre);
            }
          }
        }

        const contact = row.contacto_id ? contactsMap[row.contacto_id] : null;

        mapped.push({
          id: row.id,
          nombre: contact?.nombre || "Sin nombre",
          email: contact?.email || null,
          telefono: contact?.telefono || null,
          identificacion: contact?.identificacion || null,
          direccion: contact?.direccion || null,
          identificacion_nombre: row.identificacion_nombre || null,
          nacimiento: row.nacimiento || null,
          afp: row.afp || null,
          isss: row.isss || null,
          descripcion: row.descripcion || null,
          salario_h: row.salario_h || 0,
          ayuda_economica: row.ayuda_economica || 0,
          bonificacion: row.bonificacion || 0,
          role: row.role || "empleado",
          sucursal_id: row.sucursal_id || null,
          sucursal_nombre: sucursalNombre,
          sucursal_codigo: sucursalCodigo,
          empresa_id: empresaIdRow,
          empresa_nombre: empresaNombre,
          contacto_id: row.contacto_id || null,
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
          contacto_created_at: contact?.created_at || null,
          contacto_updated_at: contact?.updated_at || null
        });
      }

      return mapped;
    }

    async getEmpleadoById(id) {
      try {
        const combined = await this.getEmpleadoCombinadoById(id);
        if (combined) return combined;
      } catch (err) {
        logError("getEmpleadoById(combined)", err, { id });
      }

      const { data, error } = await this.supabase
        .from("usuarios")
        .select("id,role,sucursal_id,contacto_id,nacimiento,identificacion_nombre,afp,isss,descripcion,salario_h,ayuda_economica,bonificacion,created_at,updated_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        logError("getEmpleadoById(usuarios)", error, { id });
        throw error;
      }

      if (!data) return null;

      const contacto = await this.getContactsMapByIds(data.contacto_id ? [data.contacto_id] : [])
        .then(map => (data.contacto_id ? map[data.contacto_id] : null))
        .catch(() => null);

      let sucursalNombre = null;
      let sucursalCodigo = null;
      let empresaId = EmpleadoModel.UNICA_EMPRESA_ID;
      let empresaNombre = EmpleadoModel.UNICA_EMPRESA_NOMBRE;

      if (data.sucursal_id) {
        const sucursal = await this.getSucursalById(data.sucursal_id).catch(() => null);
        sucursalNombre = sucursal?.nombre || null;
        sucursalCodigo = sucursal?.codigo || null;

        if (sucursal?.empresa_id) {
          empresaId = sucursal.empresa_id;
          const empresa = await this.getEmpresaById(empresaId).catch(() => null);
          empresaNombre = empresa?.nombre || empresaNombre;
        }
      }

      return {
        id: data.id,
        nombre: contacto?.nombre || "Sin nombre",
        email: contacto?.email || null,
        telefono: contacto?.telefono || null,
        identificacion: contacto?.identificacion || null,
        direccion: contacto?.direccion || null,
        identificacion_nombre: data.identificacion_nombre || null,
        nacimiento: data.nacimiento || null,
        afp: data.afp || null,
        isss: data.isss || null,
        descripcion: data.descripcion || null,
        salario_h: data.salario_h || 0,
        ayuda_economica: data.ayuda_economica || 0,
        bonificacion: data.bonificacion || 0,
        role: data.role || "empleado",
        sucursal_id: data.sucursal_id || null,
        sucursal_nombre: sucursalNombre,
        sucursal_codigo: sucursalCodigo,
        empresa_id: empresaId,
        empresa_nombre: empresaNombre,
        contacto_id: data.contacto_id || null,
        created_at: data.created_at || null,
        updated_at: data.updated_at || null,
        contacto_created_at: contacto?.created_at || null,
        contacto_updated_at: contacto?.updated_at || null
      };
    }

    async getJornadas({ empresaId = null, sucursalId = null } = {}) {
      const targetEmpresaId = this.normalizeId(empresaId);
      const resolvedSucursalId = this.normalizeId(sucursalId);

      const sucursalIds = resolvedSucursalId
        ? [resolvedSucursalId]
        : targetEmpresaId
          ? await this.getSucursalIdsByEmpresa(targetEmpresaId).catch(err => {
              logError("getJornadas -> getSucursalIdsByEmpresa", err, { empresaId: targetEmpresaId });
              return [];
            })
          : [];

      try {
        let q = this.supabase
          .from("jornadas")
          .select("id,nombre,sucursal_id,activo,hora_entrada,hora_salida")
          .order("nombre", { ascending: true });

        if (sucursalIds.length > 0) q = q.in("sucursal_id", sucursalIds);

        const { data, error } = await q;
        if (error) {
          logError("getJornadas(jornadas)", error, { empresaId: targetEmpresaId, sucursalIds });
          throw error;
        }

        return Array.isArray(data) ? data : [];
      } catch (err) {
        logError("getJornadas(catch)", err, { empresaId: targetEmpresaId, sucursalIds });
        return [];
      }
    }

    async getJornadasEmpleado(usuarioId) {
      if (!usuarioId) return [];

      const { data, error } = await this.supabase
        .from("usuario_jornadas")
        .select("jornada_id")
        .eq("usuario_id", usuarioId);

      if (error) {
        logError("getJornadasEmpleado", error, { usuarioId });
        throw error;
      }

      return (data || []).map(r => r.jornada_id);
    }

    async setUserJornadas(usuarioId, jornadaIds = []) {
      const del = await this.supabase
        .from("usuario_jornadas")
        .delete()
        .eq("usuario_id", usuarioId);

      if (del.error) {
        logError("setUserJornadas(delete)", del.error, { usuarioId, jornadaIds });
        throw del.error;
      }

      if (!Array.isArray(jornadaIds) || jornadaIds.length === 0) return;

      const rows = jornadaIds.map(jid => ({
        usuario_id: usuarioId,
        jornada_id: jid
      }));

      const { error } = await this.supabase
        .from("usuario_jornadas")
        .insert(rows);

      if (error) {
        logError("setUserJornadas(insert)", error, { usuarioId, jornadaIds });
        throw error;
      }
    }

    async emailExists(email) {
      if (!email) return false;

      try {
        const { data, error } = await this.supabase
          .from("v_usuarios")
          .select("id")
          .eq("email", email)
          .limit(1);

        if (error) {
          logError("emailExists(v_usuarios)", error, { email });
        } else if (Array.isArray(data) && data.length > 0) {
          return true;
        }

        const { data: contactos, error: contactoError } = await this.supabase
          .from("contactos")
          .select("id")
          .eq("email", email)
          .limit(1);

        if (contactoError) {
          logError("emailExists(contactos)", contactoError, { email });
          throw contactoError;
        }

        return Array.isArray(contactos) && contactos.length > 0;
      } catch (err) {
        logError("emailExists(catch)", err, { email });
        throw err;
      }
    }

    async getSessionAccessToken() {
      const { data, error } = await this.supabase.auth.getSession();

      if (error) {
        logError("getSessionAccessToken(getSession)", error);
        throw error;
      }

      const accessToken = data?.session?.access_token || null;

      if (!accessToken) {
        const err = new Error("No hay sesión válida.");
        logError("getSessionAccessToken(no session)", err);
        throw err;
      }

      return accessToken;
    }

    buildAdminFunctionPayload(payload) {
      const sucursalId = this.normalizeId(payload?.sucursal_id);

      return {
        ...payload,
        sucursal_id: sucursalId,
        sucursalId: sucursalId,
        data: {
          ...(payload?.data || {}),
          sucursal_id: sucursalId,
          sucursalId: sucursalId
        },
        payload: {
          ...(payload || {}),
          sucursal_id: sucursalId,
          sucursalId: sucursalId,
          data: {
            ...(payload?.data || {}),
            sucursal_id: sucursalId,
            sucursalId: sucursalId
          }
        }
      };
    }

    async invokeEmployeeAdminFunction(payload) {
      const sucursalId = this.normalizeId(payload?.sucursal_id);

      if (!sucursalId || !this.isUuid(sucursalId)) {
        const err = new Error("sucursal_id es obligatorio y debe ser un UUID válido.");
        logError("invokeEmployeeAdminFunction(validación)", err, { payload });
        throw err;
      }

      const accessToken = await this.getSessionAccessToken();
      const url = `${this.supabase.supabaseUrl}/functions/v1/delete-auth-user`;

      const bodyPayload = this.buildAdminFunctionPayload(payload);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": this.supabase.supabaseKey
        },
        body: JSON.stringify(bodyPayload)
      });

      const text = await response.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        const err = new Error(data?.error || `Error HTTP ${response.status}`);
        logError("invokeEmployeeAdminFunction", err, { status: response.status, data, payload: bodyPayload });
        throw err;
      }

      return data || true;
    }

    async createEmpleado({ email, password, data, jornadas = [] }) {
      if (!email || !password) {
        const err = new Error("Email y contraseña son obligatorios.");
        logError("createEmpleado(validación)", err, { email });
        throw err;
      }

      const alreadyExists = await this.emailExists(email).catch(err => {
        logError("createEmpleado(emailExists)", err, { email });
        return false;
      });

      if (alreadyExists) {
        const err = new Error("Ya existe un empleado con este correo.");
        logError("createEmpleado(duplicado)", err, { email });
        throw err;
      }

      const empresaId = this.normalizeId(data?.empresa_id) || EmpleadoModel.UNICA_EMPRESA_ID;
      const resolvedSucursalId = await this.resolveSucursalId({
        empresaId,
        preferredSucursalId: data?.sucursal_id
      });

      if (!resolvedSucursalId || !this.isUuid(resolvedSucursalId)) {
        const err = new Error("No se encontró una sucursal válida para crear el empleado.");
        logError("createEmpleado(sucursal missing)", err, { email, data, resolvedSucursalId });
        throw err;
      }

      const sucursalRow = await this.getSucursalById(resolvedSucursalId).catch(err => {
        logError("createEmpleado(getSucursalById)", err, { resolvedSucursalId });
        return null;
      });

      if (!sucursalRow?.id) {
        const err = new Error("La sucursal no existe en la base de datos.");
        logError("createEmpleado(sucursal not found)", err, { email, resolvedSucursalId });
        throw err;
      }

      if (this.normalizeId(sucursalRow.empresa_id) && this.normalizeId(sucursalRow.empresa_id) !== empresaId) {
        const err = new Error("La sucursal no pertenece a la empresa activa.");
        logError("createEmpleado(empresa mismatch)", err, { email, empresaId, sucursalRow });
        throw err;
      }

      const normalizedEmpresaId = this.normalizeId(sucursalRow.empresa_id) || empresaId;

      const payload = {
        action: "create",
        email,
        password,
        nombre: data?.nombre || "",
        role: data?.role || "empleado",
        sucursal_id: resolvedSucursalId,
        empresa_id: normalizedEmpresaId,
        sucursal: sucursalRow,
        data: {
          nombre: data?.nombre || "",
          role: data?.role || "empleado",
          sucursal_id: resolvedSucursalId,
          empresa_id: normalizedEmpresaId,
          nacimiento: data?.nacimiento || null,
          identificacion: data?.identificacion || null,
          identificacion_nombre: data?.identificacion_nombre || null,
          telefono: data?.telefono || null,
          direccion: data?.direccion || null,
          afp: data?.afp || null,
          isss: data?.isss || null,
          descripcion: data?.descripcion || null,
          salario_h: data?.salario_h || 0,
          ayuda_economica: data?.ayuda_economica || 0,
          bonificacion: data?.bonificacion || 0
        },
        jornadas: Array.isArray(jornadas) ? jornadas : []
      };

      const result = await this.invokeEmployeeAdminFunction(payload);

      if (!result?.success) {
        const err = new Error("No se pudo crear el empleado.");
        logError("createEmpleado(resultado inválido)", err, { payload, result });
        throw err;
      }

      return result?.userId || result?.id || true;
    }

    async updateEmpleado(id, data, jornadas = []) {
      if (!id) {
        const err = new Error("ID inválido.");
        logError("updateEmpleado(validación)", err, { id, data, jornadas });
        throw err;
      }

      const currentView = await this.getEmpleadoCombinadoById(id).catch(err => {
        logError("updateEmpleado(getEmpleadoCombinadoById)", err, { id });
        return null;
      });

      const merged = {
        nombre: this.cleanNullableText(data?.nombre) ?? currentView?.nombre ?? null,
        email: this.cleanNullableText(data?.email) ?? currentView?.email ?? null,
        telefono: this.cleanNullableText(data?.telefono) ?? currentView?.telefono ?? null,
        identificacion: this.cleanNullableText(data?.identificacion) ?? currentView?.identificacion ?? null,
        direccion: this.cleanNullableText(data?.direccion) ?? currentView?.direccion ?? null,
        identificacion_nombre: this.cleanNullableText(data?.identificacion_nombre) ?? currentView?.identificacion_nombre ?? null,
        nacimiento: this.cleanNullableText(data?.nacimiento) ?? currentView?.nacimiento ?? null,
        afp: this.cleanNullableText(data?.afp) ?? currentView?.afp ?? null,
        isss: this.cleanNullableText(data?.isss) ?? currentView?.isss ?? null,
        descripcion: this.cleanNullableText(data?.descripcion) ?? currentView?.descripcion ?? null,
        salario_h: typeof data?.salario_h !== "undefined"
          ? this.cleanNumber(data.salario_h, currentView?.salario_h ?? 0)
          : (currentView?.salario_h ?? 0),
        ayuda_economica: typeof data?.ayuda_economica !== "undefined"
          ? this.cleanNumber(data.ayuda_economica, currentView?.ayuda_economica ?? 0)
          : (currentView?.ayuda_economica ?? 0),
        bonificacion: typeof data?.bonificacion !== "undefined"
          ? this.cleanNumber(data.bonificacion, currentView?.bonificacion ?? 0)
          : (currentView?.bonificacion ?? 0),
        role: data?.role || currentView?.role || "empleado",
        sucursal_id: data?.sucursal_id || currentView?.sucursal_id || null,
        empresa_id: data?.empresa_id || currentView?.empresa_id || EmpleadoModel.UNICA_EMPRESA_ID
      };

      let contactoId = currentView?.contacto_id || null;

      if (contactoId) {
        const { error: contactoError } = await this.supabase
          .from("contactos")
          .update({
            nombre: merged.nombre || "Sin nombre",
            telefono: merged.telefono,
            email: merged.email,
            identificacion: merged.identificacion,
            direccion: merged.direccion
          })
          .eq("id", contactoId);

        if (contactoError) {
          logError("updateEmpleado(contactos update)", contactoError, { id, contactoId, merged });
          throw contactoError;
        }
      } else {
        let foundContactId = null;

        if (merged.email) {
          const { data: foundByEmail, error } = await this.supabase
            .from("contactos")
            .select("id")
            .eq("email", merged.email)
            .limit(1);

          if (!error && Array.isArray(foundByEmail) && foundByEmail[0]?.id) {
            foundContactId = foundByEmail[0].id;
          }
        }

        if (!foundContactId && merged.identificacion) {
          const { data: foundById, error } = await this.supabase
            .from("contactos")
            .select("id")
            .eq("identificacion", merged.identificacion)
            .limit(1);

          if (!error && Array.isArray(foundById) && foundById[0]?.id) {
            foundContactId = foundById[0].id;
          }
        }

        if (foundContactId) {
          contactoId = foundContactId;

          const { error: contactoError } = await this.supabase
            .from("contactos")
            .update({
              nombre: merged.nombre || "Sin nombre",
              telefono: merged.telefono,
              email: merged.email,
              identificacion: merged.identificacion,
              direccion: merged.direccion
            })
            .eq("id", contactoId);

          if (contactoError) {
            logError("updateEmpleado(contactos update after lookup)", contactoError, { id, contactoId, merged });
            throw contactoError;
          }
        } else if (
          merged.nombre ||
          merged.email ||
          merged.telefono ||
          merged.identificacion ||
          merged.direccion
        ) {
          const { data: nuevoContacto, error: contactoInsertError } = await this.supabase
            .from("contactos")
            .insert([{
              nombre: merged.nombre || "Sin nombre",
              telefono: merged.telefono,
              email: merged.email,
              identificacion: merged.identificacion,
              direccion: merged.direccion
            }])
            .select("id")
            .single();

          if (contactoInsertError) {
            logError("updateEmpleado(contactos insert)", contactoInsertError, { id, merged });
            throw contactoInsertError;
          }

          contactoId = nuevoContacto?.id || null;
        }
      }

      const resolvedSucursalId = await this.resolveSucursalId({
        empresaId: merged.empresa_id,
        preferredSucursalId: merged.sucursal_id
      });

      if (!resolvedSucursalId || !this.isUuid(resolvedSucursalId)) {
        const err = new Error("No se encontró una sucursal válida para actualizar el empleado.");
        logError("updateEmpleado(sucursal missing)", err, {
          id,
          data,
          currentView,
          resolvedSucursalId
        });
        throw err;
      }

      const usuarioPayload = {
        role: merged.role,
        sucursal_id: resolvedSucursalId,
        nacimiento: merged.nacimiento,
        identificacion_nombre: merged.identificacion_nombre,
        afp: merged.afp,
        isss: merged.isss,
        descripcion: merged.descripcion,
        salario_h: merged.salario_h,
        ayuda_economica: merged.ayuda_economica,
        bonificacion: merged.bonificacion,
        contacto_id: contactoId
      };

      const { error } = await this.supabase
        .from("usuarios")
        .update(usuarioPayload)
        .eq("id", id);

      if (error) {
        logError("updateEmpleado(usuarios)", error, { id, usuarioPayload, jornadas });
        throw error;
      }

      await this.setUserJornadas(id, jornadas);

      return true;
    }

    async deleteAuthUser(id) {
      if (!id) {
        const err = new Error("ID inválido para eliminar.");
        logError("deleteAuthUser(validación)", err, { id });
        throw err;
      }

      const result = await this.invokeEmployeeAdminFunction({
        action: "delete",
        userId: id
      });

      if (!result?.success) {
        const err = new Error("No se pudo eliminar el usuario.");
        logError("deleteAuthUser(resultado inválido)", err, { id, result });
        throw err;
      }

      return true;
    }

    async deleteEmpleado(id) {
      return await this.deleteAuthUser(id);
    }
  }

  global.EmpleadoModel = EmpleadoModel;
})(window);