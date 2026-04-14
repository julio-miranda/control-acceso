// js/models/register.model.js
(function (window) {
  "use strict";

  const supabase = window.supabase;

  const UNICA_EMPRESA_ID = "UNICA_EMPRESA";
  const UNICA_EMPRESA_NOMBRE = "Vértigo";

  if (!supabase) {
    console.error("Supabase no está disponible en window.supabase. Revisa js/supabase-config.js");
    return;
  }

  const RegisterModel = {
    async cargarEmpresas() {
      try {
        const { data, error } = await supabase
          .from("empresa")
          .select("id, nombre")
          .eq("id", UNICA_EMPRESA_ID)
          .limit(1);

        if (error) throw error;

        if (Array.isArray(data) && data.length > 0) {
          return data;
        }

        return [{ id: UNICA_EMPRESA_ID, nombre: UNICA_EMPRESA_NOMBRE }];
      } catch (err) {
        console.error("Error en cargarEmpresas:", err);
        return [{ id: UNICA_EMPRESA_ID, nombre: UNICA_EMPRESA_NOMBRE }];
      }
    },

    async cargarSucursalesPorEmpresa(empresaId) {
      const { data, error } = await supabase
        .from("sucursales")
        .select("id, nombre, codigo")
        .eq("empresa_id", empresaId)
        .order("codigo", { ascending: true });

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },

    async crearSucursal(empresaId, codigoOrName) {
      const payload = {
        empresa_id: empresaId,
        codigo: codigoOrName,
        nombre: codigoOrName
      };

      const { data, error } = await supabase
        .from("sucursales")
        .insert([payload])
        .select("id")
        .single();

      if (error) throw error;
      return data.id;
    },

    async registrarUsuario(usuario) {
      const { data, error } = await supabase
        .from("usuarios")
        .insert([usuario])
        .select("id")
        .single();

      if (error) throw error;
      return data;
    }
  };

  window.RegisterModel = RegisterModel;

})(window);