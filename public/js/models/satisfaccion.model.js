// js/models/satisfaccion.model.js
(function (global) {
    function getSupabase() {
        if (!global.supabase) {
            throw new Error("Supabase no está inicializado.");
        }
        return global.supabase;
    }

    async function guardarEncuesta(payload) {
        const supabase = getSupabase();
        return await supabase
            .from("satisfaccion_encuestas")
            .insert([payload])
            .select("*")
            .maybeSingle();
    }

    async function obtenerEncuestas(fechaInicio = null, fechaFin = null) {
        const supabase = getSupabase();
        let query = supabase
            .from("satisfaccion_encuestas")
            .select("*")
            .order("created_at", { ascending: false });

        if (fechaInicio) {
            query = query.gte("created_at", `${fechaInicio}T00:00:00`);
        }

        if (fechaFin) {
            query = query.lte("created_at", `${fechaFin}T23:59:59`);
        }

        return await query;
    }

    global.SatisfaccionModel = {
        guardarEncuesta,
        obtenerEncuestas
    };
})(window);