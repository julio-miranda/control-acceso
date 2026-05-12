// js/models/ClienteVip.model.js
(function (global) {
    "use strict";

    function logError(context, error, extra = {}) {
        console.log(`[ClienteVipModel] ${context}`, {
            message: error?.message,
            error,
            ...extra
        });
    }

    class ClienteVipModel {
        static UNICA_EMPRESA_ID = "UNICA EMPRESA";

        constructor(supabaseClient) {
            if (!supabaseClient) {
                throw new Error("Supabase no está inicializado.");
            }
            this.supabase = supabaseClient;
        }

        normalizeText(value) {
            const v = (value ?? "").toString().trim();
            return v.length ? v : null;
        }

        normalizeEmail(value) {
            const v = this.normalizeText(value);
            return v ? v.toLowerCase() : null;
        }

        async getEmpresaById(id) {
            const targetId = (id || ClienteVipModel.UNICA_EMPRESA_ID).toString().trim();
            if (!targetId) return null;

            const { data, error } = await this.supabase
                .from("empresa")
                .select("id,nombre")
                .eq("id", targetId)
                .maybeSingle();

            if (error) {
                logError("getEmpresaById", error, { id: targetId });
                throw error;
            }

            return data || null;
        }

        async getSucursalIdsByEmpresa(empresaId) {
            const targetEmpresaId = (empresaId || ClienteVipModel.UNICA_EMPRESA_ID).toString().trim();
            if (!targetEmpresaId) return [];

            const { data, error } = await this.supabase
                .from("sucursales")
                .select("id")
                .eq("empresa_id", targetEmpresaId);

            if (error) {
                logError("getSucursalIdsByEmpresa", error, { empresaId: targetEmpresaId });
                throw error;
            }

            return (Array.isArray(data) ? data : []).map((r) => r.id).filter(Boolean);
        }

        async getSucursales(empresaId = null) {
            let q = this.supabase
                .from("sucursales")
                .select("id,nombre,codigo,empresa_id")
                .order("nombre", { ascending: true });

            const targetEmpresaId = (empresaId || ClienteVipModel.UNICA_EMPRESA_ID).toString().trim();
            if (targetEmpresaId) {
                q = q.eq("empresa_id", targetEmpresaId);
            }

            const { data, error } = await q;
            if (error) {
                logError("getSucursales", error, { empresaId: targetEmpresaId });
                throw error;
            }

            return Array.isArray(data) ? data : [];
        }

        async getContactoById(contactoId) {
            if (!contactoId) return null;

            const { data, error } = await this.supabase
                .from("contactos")
                .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
                .eq("id", contactoId)
                .maybeSingle();

            if (error) {
                logError("getContactoById", error, { contactoId });
                throw error;
            }

            return data || null;
        }

        async buildClienteVipRow(cliente) {
            if (!cliente) return null;

            const contacto = cliente.contacto_id
                ? await this.getContactoById(cliente.contacto_id).catch((err) => {
                    logError("buildClienteVipRow(getContactoById)", err, { contactoId: cliente.contacto_id });
                    return null;
                })
                : null;

            return {
                ...cliente,
                nombre: contacto?.nombre || "Sin nombre",
                telefono: contacto?.telefono || null,
                email: contacto?.email || null,
                identificacion: contacto?.identificacion || null,
                direccion: contacto?.direccion || null
            };
        }

        async getClientesVip({ empresaId = null, sucursalId = null, onlyActive = false } = {}) {
            const targetEmpresaId = (empresaId || ClienteVipModel.UNICA_EMPRESA_ID).toString().trim();

            let q = this.supabase
                .from("v_clientes_vip")
                .select(`
      id,
      sucursal_id,
      contacto_id,
      notas,
      activo,
      fecha_alta,
      created_at,
      updated_at,
      nombre,
      telefono,
      email,
      identificacion,
      direccion,
      sucursal_nombre,
      sucursal_codigo,
      empresa_id,
      empresa_nombre
    `)
                .order("created_at", { ascending: false });

            if (onlyActive) {
                q = q.eq("activo", true);
            }

            if (sucursalId) {
                q = q.eq("sucursal_id", sucursalId);
            } else if (targetEmpresaId) {
                const ids = await this.getSucursalIdsByEmpresa(targetEmpresaId).catch((err) => {
                    logError("getClientesVip -> getSucursalIdsByEmpresa", err, { empresaId: targetEmpresaId });
                    return [];
                });

                if (ids.length > 0) {
                    q = q.in("sucursal_id", ids);
                }
            }

            const { data, error } = await q;

            if (error) {
                logError("getClientesVip", error, { empresaId: targetEmpresaId, sucursalId, onlyActive });
                throw error;
            }

            return Array.isArray(data) ? data : [];
        }

        async getClienteVipById(id) {
            const { data, error } = await this.supabase
                .from("v_clientes_vip")
                .select(`
      id,
      sucursal_id,
      contacto_id,
      notas,
      activo,
      fecha_alta,
      created_at,
      updated_at,
      nombre,
      telefono,
      email,
      identificacion,
      direccion,
      sucursal_nombre,
      sucursal_codigo,
      empresa_id,
      empresa_nombre
    `)
                .eq("id", id)
                .maybeSingle();

            if (error) {
                logError("getClienteVipById", error, { id });
                throw error;
            }

            return data || null;
        }

        async emailExists(email, excludeContactoId = null) {
            const targetEmail = this.normalizeEmail(email);
            if (!targetEmail) return false;

            let q = this.supabase
                .from("contactos")
                .select("id")
                .ilike("email", targetEmail)
                .limit(1);

            if (excludeContactoId) {
                q = q.neq("id", excludeContactoId);
            }

            const { data, error } = await q;
            if (error) {
                logError("emailExists", error, { email: targetEmail, excludeContactoId });
                throw error;
            }

            return Array.isArray(data) && data.length > 0;
        }

        async identificacionExists(identificacion, excludeContactoId = null) {
            const targetIdent = this.normalizeText(identificacion);
            if (!targetIdent) return false;

            let q = this.supabase
                .from("contactos")
                .select("id")
                .eq("identificacion", targetIdent)
                .limit(1);

            if (excludeContactoId) {
                q = q.neq("id", excludeContactoId);
            }

            const { data, error } = await q;
            if (error) {
                logError("identificacionExists", error, { identificacion: targetIdent, excludeContactoId });
                throw error;
            }

            return Array.isArray(data) && data.length > 0;
        }

        async createContactoFromData(data) {
            const nombre = this.normalizeText(data?.nombre);
            if (!nombre) {
                throw new Error("El nombre es obligatorio.");
            }

            const email = this.normalizeEmail(data?.email);
            const identificacion = this.normalizeText(data?.identificacion);

            if (email && await this.emailExists(email)) {
                throw new Error("Ya existe un contacto con este correo.");
            }

            if (identificacion && await this.identificacionExists(identificacion)) {
                throw new Error("Ya existe un contacto con esta identificación.");
            }

            const payload = {
                nombre,
                telefono: this.normalizeText(data?.telefono),
                email,
                identificacion,
                direccion: this.normalizeText(data?.direccion)
            };

            const { data: inserted, error } = await this.supabase
                .from("contactos")
                .insert([payload])
                .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
                .single();

            if (error) {
                logError("createContactoFromData", error, { payload });
                throw new Error(error.message || "No se pudo crear el contacto.");
            }

            return inserted;
        }

        async updateContacto(contactoId, data) {
            if (!contactoId) {
                return await this.createContactoFromData(data);
            }

            const nombre = this.normalizeText(data?.nombre);
            if (!nombre) {
                throw new Error("El nombre es obligatorio.");
            }

            const email = this.normalizeEmail(data?.email);
            const identificacion = this.normalizeText(data?.identificacion);

            if (email && await this.emailExists(email, contactoId)) {
                throw new Error("Ya existe otro contacto con este correo.");
            }

            if (identificacion && await this.identificacionExists(identificacion, contactoId)) {
                throw new Error("Ya existe otro contacto con esta identificación.");
            }

            const payload = {
                nombre,
                telefono: this.normalizeText(data?.telefono),
                email,
                identificacion,
                direccion: this.normalizeText(data?.direccion)
            };

            const { data: updated, error } = await this.supabase
                .from("contactos")
                .update(payload)
                .eq("id", contactoId)
                .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
                .single();

            if (error) {
                logError("updateContacto", error, { contactoId, payload });
                throw new Error(error.message || "No se pudo actualizar el contacto.");
            }

            return updated;
        }

        async createClienteVip(data) {
            const contacto = await this.createContactoFromData(data);

            const payload = {
                sucursal_id: data?.sucursal_id || null,
                contacto_id: contacto.id,
                notas: this.normalizeText(data?.notas),
                activo: typeof data?.activo === "boolean" ? data.activo : true,
                fecha_alta: data?.fecha_alta || null
            };

            const { data: inserted, error } = await this.supabase
                .from("clientes_vip")
                .insert([payload])
                .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
                .single();

            if (error) {
                logError("createClienteVip", error, { payload });
                throw new Error(error.message || "No se pudo crear el cliente VIP.");
            }

            return await this.buildClienteVipRow(inserted);
        }

        async updateClienteVip(id, data) {
            if (!id) {
                throw new Error("ID inválido.");
            }

            const existing = await this.getClienteVipById(id);
            if (!existing) {
                throw new Error("No se encontró el cliente VIP.");
            }

            const contactoId = existing.contacto_id || null;
            const updatedContacto = await this.updateContacto(contactoId, data);

            const payload = {
                sucursal_id: data?.sucursal_id || existing.sucursal_id || null,
                contacto_id: updatedContacto.id,
                notas: this.normalizeText(data?.notas),
                activo: typeof data?.activo === "boolean" ? data.activo : existing.activo !== false,
                fecha_alta: data?.fecha_alta || existing.fecha_alta || null
            };

            const { data: updated, error } = await this.supabase
                .from("clientes_vip")
                .update(payload)
                .eq("id", id)
                .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
                .single();

            if (error) {
                logError("updateClienteVip", error, { id, payload });
                throw new Error(error.message || "No se pudo actualizar el cliente VIP.");
            }

            return await this.buildClienteVipRow(updated);
        }

        async setActivo(id, activo) {
            if (!id) {
                throw new Error("ID inválido.");
            }

            const { data, error } = await this.supabase
                .from("clientes_vip")
                .update({ activo: !!activo })
                .eq("id", id)
                .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
                .single();

            if (error) {
                logError("setActivo", error, { id, activo });
                throw new Error(error.message || "No se pudo cambiar el estado.");
            }

            return await this.buildClienteVipRow(data);
        }

        async inactivarClienteVip(id) {
            return await this.setActivo(id, false);
        }

        async activarClienteVip(id) {
            return await this.setActivo(id, true);
        }

        async deleteClienteVip(id) {
            if (!id) {
                throw new Error("ID inválido.");
            }

            const cliente = await this.getClienteVipById(id);

            const { data, error } = await this.supabase
                .from("clientes_vip")
                .delete()
                .eq("id", id)
                .select("id,sucursal_id,notas,activo,fecha_alta,created_at,updated_at,contacto_id")
                .single();

            if (error) {
                logError("deleteClienteVip", error, { id });
                throw new Error(
                    error.message || "No se pudo eliminar el cliente VIP. Puede estar referenciado en ventas o reservaciones."
                );
            }

            return cliente || data || null;
        }
    }

    global.ClienteVipModel = ClienteVipModel;
})(window);