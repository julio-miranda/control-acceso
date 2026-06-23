// js/auth.js
(function (global) {
    function getSupabase() {
        if (!global.supabase) {
            throw new Error("Supabase no está inicializado.");
        }
        return global.supabase;
    }

    function logError(context, error, extra = {}) {
        console.log(`[AuthModel] ${context}`, {
            message: error?.message,
            error,
            ...extra
        });
    }

    async function fetchRoleFromTable(tableName, userId, idColumn) {
        const supabase = getSupabase();

        const { data, error } = await supabase
            .from(tableName)
            .select("role")
            .eq(idColumn, userId)
            .maybeSingle();

        if (error) {
            logError(`fetchRoleFromTable(${tableName}.${idColumn})`, error, { userId });
            return null;
        }

        return data?.role ? normalizeRole(data.role) : null;
    }

    function normalizeRole(role) {
        if (global.RolePolicy?.normalizeRole) return global.RolePolicy.normalizeRole(role);
        return String(role || "").trim().toLowerCase();
    }

    async function getUserRole(userId) {
        try {
            let role = await fetchRoleFromTable("v_usuarios", userId, "id");
            if (role) return role;

            role = await fetchRoleFromTable("v_usuarios", userId, "usuarios_id");
            if (role) return role;

            role = await fetchRoleFromTable("usuarios", userId, "id");
            if (role) return role;

            role = await fetchRoleFromTable("usuarios", userId, "usuarios_id");
            if (role) return role;

            const { data: sessionData, error: sessionError } = await getSupabase().auth.getSession();
            if (sessionError) {
                logError("getUserRole(getSession)", sessionError, { userId });
            }

            const session = sessionData?.session ?? null;
            const metaRole =
                session?.user?.app_metadata?.role ??
                session?.user?.user_metadata?.role ??
                null;

            return metaRole ? normalizeRole(metaRole) : null;
        } catch (err) {
            logError("getUserRole(catch)", err, { userId });
            return null;
        }
    }

    async function signInWithPassword(email, password) {
        const supabase = getSupabase();

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                logError("signInWithPassword", error, { email });
                return { data, error };
            }

            const user = data?.user ?? null;
            const session = data?.session ?? null;

            if (!user) {
                const err = new Error("No se pudo obtener el usuario autenticado.");
                logError("signInWithPassword(user faltante)", err, { email, data });
                return { data, error: err };
            }

            const role = await getUserRole(user.id);

            console.log("[AuthModel] Inicio de sesión exitoso", {
                userId: user.id,
                email: user.email,
                role,
                hasSession: !!session
            });

            return { data, error: null, role, redirected: false };
        } catch (err) {
            logError("signInWithPassword(catch)", err, { email });
            return { data: null, error: err };
        }
    }

    async function signOut(options = {}) {
        const redirect = options.redirect !== false;
        const supabase = getSupabase();

        console.log("[AuthModel] Iniciando cierre de sesión...");

        try {
            const { error } = await supabase.auth.signOut();

            if (error) {
                logError("signOut", error);
            } else {
                console.log("[AuthModel] Sesión cerrada en Supabase");
            }
        } catch (err) {
            logError("signOut(catch)", err);
        }

        try {
            localStorage.clear();
            sessionStorage.clear();
            console.log("[AuthModel] Storage limpiado");
        } catch (err) {
            logError("signOut(clearStorage)", err);
        }

        if (redirect) {
            console.log("[AuthModel] Redirigiendo a index.html");
            window.location.replace("index.html");
        }
    }

    async function getCurrentUser() {
        const supabase = getSupabase();

        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) {
                logError("getCurrentUser(getSession)", error);
                return { user: null, error };
            }

            const user = data?.session?.user ?? null;
            return { user, error: null };
        } catch (err) {
            logError("getCurrentUser(catch)", err);
            return { user: null, error: err };
        }
    }

    async function getSessionData() {
        const { user, error } = await getCurrentUser();
        if (error || !user) return null;

        return {
            uid: user.id,
            email: user.email ?? null,
            app_metadata: user.app_metadata ?? {},
            user_metadata: user.user_metadata ?? {}
        };
    }

    async function refreshSession() {
        const supabase = getSupabase();

        try {
            const { error } = await supabase.auth.getUser();
            if (error) {
                logError("refreshSession", error);
                console.log("No se pudo refrescar/verificar la sesión:", error);
            }
        } catch (err) {
            logError("refreshSession(catch)", err);
        }
    }

    async function checkUserSession(callback, options = {}) {
        const redirectOnFail = options.redirectOnFail !== false;
        const s = await getSessionData();

        if (s) {
            try {
                await callback(s.uid, s);
            } catch (e) {
                logError("checkUserSession(callback)", e, { session: s });
            }
        } else {
            console.log("Sesión inválida.");
            if (redirectOnFail) {
                await signOut();
            }
        }
    }

    function isSessionValid(s) {
        return !!(s && s.uid);
    }

    async function updatePassword(newPassword) {
        if (!newPassword) {
            const err = new Error("Password vacío");
            logError("updatePassword(validación)", err);
            throw err;
        }

        const supabase = getSupabase();

        try {
            const { data, error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) {
                logError("updatePassword", error);
            }

            return { data, error };
        } catch (err) {
            logError("updatePassword(catch)", err);
            throw err;
        }
    }

    async function getClaim(key, fallback = null) {
        try {
            const supabase = getSupabase();
            const { data } = await supabase.auth.getSession();
            const session = data?.session ?? null;
            return session?.user?.app_metadata?.[key] ?? session?.user?.user_metadata?.[key] ?? fallback;
        } catch (err) {
            logError("getClaim(catch)", err, { key });
            return fallback;
        }
    }

    global.AuthModel = {
        signInWithPassword,
        signOut,
        getCurrentUser,
        getSessionData,
        refreshSession,
        checkUserSession,
        isSessionValid,
        updatePassword,
        getClaim,
        getUserRole
    };

    global.signInWithPassword = signInWithPassword;
    global.logout = signOut;
    global.getSessionData = getSessionData;
    global.refreshSession = refreshSession;
    global.checkUserSession = checkUserSession;
    global.isSessionValid = isSessionValid;
    global.updatePassword = updatePassword;

})(window);