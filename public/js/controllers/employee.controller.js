// js/controllers/employee.controller.js
(function (global) {
  const allowedRadius = 50;
  const HTML5_QRCODE_CDN =
    "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";

  let html5QrcodeScanner = null;
  let scanProcesado = false;

  function getCurrentPositionAsync(options = { enableHighAccuracy: true, timeout: 10000 }) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        return reject(new Error("Geolocalización no disponible en este navegador."));
      }

      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        err => reject(err),
        options
      );
    });
  }

  function pedirJustificacion() {
    return new Promise(resolve => {
      const modal = document.getElementById("justificationModal");
      const textarea = document.getElementById("justificationText");
      const btn = document.getElementById("saveJustificationButton");

      if (!modal || !textarea || !btn) {
        resolve("");
        return;
      }

      modal.style.display = "block";
      textarea.value = "";

      btn.onclick = () => {
        modal.style.display = "none";
        resolve(textarea.value.trim());
      };
    });
  }

  async function ensureQR() {
    if (typeof Html5QrcodeScanner !== "undefined") return;

    const script = document.createElement("script");
    script.src = HTML5_QRCODE_CDN;
    document.head.appendChild(script);

    await new Promise(resolve => (script.onload = resolve));
  }

  function renderJornadasSelector(jornadas, onConfirm) {
    const select = document.getElementById("jornadasSelect");
    const btn = document.getElementById("btnConfirmarJornada");

    if (!select || !btn) return;

    select.innerHTML = "";

    jornadas.forEach(j => {
      const opt = document.createElement("option");
      opt.value = String(j.jornadas.id);
      opt.textContent =
        j.jornadas.nombre +
        ` (${j.jornadas.hora_entrada || "--"} - ${j.jornadas.hora_salida || "--"})`;
      select.appendChild(opt);
    });

    select.style.display = "";
    btn.style.display = "";

    btn.onclick = async () => {
      const jornadaId = select.value;
      const selected = jornadas.find(j => String(j.jornadas.id) === String(jornadaId));

      select.style.display = "none";
      btn.style.display = "none";

      if (selected && typeof onConfirm === "function") {
        await onConfirm(selected.jornadas);
      }
    };
  }

  async function procesarJornada(uid, jornada, user) {
    const resultado = await EmployeeModel.registrarAsistencia(
      uid,
      jornada,
      user,
      pedirJustificacion
    );

    const resultadoDiv = document.getElementById("resultado");
    if (resultadoDiv) resultadoDiv.textContent = resultado.message || "";

    if (!resultado.ok) {
      alert(resultado.message || "Ocurrió un error.");
    }
  }

  async function iniciarScanner(uid) {
    await ensureQR();

    if (html5QrcodeScanner) {
      try {
        await html5QrcodeScanner.clear();
      } catch (e) {
        console.warn("Error limpiando scanner previo:", e);
      }
    }

    html5QrcodeScanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: 250 },
      false
    );

    html5QrcodeScanner.render(
      async decodedText => {
        if (scanProcesado) return;
        scanProcesado = true;

        try {
          const user = await EmployeeModel.getUserData(uid);
          if (!user) {
            alert("No se encontró tu perfil de usuario.");
            return;
          }

          const decoded = decodedText ? decodedText.trim() : "";
          if (!decoded) {
            alert("QR vacío o inválido.");
            return;
          }

          const empresa = await EmployeeModel.findEmpresaByQr(decoded);

          if (!empresa) {
            alert("QR incorrecto: empresa no encontrada.");
            return;
          }

          const userEmpresaId = user.empresa_id || null;
          if (String(empresa.id) !== String(userEmpresaId)) {
            alert("QR incorrecto: la empresa no coincide con tu cuenta.");
            return;
          }

          let coords;
          try {
            coords = await getCurrentPositionAsync();
          } catch (geoErr) {
            console.error("Error obteniendo ubicación:", geoErr);
            alert("Debe permitir el acceso a su ubicación para registrar asistencia.");
            return;
          }

          const saveResult = await EmployeeModel.ensureCoordsForEmpresaSucursal(empresa, user, coords);
          console.info("Resultado guardado coords:", saveResult, "sucursalId:", EmployeeModel.getCurrentSucursalId());

          const point = EmployeeModel.getAllowedPoint();
          if (point.lat == null || point.lng == null) {
            alert("No se pudo validar la ubicación de la empresa/sucursal. Contacta al administrador.");
            return;
          }

          const dist = EmployeeModel.distanceMeters(coords.lat, coords.lng, point.lat, point.lng);
          if (dist > allowedRadius) {
            alert(
              `Estás fuera del rango permitido (${Math.round(dist)} m). Acércate a la ubicación de la empresa para registrar asistencia.`
            );
            return;
          }

          const jornadas = await EmployeeModel.getUserJornadas(uid);

          if (!jornadas.length) {
            alert("No tienes jornadas asignadas.");
            if (typeof logout === "function") logout();
            return;
          }

          if (jornadas.length === 1) {
            await procesarJornada(uid, jornadas[0].jornadas, user);
            return;
          }

          renderJornadasSelector(jornadas, async jornadaElegida => {
            await procesarJornada(uid, jornadaElegida, user);
          });
        } catch (e) {
          console.error("Error procesando QR:", e);
          alert("Ocurrió un error procesando el QR.");
        } finally {
          scanProcesado = false;
        }
      },
      () => {}
    );
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const logoutBtn = document.getElementById("logout-button");
    if (logoutBtn && typeof logout === "function") {
      logoutBtn.addEventListener("click", logout);
    }

    if (typeof checkUserSession !== "function") {
      console.error("checkUserSession no está disponible.");
      return;
    }

    checkUserSession(async uid => {
      try {
        const user = await EmployeeModel.getUserData(uid);

        if (!user) {
          alert("No existe tu perfil en la tabla usuarios.");
          if (typeof logout === "function") logout();
          return;
        }

        const role = (user.role || "").toString().toLowerCase();
        const allowedRoles = ["empleado", "admin", "gerente"];

        if (!allowedRoles.includes(role)) {
          alert("No tienes permisos.");
          if (typeof logout === "function") logout();
          return;
        }

        await iniciarScanner(uid);
      } catch (e) {
        console.error("Error inicializando módulo empleado:", e);
        alert("Ocurrió un error al iniciar el módulo.");
        if (typeof logout === "function") logout();
      }
    });
  });
})(window);