// js/models/register.model.js
(function (window) {
  "use strict";

  const supabase = window.supabase;

  const UNICA_EMPRESA_ID = "UNICA EMPRESA";
  const UNICA_EMPRESA_NOMBRE = "Vértigo";

  if (!supabase) {
    console.error("Supabase no está disponible en window.supabase. Revisa js/supabase-config.js");
    return;
  }

  async function obtenerOCrearContacto({
    nombre = null,
    telefono = null,
    email = null,
    identificacion = null,
    direccion = null
  }) {
    const nombreLimpio = (nombre || "").trim() || null;
    const telefonoLimpio = (telefono || "").trim() || null;
    const emailLimpio = (email || "").trim() || null;
    const identificacionLimpia = (identificacion || "").trim() || null;
    const direccionLimpia = (direccion || "").trim() || null;

    let query = supabase.from("contactos").select("id");

    if (emailLimpio) {
      query = query.eq("email", emailLimpio);
    } else if (identificacionLimpia) {
      query = query.eq("identificacion", identificacionLimpia);
    } else {
      query = null;
    }

    if (query) {
      const { data: existente, error: errorBusqueda } = await query.maybeSingle();
      if (errorBusqueda) throw errorBusqueda;
      if (existente?.id) return existente.id;
    }

    const { data: nuevoContacto, error: errorInsertContacto } = await supabase
      .from("contactos")
      .insert([{
        nombre: nombreLimpio || "Sin nombre",
        telefono: telefonoLimpio,
        email: emailLimpio,
        identificacion: identificacionLimpia,
        direccion: direccionLimpia
      }])
      .select("id")
      .single();

    if (errorInsertContacto) throw errorInsertContacto;

    return nuevoContacto.id;
  }

  const RegisterModel = {
    async cargarEmpresas() {
      return [{ id: UNICA_EMPRESA_ID, nombre: UNICA_EMPRESA_NOMBRE }];
    },

    async cargarSucursalesPorEmpresa(empresaId = UNICA_EMPRESA_ID) {
      const { data, error } = await supabase
        .from("sucursales")
        .select("id, nombre, codigo")
        .eq("empresa_id", empresaId)
        .order("codigo", { ascending: true });

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    },

    async registrarUsuario(usuario) {
      const contactoId = await obtenerOCrearContacto({
        nombre: usuario.nombre,
        telefono: usuario.telefono,
        email: usuario.email,
        identificacion: usuario.identificacion,
        direccion: usuario.direccion
      });

      const usuarioPayload = {
        id: usuario.id,
        nacimiento: usuario.nacimiento || null,
        identificacion_nombre: usuario.identificacion_nombre || null,
        afp: usuario.afp || null,
        isss: usuario.isss || null,
        descripcion: usuario.descripcion || null,
        salario_h: usuario.salario_h ?? 0,
        role: usuario.role || "empleado",
        sucursal_id: usuario.sucursal_id,
        contacto_id: contactoId
      };

      const { data, error } = await supabase
        .from("usuarios")
        .insert([usuarioPayload])
        .select("id")
        .single();

      if (error) throw error;
      return data;
    }
  };

  window.RegisterModel = RegisterModel;

})(window);