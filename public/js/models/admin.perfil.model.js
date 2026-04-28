// js/models/perfil.model.js
(function (global) {
    function getSupabase() {
        if (!global.supabase) {
            throw new Error("Supabase no está inicializado.");
        }
        return global.supabase;
    }

    function logError(context, error, extra = {}) {
        console.log(`[PerfilModel] ${context}`, {
            message: error?.message,
            error,
            ...extra
        });
    }

    function toText(value, fallback = "") {
        if (value === null || value === undefined) return fallback;
        return String(value);
    }

    function cleanText(value) {
        const text = toText(value, "").trim();
        return text.length ? text : null;
    }

    async function getAuthUser() {
        const supabase = getSupabase();

        try {
            const { data, error } = await supabase.auth.getUser();
            if (error) logError("getAuthUser", error);
            return data?.user || null;
        } catch (err) {
            logError("getAuthUser(catch)", err);
            return null;
        }
    }

    function buildFallbackPerfil(uid, authUser = null) {
        return {
            id: uid || authUser?.id || null,
            nombre:
                authUser?.user_metadata?.nombre ||
                authUser?.app_metadata?.nombre ||
                authUser?.email ||
                "Usuario",
            email: authUser?.email || null,
            telefono: null,
            identificacion: null,
            direccion: null,
            identificacion_nombre:
                authUser?.user_metadata?.identificacion_nombre ||
                authUser?.app_metadata?.identificacion_nombre ||
                "",
            nacimiento: authUser?.user_metadata?.nacimiento || null,
            afp: authUser?.user_metadata?.afp || null,
            isss: authUser?.user_metadata?.isss || null,
            descripcion: authUser?.user_metadata?.descripcion || "",
            salario_h: Number(authUser?.user_metadata?.salario_h || authUser?.app_metadata?.salario_h || 0),
            role: String(
                authUser?.app_metadata?.role ||
                authUser?.user_metadata?.role ||
                "empleado"
            ).toLowerCase(),
            sucursal_id:
                authUser?.app_metadata?.sucursal_id ||
                authUser?.user_metadata?.sucursal_id ||
                null,
            sucursal_nombre: null,
            empresa_id:
                authUser?.app_metadata?.empresa_id ||
                authUser?.user_metadata?.empresa_id ||
                null,
            empresa_nombre:
                authUser?.app_metadata?.empresa_nombre ||
                authUser?.user_metadata?.empresa_nombre ||
                null,
            contacto_id: null,
            incomplete_profile: true
        };
    }

    function normalizePerfil({
        uid,
        userRow = null,
        contacto = null,
        sucursal = null,
        empresa = null,
        authUser = null
    }) {
        return {
            id: userRow?.id || uid || authUser?.id || null,
            nombre:
                contacto?.nombre ||
                authUser?.user_metadata?.nombre ||
                authUser?.app_metadata?.nombre ||
                authUser?.email ||
                "Usuario",
            email:
                contacto?.email ||
                authUser?.email ||
                null,
            telefono: contacto?.telefono || null,
            identificacion: contacto?.identificacion || null,
            direccion: contacto?.direccion || null,
            identificacion_nombre:
                userRow?.identificacion_nombre ||
                authUser?.user_metadata?.identificacion_nombre ||
                authUser?.app_metadata?.identificacion_nombre ||
                "",
            nacimiento: userRow?.nacimiento || null,
            afp: userRow?.afp || null,
            isss: userRow?.isss || null,
            descripcion: userRow?.descripcion || "",
            salario_h: Number(userRow?.salario_h || 0),
            role: String(
                userRow?.role ||
                authUser?.app_metadata?.role ||
                authUser?.user_metadata?.role ||
                "empleado"
            ).toLowerCase(),
            sucursal_id: userRow?.sucursal_id || sucursal?.id || authUser?.app_metadata?.sucursal_id || authUser?.user_metadata?.sucursal_id || null,
            sucursal_nombre: sucursal?.nombre || null,
            empresa_id: sucursal?.empresa_id || authUser?.app_metadata?.empresa_id || authUser?.user_metadata?.empresa_id || null,
            empresa_nombre: empresa?.nombre || authUser?.app_metadata?.empresa_nombre || authUser?.user_metadata?.empresa_nombre || null,
            contacto_id: userRow?.contacto_id || null,
            incomplete_profile: false
        };
    }

    async function getPerfil(uid) {
        const supabase = getSupabase();

        try {
            const authUser = await getAuthUser();

            const { data: userRow, error: userError } = await supabase
                .from("usuarios")
                .select("id,role,sucursal_id,contacto_id,nacimiento,identificacion_nombre,afp,isss,descripcion,salario_h,created_at,updated_at")
                .eq("id", uid)
                .maybeSingle();

            if (userError) {
                logError("getPerfil(usuarios)", userError, { uid });
            }

            if (!userRow) {
                return {
                    data: buildFallbackPerfil(uid, authUser),
                    error: null
                };
            }

            const contactoId = userRow.contacto_id || null;
            const sucursalId = userRow.sucursal_id || null;

            const [contactoRes, sucursalRes] = await Promise.all([
                contactoId
                    ? supabase
                        .from("contactos")
                        .select("id,nombre,telefono,email,identificacion,direccion,created_at,updated_at")
                        .eq("id", contactoId)
                        .maybeSingle()
                    : Promise.resolve({ data: null, error: null }),

                sucursalId
                    ? supabase
                        .from("sucursales")
                        .select("id,nombre,codigo,lat,lng,created_at,empresa_id")
                        .eq("id", sucursalId)
                        .maybeSingle()
                    : Promise.resolve({ data: null, error: null })
            ]);

            if (contactoRes.error) {
                logError("getPerfil(contactos)", contactoRes.error, { uid, contactoId });
            }

            if (sucursalRes.error) {
                logError("getPerfil(sucursales)", sucursalRes.error, { uid, sucursalId });
            }

            let empresa = null;
            if (sucursalRes.data?.empresa_id) {
                const { data: empData, error: empError } = await supabase
                    .from("empresa")
                    .select("id,nombre")
                    .eq("id", sucursalRes.data.empresa_id)
                    .maybeSingle();

                if (empError) {
                    logError("getPerfil(empresa)", empError, {
                        uid,
                        empresa_id: sucursalRes.data.empresa_id
                    });
                } else {
                    empresa = empData || null;
                }
            }

            return {
                data: normalizePerfil({
                    uid,
                    userRow,
                    contacto: contactoRes.data || null,
                    sucursal: sucursalRes.data || null,
                    empresa,
                    authUser
                }),
                error: null
            };
        } catch (err) {
            logError("getPerfil(catch)", err, { uid });

            const authUser = await getAuthUser().catch(() => null);
            return {
                data: buildFallbackPerfil(uid, authUser),
                error: err
            };
        }
    }

    async function getNombreEmpresa(empresaId) {
        if (!empresaId) return { data: null, error: null };

        const supabase = getSupabase();

        try {
            const { data, error } = await supabase
                .from("empresa")
                .select("id,nombre")
                .eq("id", empresaId)
                .maybeSingle();

            if (error) {
                logError("getNombreEmpresa", error, { empresaId });
            }

            return { data: data || null, error: error || null };
        } catch (err) {
            logError("getNombreEmpresa(catch)", err, { empresaId });
            return { data: null, error: err };
        }
    }

    async function actualizarPerfil(uid, payload) {
        const supabase = getSupabase();

        try {
            const { data: userRow, error: userError } = await supabase
                .from("usuarios")
                .select("id,contacto_id,sucursal_id,role")
                .eq("id", uid)
                .maybeSingle();

            if (userError) {
                logError("actualizarPerfil(usuarios-select)", userError, { uid });
                return { data: null, error: userError };
            }

            if (!userRow) {
                const err = new Error("No se encontró el registro del usuario en la tabla usuarios.");
                logError("actualizarPerfil(usuario-no-encontrado)", err, { uid });
                return { data: null, error: err };
            }

            const nombre = cleanText(payload?.nombre);
            const email = cleanText(payload?.email);
            const telefono = cleanText(payload?.telefono);
            const identificacion = cleanText(payload?.identificacion);
            const direccion = cleanText(payload?.direccion);

            const identificacionNombre = cleanText(payload?.identificacion_nombre);
            const nacimiento = payload?.nacimiento || null;
            const descripcion = cleanText(payload?.descripcion);
            const salarioH = Number(payload?.salario_h ?? 0);

            const contactoPayload = {};
            if (nombre !== null) contactoPayload.nombre = nombre;
            if (email !== null) contactoPayload.email = email;
            if (telefono !== null) contactoPayload.telefono = telefono;
            if (identificacion !== null) contactoPayload.identificacion = identificacion;
            if (direccion !== null) contactoPayload.direccion = direccion;

            const usuarioPayload = {};
            if (identificacionNombre !== null) usuarioPayload.identificacion_nombre = identificacionNombre;
            usuarioPayload.nacimiento = nacimiento || null;
            usuarioPayload.descripcion = descripcion || null;
            usuarioPayload.salario_h = Number.isFinite(salarioH) ? salarioH : 0;

            let contactoId = userRow.contacto_id || null;

            if (Object.keys(contactoPayload).length > 0) {
                if (contactoId) {
                    const { error: updateContactoError } = await supabase
                        .from("contactos")
                        .update(contactoPayload)
                        .eq("id", contactoId);

                    if (updateContactoError) {
                        logError("actualizarPerfil(contactos-update)", updateContactoError, {
                            uid,
                            contactoId,
                            contactoPayload
                        });
                        return { data: null, error: updateContactoError };
                    }
                } else {
                    const insertPayload = {
                        nombre: contactoPayload.nombre || nombre || email || "Usuario"
                    };

                    if (contactoPayload.email !== undefined) insertPayload.email = contactoPayload.email;
                    if (contactoPayload.telefono !== undefined) insertPayload.telefono = contactoPayload.telefono;
                    if (contactoPayload.identificacion !== undefined) insertPayload.identificacion = contactoPayload.identificacion;
                    if (contactoPayload.direccion !== undefined) insertPayload.direccion = contactoPayload.direccion;

                    const { data: nuevoContacto, error: insertContactoError } = await supabase
                        .from("contactos")
                        .insert(insertPayload)
                        .select("id")
                        .maybeSingle();

                    if (insertContactoError) {
                        logError("actualizarPerfil(contactos-insert)", insertContactoError, {
                            uid,
                            insertPayload
                        });
                        return { data: null, error: insertContactoError };
                    }

                    contactoId = nuevoContacto?.id || null;
                    if (!contactoId) {
                        const err = new Error("No se pudo crear el contacto asociado.");
                        logError("actualizarPerfil(contactos-sin-id)", err, { uid });
                        return { data: null, error: err };
                    }

                    const { error: updateUsuarioContactoError } = await supabase
                        .from("usuarios")
                        .update({ contacto_id: contactoId })
                        .eq("id", uid);

                    if (updateUsuarioContactoError) {
                        logError("actualizarPerfil(usuario-contacto-update)", updateUsuarioContactoError, {
                            uid,
                            contactoId
                        });
                        return { data: null, error: updateUsuarioContactoError };
                    }
                }
            }

            const { error: updateUsuarioError } = await supabase
                .from("usuarios")
                .update(usuarioPayload)
                .eq("id", uid);

            if (updateUsuarioError) {
                logError("actualizarPerfil(usuarios-update)", updateUsuarioError, {
                    uid,
                    usuarioPayload
                });
                return { data: null, error: updateUsuarioError };
            }

            const refreshed = await getPerfil(uid);
            return {
                data: refreshed.data,
                error: refreshed.error
            };
        } catch (err) {
            logError("actualizarPerfil(catch)", err, { uid, payload });
            return { data: null, error: err };
        }
    }

    global.PerfilModel = {
        getPerfil,
        getNombreEmpresa,
        actualizarPerfil
    };
})(window);