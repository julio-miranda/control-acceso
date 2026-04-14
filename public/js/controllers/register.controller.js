// js/controllers/register.controller.js
(function (window, document) {
  "use strict";

  const supabase = window.supabase;
  const RegisterModel = window.RegisterModel;

  const UNICA_EMPRESA_ID = "UNICA_EMPRESA";
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
  const contSucursal = document.getElementById("sucursal-select-container");
  const contManualSuc = document.getElementById("manual-sucursal-container");
  const inputManualSuc = document.getElementById("register-sucursal-manual");
  const contManualEmpresa = document.getElementById("manual-empresa-container");
  const inputManualEmpresa = document.getElementById("register-empresa-manual");
  const registerForm = document.getElementById("register-form");
  const submitButton = registerForm ? registerForm.querySelector('button[type="submit"]') : null;

  function resetSucursalSelect() {
    if (!sucursalSelect) return;

    sucursalSelect.innerHTML = "";

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.selected = true;
    optDefault.textContent = "Selecciona una sucursal";
    sucursalSelect.appendChild(optDefault);

    const optOtro = document.createElement("option");
    optOtro.value = "otro";
    optOtro.textContent = "Otro";
    sucursalSelect.appendChild(optOtro);
  }

  function renderEmpresas(empresas) {
    if (!empresaSelect) return;

    empresaSelect.innerHTML = "";

    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.selected = true;
    optDefault.textContent = "Selecciona una empresa";
    empresaSelect.appendChild(optDefault);

    const list = Array.isArray(empresas) && empresas.length > 0
      ? empresas
      : [{ id: UNICA_EMPRESA_ID, nombre: UNICA_EMPRESA_NOMBRE }];

    list.forEach((row) => {
      const opt = document.createElement("option");
      opt.value = row.id;
      opt.textContent = row.nombre || UNICA_EMPRESA_NOMBRE;
      empresaSelect.appendChild(opt);
    });

    empresaSelect.value = UNICA_EMPRESA_ID;
    empresaSelect.disabled = true;

    if (contManualEmpresa) contManualEmpresa.style.display = "none";
    if (inputManualEmpresa) inputManualEmpresa.required = false;
  }

  function renderSucursales(sucursales) {
    resetSucursalSelect();

    if (!sucursalSelect) return;

    const otroOpt = sucursalSelect.querySelector('option[value="otro"]');

    (Array.isArray(sucursales) ? sucursales : []).forEach((row) => {
      const opt = document.createElement("option");
      opt.value = String(row.id);

      const labelParts = [];
      if (row.codigo) labelParts.push(String(row.codigo));
      if (row.nombre) labelParts.push(String(row.nombre));

      opt.textContent = labelParts.length ? labelParts.join(" - ") : String(row.id);

      if (otroOpt) {
        sucursalSelect.insertBefore(opt, otroOpt);
      } else {
        sucursalSelect.appendChild(opt);
      }
    });

    if (contSucursal) contSucursal.style.display = "block";
    if (sucursalSelect) {
      sucursalSelect.disabled = false;
      sucursalSelect.required = true;
    }

    if (contManualSuc) contManualSuc.style.display = "none";
    if (inputManualSuc) inputManualSuc.required = false;
  }

  function mostrarManualSucursal(mostrar) {
    if (contManualSuc) contManualSuc.style.display = mostrar ? "block" : "none";
    if (inputManualSuc) inputManualSuc.required = mostrar;
  }

  function habilitarSucursalSelect(habilitar) {
    if (!sucursalSelect) return;
    sucursalSelect.disabled = !habilitar;
    sucursalSelect.required = habilitar;
    if (!habilitar) resetSucursalSelect();
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
      const sucursales = await RegisterModel.cargarSucursalesPorEmpresa(UNICA_EMPRESA_ID);

      if (!sucursales.length) {
        if (contSucursal) contSucursal.style.display = "none";
        habilitarSucursalSelect(false);
        mostrarManualSucursal(true);
      } else {
        renderSucursales(sucursales);
      }
    } catch (err) {
      console.error("Error cargando sucursales:", err);
      if (contSucursal) contSucursal.style.display = "none";
      habilitarSucursalSelect(false);
      mostrarManualSucursal(true);
    }
  }

  if (empresaSelect) {
    empresaSelect.addEventListener("change", async function () {
      this.value = UNICA_EMPRESA_ID;
      await cargarSucursalesEmpresaUnica();
    });
  }

  if (sucursalSelect) {
    sucursalSelect.addEventListener("change", function () {
      mostrarManualSucursal(this.value === "otro");
    });
  }

  if (!registerForm) {
    console.error("Formulario de registro 'register-form' no encontrado.");
    return;
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

      let sucursalId = null;

      if (!sucursalSelect) {
        alert("Error en el formulario: elemento sucursal no encontrado.");
        return;
      }

      if (sucursalSelect.value === "otro") {
        const manualSuc = (inputManualSuc?.value || "").trim();
        if (!manualSuc) {
          alert("Ingresa el número/nombre de sucursal (campo requerido).");
          return;
        }
        sucursalId = await RegisterModel.crearSucursal(UNICA_EMPRESA_ID, manualSuc);
      } else {
        sucursalId = (sucursalSelect.value || "").trim();
        if (!sucursalId) {
          alert("Selecciona una sucursal válida.");
          return;
        }
      }

      const role = "empleado";

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
            sucursal_id: sucursalId
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

      if (typeof RegisterModel.registrarUsuario === "function") {
        const payload = {
          id: authUser.id,
          nombre,
          identificacion: numero || null,
          identificacion_nombre: identificacionNombre || null,
          nacimiento: fecha || null,
          email,
          descripcion: "Sin descripción",
          salario_h: 1.25,
          role,
          sucursal_id: sucursalId,
          direccion: direccion || null,
          telefono: telefono || null,
          isss: isss || null,
          afp: afp || null
        };

        await RegisterModel.registrarUsuario(payload);
      }

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