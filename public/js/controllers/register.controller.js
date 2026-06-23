// js/controllers/register.controller.js
(function (window, document) {
  "use strict";

  const supabase = window.supabase;
  const RegisterModel = window.RegisterModel;

  const UNICA_EMPRESA_ID = "UNICA EMPRESA";
  const UNICA_EMPRESA_NOMBRE = "Vértigo";

  if (!supabase) {
    console.error("Supabase no está disponible en window.supabase. Revisa js/supabase-config.js");
    return;
  }

  if (!RegisterModel) {
    console.error("RegisterModel no está disponible. Revisa js/models/register.model.js");
    return;
  }

  const empresaSelect = document.getElementById("register-empresa-select");
  const sucursalSelect = document.getElementById("register-sucursal-select");
  const sucursalStatus = document.getElementById("sucursal-status");
  const registerForm = document.getElementById("register-form");
  const submitButton = registerForm ? registerForm.querySelector('button[type="submit"]') : null;

  function setSucursalStatus(message, isError = false) {
    if (!sucursalStatus) return;
    sucursalStatus.textContent = message || "";
    sucursalStatus.style.color = isError ? "#b00020" : "#444";
  }

  function resetSucursalSelect() {
    if (!sucursalSelect) return;

    sucursalSelect.innerHTML = "";

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.selected = true;
    optDefault.textContent = "Selecciona una sucursal";
    sucursalSelect.appendChild(optDefault);
  }

  function renderEmpresas(empresas) {
    if (!empresaSelect) return;

    empresaSelect.innerHTML = "";

    const list = Array.isArray(empresas) && empresas.length > 0
      ? empresas
      : [{ id: UNICA_EMPRESA_ID, nombre: UNICA_EMPRESA_NOMBRE }];

    list.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = String(row.id);
      opt.textContent = row.nombre || UNICA_EMPRESA_NOMBRE;
      empresaSelect.appendChild(opt);
    });

    empresaSelect.value = UNICA_EMPRESA_ID;
    empresaSelect.disabled = true;
  }

  function renderSucursales(sucursales) {
    if (!sucursalSelect) return;

    resetSucursalSelect();

    const list = Array.isArray(sucursales) ? sucursales : [];

    list.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = String(row.id);

      const labelParts = [];
      if (row.codigo) labelParts.push(String(row.codigo));
      if (row.nombre) labelParts.push(String(row.nombre));

      opt.textContent = labelParts.length ? labelParts.join(" - ") : String(row.id);
      sucursalSelect.appendChild(opt);
    });

    sucursalSelect.disabled = list.length === 0;
    sucursalSelect.required = true;

    if (list.length > 0) {
      setSucursalStatus("Selecciona una sucursal válida.");
    } else {
      setSucursalStatus("No se encontraron sucursales disponibles.", true);
    }
  }

  async function cargarEmpresas() {
    try {
      const empresas = await RegisterModel.cargarEmpresas();
      renderEmpresas(empresas);
    } catch (err) {
      console.error("Error cargando empresas:", err);
      renderEmpresas([]);
    }
  }

  async function cargarSucursalesEmpresaUnica() {
    try {
      setSucursalStatus("Cargando sucursales...");
      if (sucursalSelect) {
        sucursalSelect.disabled = true;
        resetSucursalSelect();
      }

      const sucursales = await RegisterModel.cargarSucursalesPorEmpresa(UNICA_EMPRESA_ID);
      renderSucursales(sucursales);
    } catch (err) {
      console.error("Error cargando sucursales:", err);
      renderSucursales([]);
      setSucursalStatus("No se pudieron cargar las sucursales. Revisa permisos sobre public.sucursales.", true);
    }
  }

  if (!registerForm) {
    console.error("Formulario de registro 'register-form' no encontrado.");
    return;
  }

  if (empresaSelect) {
    empresaSelect.value = UNICA_EMPRESA_ID;
    empresaSelect.disabled = true;
  }

  cargarEmpresas().then(() => cargarSucursalesEmpresaUnica());

  registerForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    if (submitButton) submitButton.disabled = true;

    try {
      const nombre = (document.getElementById("register-nombre")?.value || "").trim();
      const numero = (document.getElementById("register-numero")?.value || "").trim();
      const identificacionNombre = (document.getElementById("register-identificacionNombre")?.value || "").trim();
      const fecha = (document.getElementById("register-Fecha")?.value || "").trim();
      const isss = (document.getElementById("register-isss")?.value || "").trim();
      const afp = (document.getElementById("register-afp")?.value || "").trim();
      const direccion = (document.getElementById("register-direccion")?.value || "").trim();
      const telefono = (document.getElementById("register-telefono")?.value || "").trim();
      const email = (document.getElementById("register-email")?.value || "").trim();
      const pass = (document.getElementById("register-password")?.value || "").trim();
      const pass2 = (document.getElementById("register-password2")?.value || "").trim();

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        alert("Correo inválido.");
        return;
      }

      if (!pass || pass !== pass2) {
        alert("Las contraseñas no coinciden o están vacías.");
        return;
      }

      if (!sucursalSelect) {
        alert("Error en el formulario: elemento sucursal no encontrado.");
        return;
      }

      const sucursalId = (sucursalSelect.value || "").trim();
      if (!sucursalId) {
        alert("Selecciona una sucursal válida.");
        return;
      }

      const role = window.RolePolicy?.ROLES?.PENDIENTE || "pendiente";

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: {
            nombre,
            identificacion: numero || null,
            identificacion_nombre: identificacionNombre || null,
            nacimiento: fecha || null,
            role,
            sucursal_id: sucursalId,
            empresa_id: UNICA_EMPRESA_ID
          }
        }
      });

      if (signUpError) {
        console.error("Error al crear usuario en Auth:", signUpError);
        alert("No se pudo crear la cuenta: " + (signUpError.message || "Error desconocido"));
        return;
      }

      const authUser = signUpData?.user || null;
      if (!authUser) {
        alert("La cuenta fue creada, pero no se pudo obtener el usuario autenticado.");
        return;
      }

      await RegisterModel.registrarUsuario({
        id: authUser.id,
        nombre,
        identificacion: numero || null,
        identificacion_nombre: identificacionNombre || null,
        nacimiento: fecha || null,
        email,
        direccion: direccion || null,
        telefono: telefono || null,
        isss: isss || null,
        afp: afp || null,
        descripcion: "Sin descripción",
        salario_h: 1.25,
        role,
        sucursal_id: sucursalId
      });

      alert("Registro exitoso. Ya puedes iniciar sesión.");
      window.location.href = "index.html";
    } catch (err) {
      console.error("Error al registrar:", err);
      alert("Error: " + (err.message || JSON.stringify(err)));
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

})(window, document);
