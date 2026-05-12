// js/controllers/satisfaccion.controller.js
(function () {
    const PAGE = (document.body?.dataset?.page || "").trim().toLowerCase();
    const Model = window.SatisfaccionModel;

    const Auth = {
        checkUserSession: window.AuthModel?.checkUserSession || window.checkUserSession,
        logout: window.AuthModel?.signOut || window.logout
    };

    const CAMPOS = [
        "ambiente",
        "musica",
        "atencion",
        "seguridad",
        "limpieza",
        "tiempo_espera",
        "recomendacion"
    ];

    const ETIQUETAS = {
        ambiente: "Ambiente general",
        musica: "Música / DJ",
        atencion: "Atención del personal",
        seguridad: "Seguridad del lugar",
        limpieza: "Limpieza",
        tiempo_espera: "Tiempo de espera",
        recomendacion: "Probabilidad de recomendación"
    };

    function numero(valor) {
        const n = Number(valor);
        return Number.isFinite(n) ? n : 0;
    }

    function promedio(numeros) {
        if (!numeros.length) return 0;
        return numeros.reduce((a, b) => a + b, 0) / numeros.length;
    }

    function formatoPromedio(n) {
        return Number(n || 0).toFixed(2);
    }

    function leerCampo(id) {
        const el = document.getElementById(id);
        return el ? Number(el.value) : 0;
    }

    function setTexto(id, texto) {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    }

    function rangoDefecto() {
        const hoy = new Date();
        const inicio = new Date(hoy);
        inicio.setDate(hoy.getDate() - 30);

        return {
            inicio: inicio.toISOString().slice(0, 10),
            fin: hoy.toISOString().slice(0, 10)
        };
    }

    function clasificarPromedio(valor) {
        if (valor >= 4.5) return "Excelente";
        if (valor >= 3.5) return "Bueno";
        if (valor >= 2.5) return "Regular";
        return "Deficiente";
    }

    function calcularResumen(rows) {
        const totales = {};
        const sumas = {};
        const comentarios = [];
        let totalRespuestas = rows.length;
        let totalValores = 0;
        let sumaGlobal = 0;
        let altas = 0;
        let bajas = 0;

        CAMPOS.forEach(campo => {
            totales[campo] = 0;
            sumas[campo] = 0;
        });

        rows.forEach(row => {
            CAMPOS.forEach(campo => {
                const v = numero(row[campo]);
                sumas[campo] += v;
                totales[campo] += 1;
                totalValores += 1;
                sumaGlobal += v;

                if (v >= 4) altas += 1;
                if (v <= 2) bajas += 1;
            });

            if (row.comentario && String(row.comentario).trim()) {
                comentarios.push({
                    created_at: row.created_at,
                    comentario: String(row.comentario).trim()
                });
            }
        });

        const promedios = {};
        CAMPOS.forEach(campo => {
            promedios[campo] = totales[campo] ? (sumas[campo] / totales[campo]) : 0;
        });

        const ordenados = Object.entries(promedios).sort((a, b) => b[1] - a[1]);
        const mejor = ordenados[0] || ["N/A", 0];
        const peor = ordenados[ordenados.length - 1] || ["N/A", 0];

        return {
            totalRespuestas,
            promedioGlobal: totalValores ? (sumaGlobal / totalValores) : 0,
            porcentajeAltas: totalValores ? (altas / totalValores) * 100 : 0,
            porcentajeBajas: totalValores ? (bajas / totalValores) * 100 : 0,
            promedios,
            mejor,
            peor,
            comentarios
        };
    }

    function renderSurvey() {
        const form = document.getElementById("encuesta-form");
        if (!form || !Model) return;

        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const payload = {};
            for (const campo of CAMPOS) {
                const valor = leerCampo(campo);
                if (!valor || valor < 1 || valor > 5) {
                    alert("Completa todas las preguntas antes de enviar.");
                    return;
                }
                payload[campo] = valor;
            }

            payload.comentario = (document.getElementById("comentario")?.value || "").trim();
            payload.canal = "qr";

            const btn = form.querySelector('button[type="submit"]');
            if (btn) btn.disabled = true;

            try {
                const { error } = await Model.guardarEncuesta(payload);
                if (error) {
                    console.error("Error al guardar encuesta:", error);
                    alert("No se pudo enviar la encuesta.");
                    return;
                }

                alert("Gracias por tu respuesta.");
                form.reset();
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    function renderMetricas(rows) {
        const resumen = calcularResumen(rows);

        const grid = document.getElementById("metricas-grid");
        if (grid) {
            grid.innerHTML = `
                <div class="metrica-card">
                    <h3>Total respuestas</h3>
                    <div class="valor">${resumen.totalRespuestas}</div>
                </div>
                <div class="metrica-card">
                    <h3>Promedio global</h3>
                    <div class="valor">${formatoPromedio(resumen.promedioGlobal)}</div>
                </div>
                <div class="metrica-card">
                    <h3>Calificaciones altas</h3>
                    <div class="valor">${resumen.porcentajeAltas.toFixed(1)}%</div>
                </div>
                <div class="metrica-card">
                    <h3>Calificaciones bajas</h3>
                    <div class="valor">${resumen.porcentajeBajas.toFixed(1)}%</div>
                </div>
            `;
        }

        const tbodyPromedios = document.querySelector("#tabla-promedios tbody");
        if (tbodyPromedios) {
            tbodyPromedios.innerHTML = CAMPOS.map(campo => {
                const avg = resumen.promedios[campo] || 0;
                return `
                    <tr>
                        <td>${ETIQUETAS[campo]}</td>
                        <td>${formatoPromedio(avg)}</td>
                        <td>${clasificarPromedio(avg)}</td>
                    </tr>
                `;
            }).join("");
        }

        const tbodyComentarios = document.querySelector("#tabla-comentarios tbody");
        if (tbodyComentarios) {
            const comentarios = resumen.comentarios.slice(0, 15);

            if (!comentarios.length) {
                tbodyComentarios.innerHTML = `
                    <tr>
                        <td colspan="2">No hay comentarios todavía.</td>
                    </tr>
                `;
            } else {
                tbodyComentarios.innerHTML = comentarios.map(item => `
                    <tr>
                        <td>${item.created_at ? new Date(item.created_at).toLocaleString() : ""}</td>
                        <td style="text-align:left; white-space:normal;">${item.comentario}</td>
                    </tr>
                `).join("");
            }
        }
    }

    async function cargarMetricas() {
        const inicio = document.getElementById("fechaInicio")?.value || rangoDefecto().inicio;
        const fin = document.getElementById("fechaFin")?.value || rangoDefecto().fin;

        const { data, error } = await Model.obtenerEncuestas(inicio, fin);
        if (error) {
            console.error("Error al cargar métricas:", error);
            alert("No se pudieron cargar las métricas.");
            return;
        }

        renderMetricas(data || []);
    }

    function prepararFiltros() {
        const rango = rangoDefecto();
        const inicio = document.getElementById("fechaInicio");
        const fin = document.getElementById("fechaFin");
        if (inicio && !inicio.value) inicio.value = rango.inicio;
        if (fin && !fin.value) fin.value = rango.fin;

        const btn = document.getElementById("btnFiltrarMetricas");
        if (btn) {
            btn.addEventListener("click", () => {
                cargarMetricas();
            });
        }
    }

    function configurarQr() {
        const btn = document.getElementById("btnDescargarQr");
        const cont = document.getElementById("qr-container");
        if (!btn || !cont) return;

        btn.addEventListener("click", () => {
            cont.innerHTML = "";

            const urlEncuesta = new URL("encuesta_satisfaccion.html", window.location.href).href;

            try {
                new QRCode(cont, {
                    text: urlEncuesta,
                    width: 400,
                    height: 400
                });
            } catch (e) {
                console.error("Error generando QR:", e);
                alert("No se pudo generar el QR.");
                return;
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
                    alert("No se pudo generar la imagen del QR.");
                    return;
                }

                const a = document.createElement("a");
                a.href = href;
                a.download = "qr-encuesta-vertigo.png";
                document.body.appendChild(a);
                a.click();
                a.remove();

                cont.innerHTML = "";
            }, 150);
        });
    }

    async function protegerAdminYCargar() {
        if (!Auth.checkUserSession) {
            await cargarMetricas();
            return;
        }

        await Auth.checkUserSession(async (uid) => {
            if (!uid) return;

            if (window.supabase) {
                const { data: userData, error } = await window.supabase
                    .from("v_usuarios")
                    .select("*")
                    .eq("id", uid)
                    .maybeSingle();

                if (error || !userData) {
                    console.error("No se pudo validar usuario admin:", error);
                    if (Auth.logout) {
                        await Auth.logout();
                    } else {
                        window.location.replace("index.html");
                    }
                    return;
                }

                if ((userData.role || "").toString().toLowerCase() !== "admin") {
                    alert("No tienes permisos de administrador.");
                    if (Auth.logout) {
                        await Auth.logout();
                    } else {
                        window.location.replace("index.html");
                    }
                    return;
                }
            }

            await cargarMetricas();
        });
    }

    document.addEventListener("DOMContentLoaded", async () => {
        try {
            if (PAGE === "encuesta-satisfaccion") {
                renderSurvey();
                return;
            }

            if (PAGE === "admin-metricas-satisfaccion") {
                configurarQr();
                prepararFiltros();

                const logoutBtn = document.getElementById("logout-button");
                if (logoutBtn && Auth.logout) {
                    logoutBtn.addEventListener("click", async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        try {
                            await Auth.logout();
                        } catch (err) {
                            console.error("Error cerrando sesión:", err);
                            window.location.replace("index.html");
                        }
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

                await protegerAdminYCargar();
            }
        } catch (err) {
            console.error("Error inicializando módulo de satisfacción:", err);
            if (Auth.logout) {
                await Auth.logout();
            } else {
                window.location.replace("index.html");
            }
        }
    });
})();