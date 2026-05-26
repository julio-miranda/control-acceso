//js/controllers/login.controller.js
(function (window, document) {
    function initLoginController() {
        const form = document.getElementById("login-form");
        const emailInput = document.getElementById("login-email");
        const passwordInput = document.getElementById("login-password");
        const submitBtn = form?.querySelector('button[type="submit"]');

        if (!form || !emailInput || !passwordInput) {
            console.error("No se encontró el formulario o sus campos.");
            return;
        }

        if (!window.LoginModel || typeof window.LoginModel.authenticate !== "function") {
            console.error("LoginModel no está disponible o no tiene authenticate(). Revisa js/models/login.model.js.");
            return;
        }

        form.addEventListener("submit", async function (e) {
            e.preventDefault();

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            if (!email || !password) {
                alert("Ingresa tu correo y contraseña.");
                return;
            }

            try {
                if (submitBtn) submitBtn.disabled = true;

                const result = await window.LoginModel.authenticate(email, password);

                if (!result || !result.ok) {
                    alert(result?.message || "No se pudo iniciar sesión.");
                    return;
                }

                const role = (result.user?.role || "").toString().toLowerCase();
                const redirectUrl = window.LoginModel.getRedirectByRole
                    ? window.LoginModel.getRedirectByRole(role)
                    : "index.html";

                window.location.href = redirectUrl;
            } catch (err) {
                console.error("Error en login:", err);
                alert("Error en login: " + (err.message || err));
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initLoginController);
    } else {
        initLoginController();
    }
})(window, document);