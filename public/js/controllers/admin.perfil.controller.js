// js/controllers/admin.perfil.controller.js
(function () {
    const Auth = {
        checkUserSession: window.checkUserSession,
        logout: window.logout,
        updatePassword: window.updatePassword,
        getSessionData: window.getSessionData
    };

    const PerfilModel = window.PerfilModel;
    const RolePolicy = window.RolePolicy || null;

    if (!Auth.checkUserSession || !Auth.logout || !Auth.updatePassword) {
        console.error("auth.js no cargó correctamente sus funciones globales.");
        return;
    }

    if (!PerfilModel) {
        console.error("PerfilModel no está cargado. Revisa la ruta del archivo y el orden de los scripts.");
        return;
    }

    window.adminEmpresa = "";
    window.adminSucursal = "";
    window.adminEmpresaNombre = "";

    function sanitizeFileName(name) {
        if (!name) return "empresa";
        return String(name)
            .normalize("NFKD")
            .replace(/[^\w\s-]/g, "")
            .trim()
            .replace(/\s+/g, "_");
    }

    function normalizeRole(role) {
        if (RolePolicy?.normalizeRole) return RolePolicy.normalizeRole(role);
        return String(role || "").trim().toLowerCase();
    }

    function canAccessProfile(role) {
        const normalized = normalizeRole(role);
        return !!normalized;
    }

    function applyNavbarByRole(role) {
        const normalized = normalizeRole(role);
        const items = document.querySelectorAll("#menu > li[data-roles]");
        const homeLink = document.querySelector('#menu a[data-nav="home"]');
        const logoLink = document.getElementById("navbar-home-link");

        items.forEach((item) => {
            const allowedRoles = String(item.dataset.roles || "")
                .split(",")
                .map((r) => normalizeRole(r))
                .filter(Boolean);

            item.style.display = allowedRoles.includes(normalized) ? "" : "none";
        });

        const homeHref = RolePolicy?.getRedirectByRole
            ? RolePolicy.getRedirectByRole(normalized)
            : "index.html";

        if (homeLink) homeLink.href = homeHref;
        if (logoLink) logoLink.href = homeHref;

        document.querySelectorAll("#menu a").forEach((link) => {
            const href = link.getAttribute("href") || "";
            const isCurrent =
                href.includes("admin_perfil.html") ||
                (document.body?.dataset?.page || "") === "perfil";

            if (isCurrent && href.includes("admin_perfil.html")) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }

    function ocultarSecciones() {
        const ids = [
            "perfil-container",
            "empleado-container",
            "tabla-empleados",
            "tabla-asistencias",
            "planilla-container",
            "jornadas-container"
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = "none";
        });
    }

    function mostrarPerfil() {
        ocultarSecciones();
        const perfil = document.getElementById("perfil-container");
        if (perfil) perfil.style.display = "block";
    }

    function setValue(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value ?? "";
    }

    async function cargarPerfil(uid) {
        mostrarPerfil();

        const { data: userData, error } = await PerfilModel.getPerfil(uid);

        if (error) {
            console.error("Error fetching profile:", error);
        }

        if (!userData) {
            alert("No se encontró el perfil del usuario.");
            return null;
        }

        setValue("nombre", userData.nombre);
        setValue("email", userData.email);
        setValue("identificacionNombre", userData.identificacion_nombre || "");
        setValue("identificacion", userData.identificacion);
        setValue("nacimiento", userData.nacimiento);
        setValue("empleado-salariop", userData.salario_h ?? 0);
        setValue("descripcionp", userData.descripcion);

        window.adminEmpresa = String(
            userData.empresa_id ||
            userData.sucursal_empresa_id ||
            userData.empresa ||
            ""
        );

        window.adminSucursal = String(
            userData.sucursal_id ||
            userData.sucursal ||
            ""
        );

        if (window.adminEmpresa) {
            const { data: emp } = await PerfilModel.getNombreEmpresa(window.adminEmpresa);
            if (emp?.nombre) {
                window.adminEmpresaNombre = emp.nombre;
            }
        }

        return userData;
    }

    async function guardarPerfil(uid) {
        const cambiarContrasena = !!document.getElementById("cambiar-contrasena")?.checked;
        const nuevaContrasena = document.getElementById("nueva-contrasena")?.value?.trim() || "";

        if (cambiarContrasena && !nuevaContrasena) {
            alert("Escribe la nueva contraseña.");
            return;
        }

        const payload = {
            nombre: document.getElementById("nombre")?.value?.trim() || "",
            email: document.getElementById("email")?.value?.trim() || "",
            identificacion_nombre: document.getElementById("identificacionNombre")?.value?.trim() || "",
            identificacion: document.getElementById("identificacion")?.value?.trim() || "",
            nacimiento: document.getElementById("nacimiento")?.value || null,
            salario_h: Number(document.getElementById("empleado-salariop")?.value || 0),
            descripcion: document.getElementById("descripcionp")?.value?.trim() || ""
        };

        const { data, error } = await PerfilModel.actualizarPerfil(uid, payload);

        if (error) {
            console.error("Error al guardar perfil:", error);
            alert("No se pudo guardar el perfil.");
            return;
        }

        if (cambiarContrasena && nuevaContrasena) {
            const { error: pwError } = await Auth.updatePassword(nuevaContrasena);
            if (pwError) {
                console.error("Error al actualizar contraseña:", pwError);
                alert("El perfil se guardó, pero no se pudo cambiar la contraseña.");
                return;
            }
        }

        if (data?.empresa_id) {
            window.adminEmpresa = String(data.empresa_id || "");
        }

        if (data?.empresa_nombre) {
            window.adminEmpresaNombre = String(data.empresa_nombre || "");
        }

        alert("Perfil actualizado correctamente.");
    }

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            await Auth.checkUserSession(async (uid, session) => {
                if (!uid) return;

                const { data: userData } = await PerfilModel.getPerfil(uid);

                const role = normalizeRole(
                    userData?.role ||
                    session?.app_metadata?.role ||
                    session?.user_metadata?.role ||
                    ""
                );

                if (!canAccessProfile(role)) {
                    alert("No tienes acceso al perfil.");
                    Auth.logout();
                    return;
                }

                applyNavbarByRole(role);
                await cargarPerfil(uid);

                const form = document.getElementById("perfil-form");
                if (form) {
                    form.addEventListener("submit", async (e) => {
                        e.preventDefault();
                        await guardarPerfil(uid);
                    });
                }

                const cancelar = document.getElementById("btnCancelarPerfil");
                if (cancelar) {
                    cancelar.addEventListener("click", () => {
                        const target = RolePolicy?.getRedirectByRole
                            ? RolePolicy.getRedirectByRole(role)
                            : "index.html";
                        window.location.href = target;
                    });
                }

                const cambiarContrasena = document.getElementById("cambiar-contrasena");
                const nuevaContrasenaContainer = document.getElementById("nueva-contrasena-container");
                if (cambiarContrasena && nuevaContrasenaContainer) {
                    cambiarContrasena.addEventListener("change", () => {
                        nuevaContrasenaContainer.style.display = cambiarContrasena.checked ? "block" : "none";
                    });
                }

                const logoutBtn = document.getElementById("logout-button");
                if (logoutBtn) {
                    logoutBtn.addEventListener("click", () => Auth.logout());
                }

                const btnQr = document.getElementById("btnDescargarQr");
                if (btnQr) {
                    btnQr.addEventListener("click", async () => {
                        const cont = document.getElementById("qr-container");
                        if (!cont) return alert("Contenedor de QR no encontrado");

                        cont.innerHTML = "";

                        const text = window.adminEmpresaNombre || window.adminEmpresa || "";
                        if (!text) return alert("No hay empresa asignada para generar QR.");

                        try {
                            if (typeof QRCode === "undefined") {
                                return alert("QRCode no está disponible.");
                            }

                            new QRCode(cont, { text, width: 400, height: 400 });
                        } catch (e) {
                            console.error("Error generando QR:", e);
                            return alert("Error generando QR");
                        }

                        setTimeout(() => {
                            let href = null;
                            const img = cont.querySelector("img");
                            if (img && img.src) {
                                href = img.src;
                            } else {
                                const canvas = cont.querySelector("canvas");
                                if (canvas && typeof canvas.toDataURL === "function") {
                                    href = canvas.toDataURL("image/png");
                                }
                            }

                            if (!href) {
                                cont.innerHTML = "";
                                return alert("No se pudo generar imagen del QR");
                            }

                            const a = document.createElement("a");
                            a.href = href;
                            a.download = sanitizeFileName(window.adminEmpresaNombre || window.adminEmpresa) + ".png";
                            document.body.appendChild(a);
                            a.click();
                            a.remove();

                            cont.innerHTML = "";
                        }, 150);
                    });
                }

                const menuToggle = document.getElementById("menu-toggle");
                const navLinks = document.getElementById("navbar-links");

                if (menuToggle && navLinks) {
                    menuToggle.addEventListener("click", (e) => {
                        e.stopPropagation();
                        navLinks.classList.toggle("active");
                    });

                    navLinks.querySelectorAll("a, button").forEach(item => {
                        item.addEventListener("click", () => navLinks.classList.remove("active"));
                    });

                    document.addEventListener("click", (e) => {
                        if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
                            navLinks.classList.remove("active");
                        }
                    });
                }
            });
        } catch (err) {
            console.error("Error inicializando perfil.controlador.js:", err);
            if (Auth.logout) Auth.logout();
        }
    });
})();