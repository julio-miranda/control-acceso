// js/models/login.model.js
(function (window) {
    "use strict";

    const supabase = window.supabase;

    if (!supabase) {
        console.error("Supabase no está disponible en window.supabase. Revisa js/supabase-config.js");
        return;
    }

    function normalizeRole(role) {
        return (role || "").toString().trim().toLowerCase();
    }

    function validateEmail(email) {
        const value = (email || "").trim();
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(value);
    }

    function validatePassword(password) {
        return !!(password && password.trim());
    }

    async function getUsuarioByAuthId(authUserId) {
        const attempts = [
            { table: "v_usuarios", column: "id", select: "id, role, empresa_id" },
            { table: "v_usuarios", column: "usuarios_id", select: "usuarios_id, role, empresa_id" },
            { table: "usuarios", column: "id", select: "id, role, empresa_id" },
            { table: "usuarios", column: "usuarios_id", select: "usuarios_id, role, empresa_id" }
        ];

        for (const attempt of attempts) {
            const { data, error } = await supabase
                .from(attempt.table)
                .select(attempt.select)
                .eq(attempt.column, authUserId)
                .maybeSingle();

            if (!error && data) {
                return { data, error: null };
            }
        }

        return { data: null, error: new Error("Usuario no existe en la base de datos.") };
    }

    async function authenticate(email, password) {
        if (!validateEmail(email)) {
            return { ok: false, message: "Correo inválido." };
        }

        if (!validatePassword(password)) {
            return { ok: false, message: "Contraseña requerida." };
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password
        });

        if (error) {
            return {
                ok: false,
                message: error.message || "No se pudo iniciar sesión."
            };
        }

        const authUser = data?.user || null;

        if (!authUser) {
            return {
                ok: false,
                message: "No se pudo obtener el usuario autenticado."
            };
        }

        const { data: usuario, error: userError } = await getUsuarioByAuthId(authUser.id);

        if (userError || !usuario) {
            return {
                ok: false,
                message: "Usuario no existe en la base de datos."
            };
        }

        const role = normalizeRole(usuario.role);
        const userId = usuario.id ?? usuario.usuarios_id ?? authUser.id;

        return {
            ok: true,
            user: {
                id: userId,
                role,
                raw: usuario
            }
        };
    }

    function getRedirectByRole(role) {
        const r = normalizeRole(role);

        if (r === "admin" || r === "administrator") return "dashboard.html";
        if (r === "empleado" || r === "employee") return "employee.html";

        return "bloqueo.html";
    }

    window.LoginModel = {
        authenticate,
        getRedirectByRole,
        validateEmail,
        validatePassword
    };

})(window);