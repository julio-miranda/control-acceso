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

    async function authenticate(email, password) {
        if (!validateEmail(email)) {
            return { ok: false, message: "Correo inválido." };
        }

        if (!validatePassword(password)) {
            return { ok: false, message: "Contraseña requerida." };
        }

        // 1. Login con Supabase Auth
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

        // 2. 🔥 TRAER USUARIO REAL DE TU TABLA
        const { data: usuario, error: userError } = await supabase
            .from("v_usuarios")
            .select("id, role, empresa_id")
            .eq("id", authUser.id)
            .single();

        if (userError || !usuario) {
            return {
                ok: false,
                message: "Usuario no existe en la base de datos."
            };
        }

        const role = normalizeRole(usuario.role);

        return {
            ok: true,
            user: {
                id: usuario.id,
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