// js/controllers/reservas.controller.js
(function (global) {
  "use strict";

  const Model = global.ReservasModel;
  const Auth = global.AuthModel || null;
  const Swal = global.Swal || null;
  const QRCode = global.QRCode || null;
  const rolePolicy = global.RolePolicy || null;

  if (!Model) {
    console.error("ReservasModel no está disponible.");
    return;
  }

  const menuToggle = document.getElementById("menu-toggle");
  const navLinks = document.getElementById("navbar-links");
  const logoutBtn = document.getElementById("logout-button");
  const btnQr = document.getElementById("btnDescargarQr");
  const qrContainer = document.getElementById("qr-container");

  const statEventsEl = document.getElementById("statEvents");
  const statPendingEl = document.getElementById("statPending");
  const statConfirmedEl = document.getElementById("statConfirmed");
  const statAvailableTablesEl = document.getElementById("statAvailableTables");

  const eventTypesGridId = "eventTypesGrid";

  const reservationType = document.getElementById("reservationMode");
  const eventSelect = document.getElementById("eventSelect");
  const mesaSelect = document.getElementById("mesaSelect");
  const mesaWrapper = document.getElementById("mesaWrapper");
  const vipSelect = document.getElementById("vipSelect");
  const peopleCount = document.getElementById("peopleCount");
  const reservationAmount = document.getElementById("reservationAmount");
  const useAutoTable = document.getElementById("useAutoTable");
  const clientName = document.getElementById("clientName");
  const clientPhone = document.getElementById("clientPhone");
  const clientEmail = document.getElementById("clientEmail");
  const clientIdentification = document.getElementById("clientIdentification");
  const clientAddress = document.getElementById("clientAddress");
  const reservationNote = document.getElementById("reservationNote");
  const reservationForm = document.getElementById("reservationForm");

  const btnCreateReservation = document.getElementById("btnCreateReservation");
  const btnClearReservationForm = document.getElementById("btnClearReservationForm");
  const btnRefreshReservations = document.getElementById("btnRefreshReservations");
  const btnRefreshVip = document.getElementById("btnRefreshVip");

  const eventSearch = document.getElementById("eventSearch");
  const tableSearch = document.getElementById("tableSearch");
  const reservationSearch = document.getElementById("reservationSearch");

  const eventsTableBody = document.querySelector("#eventsTable tbody");
  const tablesTableBody = document.querySelector("#tablesTable tbody");
  const reservationsTableBody = document.querySelector("#reservationsTable tbody");

  let cachedEvents = [];
  let cachedTables = [];
  let cachedReservations = [];
  let cachedVip = [];
  let currentRole = "";

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"'`=\/]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "/": "&#x2F;",
      "`": "&#x60;",
      "=": "&#x3D;"
    }[c]));
  }

  function normalizeDateForDisplay(value) {
    const d = Model.parseDate(value);
    return d ? d.toLocaleString() : "—";
  }

  function formatCurrency(value) {
    return typeof window.appChartUtils?.formatCurrency === "function"
      ? window.appChartUtils.formatCurrency(value)
      : Model.currency(value);
  }

  function hasText(value) {
    return String(value ?? "").trim().length > 0;
  }

  function toIsoFromDatetimeLocal(value) {
    if (!hasText(value)) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function normalizeRole(role) {
    if (rolePolicy?.normalizeRole) return rolePolicy.normalizeRole(role);
    return String(role || "").trim().toLowerCase();
  }

  function canAccessModule(role) {
    const normalized = normalizeRole(role);

    if (rolePolicy?.can) {
      const allowedByPolicy =
        rolePolicy.can(normalized, "reservas") ||
        rolePolicy.can(normalized, "reservations");
      if (allowedByPolicy) return true;
    }

    return ["admin", "gerente","barra"].includes(normalized);
  }

  function canAccessMenuItem(role, allowedRolesCsv) {
    const normalized = normalizeRole(role);
    const allowed = String(allowedRolesCsv || "")
      .split(",")
      .map(v => v.trim().toLowerCase())
      .filter(Boolean);

    if (!allowed.length) return true;
    return allowed.includes(normalized);
  }

  function applyMenuRoles(role) {
    const items = document.querySelectorAll("#menu [data-roles]");
    items.forEach((item) => {
      const allowedRoles = item.getAttribute("data-roles");
      item.style.display = canAccessMenuItem(role, allowedRoles) ? "" : "none";
    });
  }

  function setupMenu() {
    if (!menuToggle || !navLinks) return;

    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      navLinks.classList.toggle("active");
    });

    document.addEventListener("click", (e) => {
      if (!navLinks.contains(e.target) && !menuToggle.contains(e.target)) {
        navLinks.classList.remove("active");
      }
    });
  }

  async function setupQr() {
    if (!btnQr || !qrContainer) return;

    btnQr.addEventListener("click", async () => {
      qrContainer.innerHTML = "";

      const user = Model.getCurrentUser();
      const text = user?.empresa_nombre || user?.nombre || user?.empresa_id || "Empresa";

      if (!text) {
        Swal?.fire?.("Sin datos", "No hay empresa asignada para generar QR.", "info");
        return;
      }

      try {
        if (typeof QRCode === "undefined") {
          Swal?.fire?.("Error", "QRCode no está disponible.", "error");
          return;
        }

        new QRCode(qrContainer, {
          text: String(text),
          width: 400,
          height: 400
        });
      } catch (e) {
        console.error("Error generando QR:", e);
        Swal?.fire?.("Error", "Error generando QR", "error");
      }
    });
  }

  function ensureEventTypesGrid() {
    let grid = document.getElementById(eventTypesGridId);

    if (!grid) {
      const section = document.createElement("section");
      section.className = "table-container";
      section.style.marginBottom = "20px";
      section.id = "eventTypesSection";

      section.innerHTML = `
        <div class="section-header" style="margin-bottom:10px;">
          <h3>Tipos de eventos disponibles</h3>
        </div>
        <div id="${eventTypesGridId}" class="event-types-grid"></div>
      `;

      const dashboard = document.querySelector(".dashboard");
      if (dashboard) {
        const ref = dashboard.querySelector("#eventSearch")?.closest("section");
        if (ref && ref.parentNode) {
          ref.parentNode.insertBefore(section, ref);
        } else {
          dashboard.appendChild(section);
        }
      }

      grid = section.querySelector(`#${eventTypesGridId}`);
    }

    return grid;
  }

  function ensureEventFormSection() {
    let section = document.getElementById("eventFormSection");
    if (section) return section;

    const dashboard = document.querySelector(".dashboard");
    if (!dashboard) return null;

    section = document.createElement("section");
    section.className = "table-container";
    section.style.marginBottom = "20px";
    section.id = "eventFormSection";

    const typeOptions = (typeof Model.getEventTypes === "function" ? Model.getEventTypes() : [])
      .map(t => `<option value="${escapeHtml(t.value)}">${escapeHtml(t.label)}</option>`)
      .join("");

    section.innerHTML = `
      <h3>Registrar evento</h3>
      <form id="eventForm" style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
        <div class="product-select-wrapper" style="min-width:260px; flex:1;">
          <label for="eventNombre">Nombre</label>
          <input id="eventNombre" type="text" placeholder="Nombre del evento">
        </div>

        <div class="product-select-wrapper" style="min-width:240px;">
          <label for="eventTipo">Tipo</label>
          <select id="eventTipo">
            ${typeOptions}
          </select>
        </div>

        <div class="product-select-wrapper" style="min-width:260px; flex:1;">
          <label for="eventDescripcion">Descripción</label>
          <input id="eventDescripcion" type="text" placeholder="Descripción opcional">
        </div>

        <div class="qty-wrapper">
          <label for="eventFechaInicio">Fecha inicio</label>
          <input id="eventFechaInicio" type="datetime-local">
        </div>

        <div class="qty-wrapper">
          <label for="eventFechaFin">Fecha fin</label>
          <input id="eventFechaFin" type="datetime-local">
        </div>

        <div class="qty-wrapper">
          <label for="eventCapacidad">Capacidad</label>
          <input id="eventCapacidad" type="number" min="1" value="0">
        </div>

        <div class="qty-wrapper">
          <label for="eventPrecio">Precio entrada</label>
          <input id="eventPrecio" type="number" min="0" step="0.01" value="0">
        </div>

        <div class="product-select-wrapper">
          <label for="eventEstado">Estado</label>
          <select id="eventEstado">
            <option value="programado">Programado</option>
            <option value="activo">Activo</option>
            <option value="finalizado">Finalizado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>

        <div class="product-select-wrapper">
          <label for="eventRequiereReservacion">Requiere reservación</label>
          <select id="eventRequiereReservacion">
            <option value="0">No</option>
            <option value="1">Sí</option>
          </select>
        </div>

        <div class="product-select-wrapper">
          <label for="eventEsGratuito">Es gratuito</label>
          <select id="eventEsGratuito">
            <option value="0">No</option>
            <option value="1">Sí</option>
          </select>
        </div>

        <div class="product-select-wrapper">
          <label for="eventEntradaGratis">Entrada gratis</label>
          <select id="eventEntradaGratis">
            <option value="1">Sí</option>
            <option value="0">No</option>
          </select>
        </div>

        <div class="product-select-wrapper">
          <label for="eventResponsableVip">Responsable VIP (opcional)</label>
          <select id="eventResponsableVip">
            <option value="">Sin cliente VIP</option>
          </select>
        </div>

        <div class="product-select-wrapper" style="min-width:260px; flex:1;">
          <label for="eventResponsableNombre">Responsable / Cliente</label>
          <input id="eventResponsableNombre" type="text" placeholder="Nombre del responsable">
        </div>

        <div class="product-select-wrapper" style="min-width:220px;">
          <label for="eventResponsableTelefono">Teléfono</label>
          <input id="eventResponsableTelefono" type="text" placeholder="Teléfono">
        </div>

        <div class="product-select-wrapper" style="min-width:260px;">
          <label for="eventResponsableEmail">Correo</label>
          <input id="eventResponsableEmail" type="email" placeholder="Correo">
        </div>

        <div class="product-select-wrapper" style="min-width:260px;">
          <label for="eventResponsableIdentificacion">Identificación</label>
          <input id="eventResponsableIdentificacion" type="text" placeholder="DUI / NIT / Pasaporte">
        </div>

        <div class="product-select-wrapper" style="min-width:100%; flex:1;">
          <label for="eventResponsableDireccion">Dirección</label>
          <textarea id="eventResponsableDireccion" rows="2" style="width:100%; resize:vertical;" placeholder="Dirección del responsable"></textarea>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button id="btnCreateEvent" class="btn-primary" type="submit">Guardar evento</button>
          <button id="btnClearEvent" class="btn-outline" type="button">Limpiar</button>
        </div>
      </form>
    `;

    const ref = dashboard.querySelector("#eventTypesSection") || dashboard.children[1] || null;
    if (ref && ref.parentNode) {
      ref.parentNode.insertBefore(section, ref.nextSibling);
    } else {
      dashboard.insertBefore(section, dashboard.children[1] || null);
    }

    return section;
  }

  function renderEventTypes() {
    const grid = ensureEventTypesGrid();
    if (!grid) return;

    grid.innerHTML = "";

    const types = typeof Model.getEventTypes === "function" ? Model.getEventTypes() : [];

    types.forEach(type => {
      const card = document.createElement("div");
      card.className = "event-type-card";
      card.innerHTML = `
        <h3>${escapeHtml(type.label)}</h3>
        <p>${escapeHtml(type.description)}</p>
        <code>${escapeHtml(type.value)}</code>
      `;
      grid.appendChild(card);
    });
  }

  function renderEventsSelect() {
    if (!eventSelect) return;

    eventSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona un evento";
    eventSelect.appendChild(placeholder);

    if (!cachedEvents.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No hay eventos disponibles";
      eventSelect.appendChild(opt);
      return;
    }

    cachedEvents.forEach(ev => {
      const opt = document.createElement("option");
      opt.value = ev.id;
      opt.textContent = `${ev.nombre} · ${ev.tipo} · ${normalizeDateForDisplay(ev.fecha_inicio)}`;
      eventSelect.appendChild(opt);
    });
  }

  function renderVipSelect() {
    if (!vipSelect) return;

    vipSelect.innerHTML = "";

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Sin cliente VIP";
    vipSelect.appendChild(blank);

    cachedVip.forEach(client => {
      const opt = document.createElement("option");
      opt.value = client.id;
      opt.textContent = client.nombre;
      vipSelect.appendChild(opt);
    });

    const eventResponsibleVip = document.getElementById("eventResponsableVip");
    if (eventResponsibleVip) {
      eventResponsibleVip.innerHTML = "";

      const blank2 = document.createElement("option");
      blank2.value = "";
      blank2.textContent = "Sin cliente VIP";
      eventResponsibleVip.appendChild(blank2);

      cachedVip.forEach(client => {
        const opt = document.createElement("option");
        opt.value = client.id;
        opt.textContent = client.nombre;
        eventResponsibleVip.appendChild(opt);
      });
    }
  }

  function renderTablesTable(rows) {
    if (!tablesTableBody) return;

    tablesTableBody.innerHTML = "";

    const list = rows || cachedTables;

    if (!list.length) {
      tablesTableBody.innerHTML = "<tr><td colspan='4'>No hay mesas registradas</td></tr>";
      return;
    }

    list.forEach(mesa => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(mesa.numero || "—")}</td>
        <td>${escapeHtml(mesa.capacidad ?? "—")}</td>
        <td>${escapeHtml(mesa.estado || "—")}</td>
        <td>${escapeHtml(mesa.descripcion || "—")}</td>
      `;
      tablesTableBody.appendChild(tr);
    });
  }

  function renderEventsTable(rows) {
    if (!eventsTableBody) return;

    eventsTableBody.innerHTML = "";

    const list = rows || cachedEvents;

    if (!list.length) {
      eventsTableBody.innerHTML = "<tr><td colspan='6'>No hay eventos registrados</td></tr>";
      return;
    }

    list.forEach(ev => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(ev.nombre || "—")}</td>
        <td>${escapeHtml(ev.tipo || "—")}</td>
        <td>${escapeHtml(normalizeDateForDisplay(ev.fecha_inicio))}</td>
        <td>${escapeHtml(ev.capacidad ?? "—")}</td>
        <td>${escapeHtml(formatCurrency(ev.precio_entrada || 0))}</td>
        <td>${escapeHtml(ev.estado || "—")}</td>
      `;
      eventsTableBody.appendChild(tr);
    });
  }

  function renderReservationsTable(rows) {
    if (!reservationsTableBody) return;

    reservationsTableBody.innerHTML = "";

    const list = rows || cachedReservations;

    if (!list.length) {
      reservationsTableBody.innerHTML = "<tr><td colspan='8'>No hay reservas registradas</td></tr>";
      return;
    }

    list.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.evento_nombre || "—")}</td>
        <td>${escapeHtml(r.cliente_vip_nombre || r.cliente_nombre || "—")}</td>
        <td>${escapeHtml(r.mesa_numero || r.numero_mesa || "—")}</td>
        <td>${escapeHtml(r.cantidad_personas || "—")}</td>
        <td>${escapeHtml(formatCurrency(r.monto_reserva || 0))}</td>
        <td>${escapeHtml(r.estado || "—")}</td>
        <td>${escapeHtml(normalizeDateForDisplay(r.created_at))}</td>
        <td>
          <button class="btn-outline btn-res-edit" data-id="${escapeHtml(r.id)}" type="button">Editar</button>
          <button class="btn-outline btn-res-status" data-id="${escapeHtml(r.id)}" data-status="confirmada" type="button">Confirmar</button>
          <button class="btn-outline btn-res-status" data-id="${escapeHtml(r.id)}" data-status="cancelada" type="button">Cancelar</button>
          <button class="btn-outline btn-res-delete" data-id="${escapeHtml(r.id)}" type="button">Eliminar</button>
        </td>
      `;
      reservationsTableBody.appendChild(tr);
    });

    document.querySelectorAll(".btn-res-status").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const status = btn.getAttribute("data-status");

        try {
          const result = await Model.updateReservationStatus(id, status);
          if (!result.ok) {
            Swal?.fire?.("Error", result.message || "No se pudo actualizar la reserva", "error");
            return;
          }

          Swal?.fire?.("Listo", "Estado de reserva actualizado.", "success");
          await refreshDashboardData();
        } catch (err) {
          console.error(err);
          Swal?.fire?.("Error", "No se pudo actualizar la reserva.", "error");
        }
      });
    });

    document.querySelectorAll(".btn-res-edit").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        const reservation = cachedReservations.find(r => String(r.id) === String(id));
        if (!reservation) return;

        await openEditReservationModal(reservation);
      });
    });

    document.querySelectorAll(".btn-res-delete").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-id");
        await handleDeleteReservation(id);
      });
    });
  }

  function applyEventFilter(term) {
    const q = String(term || "").toLowerCase().trim();

    if (!q) {
      renderEventsTable(cachedEvents);
      return;
    }

    const filtered = cachedEvents.filter(ev =>
      String(ev.nombre || "").toLowerCase().includes(q) ||
      String(ev.tipo || "").toLowerCase().includes(q) ||
      String(ev.estado || "").toLowerCase().includes(q)
    );

    renderEventsTable(filtered);
  }

  function applyTableFilter(term) {
    const q = String(term || "").toLowerCase().trim();

    if (!q) {
      renderTablesTable(cachedTables);
      return;
    }

    const filtered = cachedTables.filter(m =>
      String(m.numero || "").toLowerCase().includes(q) ||
      String(m.estado || "").toLowerCase().includes(q) ||
      String(m.descripcion || "").toLowerCase().includes(q)
    );

    renderTablesTable(filtered);
  }

  function applyReservationFilter(term) {
    const q = String(term || "").toLowerCase().trim();

    if (!q) {
      renderReservationsTable(cachedReservations);
      return;
    }

    const filtered = cachedReservations.filter(r =>
      String(r.evento_nombre || "").toLowerCase().includes(q) ||
      String(r.cliente_nombre || "").toLowerCase().includes(q) ||
      String(r.cliente_vip_nombre || "").toLowerCase().includes(q) ||
      String(r.mesa_numero || "").toLowerCase().includes(q) ||
      String(r.estado || "").toLowerCase().includes(q)
    );

    renderReservationsTable(filtered);
  }

  async function loadAvailableTablesForSelectedEvent() {
    if (!eventSelect || !mesaSelect || !peopleCount) return;

    mesaSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona una mesa";
    mesaSelect.appendChild(placeholder);

    if (!eventSelect.value) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Primero selecciona un evento";
      mesaSelect.appendChild(opt);
      return;
    }

    const neededPeople = Number(peopleCount.value || 1);

    try {
      const result = await Model.loadAvailableTablesForEvent(eventSelect.value, neededPeople);
      const tables = result?.tables || [];

      if (!tables.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No hay mesas disponibles";
        mesaSelect.appendChild(opt);
        return;
      }

      tables.forEach(mesa => {
        const opt = document.createElement("option");
        opt.value = mesa.id;
        opt.textContent = `Mesa ${mesa.numero} · Capacidad ${mesa.capacidad}`;
        mesaSelect.appendChild(opt);
      });
    } catch (err) {
      console.error("Error cargando mesas disponibles:", err);
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Error cargando mesas";
      mesaSelect.appendChild(opt);
    }
  }

  function toggleMesaWrapper() {
    if (!mesaWrapper || !reservationType) return;

    const showMesaMode = reservationType.value === "mesa";
    mesaWrapper.style.display = showMesaMode ? "flex" : "none";

    const autoTableWrapper = document.getElementById("autoTableWrapper");
    if (autoTableWrapper) {
      autoTableWrapper.style.display = showMesaMode ? "flex" : "none";
    }

    if (!showMesaMode && mesaSelect) {
      mesaSelect.value = "";
    }
  }

  function fillEventResponsibleFromVip(vipId) {
    const vip = cachedVip.find(v => String(v.id) === String(vipId)) || null;
    if (!vip) return;

    const nombre = document.getElementById("eventResponsableNombre");
    const telefono = document.getElementById("eventResponsableTelefono");
    const email = document.getElementById("eventResponsableEmail");
    const identificacion = document.getElementById("eventResponsableIdentificacion");
    const direccion = document.getElementById("eventResponsableDireccion");

    if (nombre && !nombre.value.trim()) nombre.value = vip.nombre || "";
    if (telefono && !telefono.value.trim()) telefono.value = vip.telefono || "";
    if (email && !email.value.trim()) email.value = vip.email || "";
    if (identificacion && !identificacion.value.trim()) identificacion.value = vip.identificacion || "";
    if (direccion && !direccion.value.trim()) direccion.value = vip.direccion || "";
  }

  function collectResponsiblePayload() {
    const responsableNombre = document.getElementById("eventResponsableNombre")?.value?.trim() || "";
    const responsableTelefono = document.getElementById("eventResponsableTelefono")?.value?.trim() || "";
    const responsableEmail = document.getElementById("eventResponsableEmail")?.value?.trim() || "";
    const responsableIdentificacion = document.getElementById("eventResponsableIdentificacion")?.value?.trim() || "";
    const responsableDireccion = document.getElementById("eventResponsableDireccion")?.value?.trim() || "";

    return {
      responsable_nombre: hasText(responsableNombre) ? responsableNombre : null,
      responsable_telefono: hasText(responsableTelefono) ? responsableTelefono : null,
      responsable_email: hasText(responsableEmail) ? responsableEmail : null,
      responsable_identificacion: hasText(responsableIdentificacion) ? responsableIdentificacion : null,
      responsable_direccion: hasText(responsableDireccion) ? responsableDireccion : null
    };
  }

  function getReservationFormValues() {
    return {
      evento_id: eventSelect ? eventSelect.value : "",
      cliente_vip_id: vipSelect ? vipSelect.value : "",
      cliente_nombre: clientName ? clientName.value.trim() : "",
      cliente_telefono: clientPhone ? clientPhone.value.trim() : "",
      cliente_email: clientEmail ? clientEmail.value.trim() : "",
      cliente_identificacion: clientIdentification ? clientIdentification.value.trim() : "",
      cliente_direccion: clientAddress ? clientAddress.value.trim() : "",
      cantidad_personas: peopleCount ? Number(peopleCount.value || 1) : 1,
      monto_reserva: reservationAmount ? Number(reservationAmount.value || 0) : 0,
      observacion: reservationNote ? reservationNote.value.trim() : "",
      use_auto_table: useAutoTable ? useAutoTable.value === "1" : true,
      mesa_id: mesaSelect ? mesaSelect.value : ""
    };
  }

  async function refreshDashboardData() {
    const [eventsRes, tablesRes, reservationsRes, vipRes] = await Promise.allSettled([
      Model.loadEvents(),
      Model.loadTables(),
      Model.loadReservations(),
      Model.loadVipClients()
    ]);

    cachedEvents = eventsRes.status === "fulfilled" ? (eventsRes.value || []) : [];
    cachedTables = tablesRes.status === "fulfilled" ? (tablesRes.value || []) : [];
    cachedReservations = reservationsRes.status === "fulfilled" ? (reservationsRes.value || []) : [];
    cachedVip = vipRes.status === "fulfilled" ? (vipRes.value || []) : [];

    if (eventsRes.status === "rejected") console.error("Error cargando eventos:", eventsRes.reason);
    if (tablesRes.status === "rejected") console.error("Error cargando mesas:", tablesRes.reason);
    if (reservationsRes.status === "rejected") console.error("Error cargando reservas:", reservationsRes.reason);
    if (vipRes.status === "rejected") console.error("Error cargando clientes VIP:", vipRes.reason);

    renderEventsSelect();
    renderVipSelect();
    renderEventsTable();
    renderTablesTable();
    renderReservationsTable();
    renderEventTypes();

    const counts = Model.getSummaryCounts();

    if (statEventsEl) statEventsEl.textContent = counts.activeEvents;
    if (statPendingEl) statPendingEl.textContent = counts.pending;
    if (statConfirmedEl) statConfirmedEl.textContent = counts.confirmed;
    if (statAvailableTablesEl) statAvailableTablesEl.textContent = counts.availableTables;

    if (reservationType?.value === "mesa") {
      await loadAvailableTablesForSelectedEvent();
    }
  }

  async function handleCreateEvent() {
    const nombre = document.getElementById("eventNombre")?.value?.trim() || "";
    const tipo = document.getElementById("eventTipo")?.value || "evento_con_entrada";
    const descripcion = document.getElementById("eventDescripcion")?.value?.trim() || null;
    const fechaInicioRaw = document.getElementById("eventFechaInicio")?.value || "";
    const fechaFinRaw = document.getElementById("eventFechaFin")?.value || "";
    const capacidad = Number(document.getElementById("eventCapacidad")?.value || 0);
    const precioEntrada = Number(document.getElementById("eventPrecio")?.value || 0);
    const estado = document.getElementById("eventEstado")?.value || "programado";
    const requiereReservacion = document.getElementById("eventRequiereReservacion")?.value === "1";
    const esGratuito = document.getElementById("eventEsGratuito")?.value === "1";
    const entradaGratis = document.getElementById("eventEntradaGratis")?.value === "1";

    const responsableVipId = document.getElementById("eventResponsableVip")?.value || "";
    const responsablePayload = collectResponsiblePayload();

    if (!hasText(nombre)) {
      Swal?.fire?.("Falta nombre", "Escribe el nombre del evento.", "warning");
      return;
    }

    if (!hasText(fechaInicioRaw)) {
      Swal?.fire?.("Falta fecha", "Selecciona la fecha de inicio.", "warning");
      return;
    }

    const fechaInicioISO = toIsoFromDatetimeLocal(fechaInicioRaw);
    const fechaFinISO = fechaFinRaw ? toIsoFromDatetimeLocal(fechaFinRaw) : null;

    if (!fechaInicioISO) {
      Swal?.fire?.("Fecha inválida", "La fecha de inicio no es válida.", "warning");
      return;
    }

    if (fechaFinRaw && !fechaFinISO) {
      Swal?.fire?.("Fecha inválida", "La fecha de fin no es válida.", "warning");
      return;
    }

    try {
      const currentUser = Model.getCurrentUser();
      const result = await Model.createEvent({
        nombre,
        tipo,
        descripcion,
        fecha_inicio: fechaInicioISO,
        fecha_fin: fechaFinISO,
        capacidad,
        precio_entrada: precioEntrada,
        estado,
        requiere_reservacion: requiereReservacion,
        es_gratuito: esGratuito,
        entrada_gratis: entradaGratis,
        responsable_vip_id: hasText(responsableVipId) ? responsableVipId : null,
        responsable_nombre: responsablePayload.responsable_nombre,
        responsable_telefono: responsablePayload.responsable_telefono,
        responsable_email: responsablePayload.responsable_email,
        responsable_identificacion: responsablePayload.responsable_identificacion,
        responsable_direccion: responsablePayload.responsable_direccion,
        creado_por_usuario_id: currentUser?.id || null
      });

      if (!result.ok) {
        Swal?.fire?.("Error", result.message || "No se pudo crear el evento.", "error");
        return;
      }

      Swal?.fire?.("Listo", "Evento creado correctamente.", "success");

      const eventForm = document.getElementById("eventForm");
      if (eventForm) eventForm.reset();

      const eventTipo = document.getElementById("eventTipo");
      const eventEstado = document.getElementById("eventEstado");
      const eventRequiereReservacion = document.getElementById("eventRequiereReservacion");
      const eventEsGratuito = document.getElementById("eventEsGratuito");
      const eventEntradaGratis = document.getElementById("eventEntradaGratis");
      const eventResponsableVip = document.getElementById("eventResponsableVip");

      if (eventTipo) eventTipo.value = "evento_con_entrada";
      if (eventEstado) eventEstado.value = "programado";
      if (eventRequiereReservacion) eventRequiereReservacion.value = "0";
      if (eventEsGratuito) eventEsGratuito.value = "0";
      if (eventEntradaGratis) eventEntradaGratis.value = "1";
      if (eventResponsableVip) eventResponsableVip.value = "";

      await refreshDashboardData();
    } catch (err) {
      console.error("Error creando evento:", err);
      Swal?.fire?.("Error", err.message || "No se pudo crear el evento.", "error");
    }
  }

  function bindEventForm() {
    const eventForm = document.getElementById("eventForm");
    const btnClearEvent = document.getElementById("btnClearEvent");
    const eventResponsableVip = document.getElementById("eventResponsableVip");

    if (!eventForm) return;

    eventForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleCreateEvent();
    });

    if (btnClearEvent) {
      btnClearEvent.addEventListener("click", () => {
        eventForm.reset();

        const eventTipo = document.getElementById("eventTipo");
        const eventEstado = document.getElementById("eventEstado");
        const eventRequiereReservacion = document.getElementById("eventRequiereReservacion");
        const eventEsGratuito = document.getElementById("eventEsGratuito");
        const eventEntradaGratis = document.getElementById("eventEntradaGratis");
        const eventResponsableVip = document.getElementById("eventResponsableVip");

        if (eventTipo) eventTipo.value = "evento_con_entrada";
        if (eventEstado) eventEstado.value = "programado";
        if (eventRequiereReservacion) eventRequiereReservacion.value = "0";
        if (eventEsGratuito) eventEsGratuito.value = "0";
        if (eventEntradaGratis) eventEntradaGratis.value = "1";
        if (eventResponsableVip) eventResponsableVip.value = "";
      });
    }

    if (eventResponsableVip) {
      eventResponsableVip.addEventListener("change", () => {
        if (eventResponsableVip.value) {
          fillEventResponsibleFromVip(eventResponsableVip.value);
        }
      });
    }
  }

  function clearReservationForm() {
    if (reservationType) reservationType.value = "evento";
    if (eventSelect) eventSelect.value = "";
    if (mesaSelect) mesaSelect.value = "";
    if (vipSelect) vipSelect.value = "";
    if (peopleCount) peopleCount.value = 1;
    if (reservationAmount) reservationAmount.value = 0;
    if (useAutoTable) useAutoTable.value = "1";
    if (clientName) clientName.value = "";
    if (clientPhone) clientPhone.value = "";
    if (clientEmail) clientEmail.value = "";
    if (clientIdentification) clientIdentification.value = "";
    if (clientAddress) clientAddress.value = "";
    if (reservationNote) reservationNote.value = "";
    toggleMesaWrapper();
  }

  async function handleCreateReservation() {
    const values = getReservationFormValues();
    const tipo = reservationType ? reservationType.value : "evento";

    if (!values.evento_id) {
      Swal?.fire?.("Falta evento", "Selecciona un evento.", "warning");
      return;
    }

    if (!values.cliente_nombre && !values.cliente_vip_id) {
      Swal?.fire?.("Falta cliente", "Escribe el nombre o selecciona un cliente VIP.", "warning");
      return;
    }

    try {
      let result;

      if (tipo === "mesa") {
        if (!values.use_auto_table && !values.mesa_id) {
          Swal?.fire?.("Falta mesa", "Selecciona una mesa o usa asignación automática.", "warning");
          return;
        }

        result = await Model.createTableReservation({
          evento_id: values.evento_id,
          mesa_id: values.mesa_id || null,
          use_auto_table: values.use_auto_table,
          cliente_vip_id: values.cliente_vip_id || null,
          cliente_nombre: values.cliente_nombre,
          cliente_telefono: values.cliente_telefono,
          cliente_email: values.cliente_email,
          cliente_identificacion: values.cliente_identificacion,
          cliente_direccion: values.cliente_direccion,
          cantidad_personas: values.cantidad_personas,
          monto_reserva: values.monto_reserva,
          observacion: values.observacion
        });
      } else {
        result = await Model.createEventReservation({
          evento_id: values.evento_id,
          cliente_vip_id: values.cliente_vip_id || null,
          cliente_nombre: values.cliente_nombre,
          cliente_telefono: values.cliente_telefono,
          cliente_email: values.cliente_email,
          cliente_identificacion: values.cliente_identificacion,
          cliente_direccion: values.cliente_direccion,
          cantidad_personas: values.cantidad_personas,
          monto_reserva: values.monto_reserva,
          observacion: values.observacion
        });
      }

      if (!result.ok) {
        Swal?.fire?.("Error", result.message || "No se pudo crear la reserva", "error");
        return;
      }

      Swal?.fire?.("Listo", "Reserva creada correctamente.", "success");
      clearReservationForm();
      await refreshDashboardData();
    } catch (err) {
      console.error("Error creando reserva:", err);
      Swal?.fire?.("Error", err.message || "No se pudo crear la reserva.", "error");
    }
  }

  async function openEditReservationModal(reservation) {
    const vipOptions = [
      `<option value="">Sin cliente VIP</option>`,
      ...cachedVip.map(v => `<option value="${escapeHtml(v.id)}" ${String(v.id) === String(reservation.cliente_vip_id) ? "selected" : ""}>${escapeHtml(v.nombre)}</option>`)
    ].join("");

    const result = await Swal.fire({
      title: "Editar reserva",
      width: 750,
      showCancelButton: true,
      confirmButtonText: "Guardar cambios",
      cancelButtonText: "Cancelar",
      html: `
        <div style="text-align:left; display:grid; gap:10px;">
          <div>
            <label>Cliente VIP</label>
            <select id="editVip" class="swal2-input" style="width:100%">${vipOptions}</select>
          </div>

          <div>
            <label>Nombre del cliente</label>
            <input id="editClientName" class="swal2-input" value="${escapeHtml(reservation.cliente_nombre || "")}">
          </div>

          <div>
            <label>Teléfono</label>
            <input id="editClientPhone" class="swal2-input" value="${escapeHtml(reservation.cliente_telefono || "")}">
          </div>

          <div>
            <label>Email</label>
            <input id="editClientEmail" class="swal2-input" value="${escapeHtml(reservation.cliente_email || "")}">
          </div>

          <div>
            <label>Identificación</label>
            <input id="editClientId" class="swal2-input" value="${escapeHtml(reservation.cliente_identificacion || "")}">
          </div>

          <div>
            <label>Dirección</label>
            <textarea id="editClientAddress" class="swal2-textarea" rows="3">${escapeHtml(reservation.cliente_direccion || "")}</textarea>
          </div>

          <div style="display:flex; gap:10px;">
            <div style="flex:1;">
              <label>Personas</label>
              <input id="editPeople" type="number" min="1" class="swal2-input" value="${Number(reservation.cantidad_personas || 1)}">
            </div>
            <div style="flex:1;">
              <label>Monto</label>
              <input id="editAmount" type="number" min="0" step="0.01" class="swal2-input" value="${Number(reservation.monto_reserva || 0)}">
            </div>
          </div>

          <div>
            <label>Estado</label>
            <select id="editStatus" class="swal2-input" style="width:100%;">
              <option value="pendiente" ${String(reservation.estado) === "pendiente" ? "selected" : ""}>Pendiente</option>
              <option value="confirmada" ${String(reservation.estado) === "confirmada" ? "selected" : ""}>Confirmada</option>
              <option value="cancelada" ${String(reservation.estado) === "cancelada" ? "selected" : ""}>Cancelada</option>
              <option value="finalizada" ${String(reservation.estado) === "finalizada" ? "selected" : ""}>Finalizada</option>
            </select>
          </div>

          <div>
            <label>Observación</label>
            <textarea id="editNote" class="swal2-textarea" rows="4">${escapeHtml(reservation.observacion || "")}</textarea>
          </div>
        </div>
      `,
      didOpen: () => {
        const vipSelect = document.getElementById("editVip");
        if (vipSelect) vipSelect.style.width = "100%";
      },
      preConfirm: () => {
        return {
          cliente_vip_id: document.getElementById("editVip")?.value || null,
          cliente_nombre: document.getElementById("editClientName")?.value.trim() || "",
          cliente_telefono: document.getElementById("editClientPhone")?.value.trim() || "",
          cliente_email: document.getElementById("editClientEmail")?.value.trim() || "",
          cliente_identificacion: document.getElementById("editClientId")?.value.trim() || "",
          cliente_direccion: document.getElementById("editClientAddress")?.value.trim() || "",
          cantidad_personas: Number(document.getElementById("editPeople")?.value || 1),
          monto_reserva: Number(document.getElementById("editAmount")?.value || 0),
          estado: document.getElementById("editStatus")?.value || "pendiente",
          observacion: document.getElementById("editNote")?.value.trim() || ""
        };
      }
    });

    if (!result.isConfirmed || !result.value) return;

    try {
      const updateResult = await Model.updateReservation(reservation.id, result.value);

      if (!updateResult.ok) {
        Swal?.fire?.("Error", updateResult.message || "No se pudo editar la reserva.", "error");
        return;
      }

      Swal?.fire?.("Listo", "Reserva actualizada correctamente.", "success");
      await refreshDashboardData();
    } catch (err) {
      console.error("Error actualizando reserva:", err);
      Swal?.fire?.("Error", err.message || "No se pudo actualizar la reserva.", "error");
    }
  }

  async function handleDeleteReservation(reservationId) {
    const confirmResult = await Swal.fire({
      title: "Eliminar reserva",
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });

    if (!confirmResult.isConfirmed) return;

    try {
      const result = await Model.deleteReservation(reservationId);
      if (!result.ok) {
        Swal?.fire?.("Error", result.message || "No se pudo eliminar la reserva.", "error");
        return;
      }

      Swal?.fire?.("Listo", "Reserva eliminada correctamente.", "success");
      await refreshDashboardData();
    } catch (err) {
      console.error("Error eliminando reserva:", err);
      Swal?.fire?.("Error", err.message || "No se pudo eliminar la reserva.", "error");
    }
  }

  function bindUI() {
    if (reservationType) {
      reservationType.addEventListener("change", async () => {
        toggleMesaWrapper();
        if (reservationType.value === "mesa") {
          await loadAvailableTablesForSelectedEvent();
        } else {
          if (mesaSelect) mesaSelect.value = "";
        }
      });
    }

    if (eventSelect) {
      eventSelect.addEventListener("change", loadAvailableTablesForSelectedEvent);
    }

    if (peopleCount) {
      peopleCount.addEventListener("change", loadAvailableTablesForSelectedEvent);
    }

    if (vipSelect) {
      vipSelect.addEventListener("change", () => {
        if (vipSelect.value) {
          const vip = cachedVip.find(v => String(v.id) === String(vipSelect.value));
          if (vip) {
            if (clientName && !clientName.value.trim()) clientName.value = vip.nombre || "";
            if (clientPhone && !clientPhone.value.trim()) clientPhone.value = vip.telefono || "";
            if (clientEmail && !clientEmail.value.trim()) clientEmail.value = vip.email || "";
            if (clientIdentification && !clientIdentification.value.trim()) clientIdentification.value = vip.identificacion || "";
            if (clientAddress && !clientAddress.value.trim()) clientAddress.value = vip.direccion || "";
          }
        }
      });
    }

    if (reservationForm) {
      reservationForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleCreateReservation();
      });
    } else if (btnCreateReservation) {
      btnCreateReservation.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleCreateReservation();
      });
    }

    if (btnClearReservationForm) {
      btnClearReservationForm.addEventListener("click", clearReservationForm);
    }

    if (btnRefreshVip) {
      btnRefreshVip.addEventListener("click", async () => {
        cachedVip = await Model.loadVipClients();
        renderVipSelect();
      });
    }

    if (btnRefreshReservations) {
      btnRefreshReservations.addEventListener("click", refreshDashboardData);
    }

    if (eventSearch) {
      eventSearch.addEventListener("input", () => applyEventFilter(eventSearch.value));
    }

    if (tableSearch) {
      tableSearch.addEventListener("input", () => applyTableFilter(tableSearch.value));
    }

    if (reservationSearch) {
      reservationSearch.addEventListener("input", () => applyReservationFilter(reservationSearch.value));
    }

    toggleMesaWrapper();
  }

  async function saveMesaFromForm() {
    const mesaNumero = document.getElementById("mesaNumero");
    const mesaCapacidad = document.getElementById("mesaCapacidad");
    const mesaEstado = document.getElementById("mesaEstado");
    const mesaDescripcion = document.getElementById("mesaDescripcion");

    const numero = mesaNumero?.value?.trim() || "";
    const capacidad = Number(mesaCapacidad?.value || 4);
    const estado = mesaEstado?.value || "disponible";
    const descripcion = mesaDescripcion?.value?.trim() || null;

    if (!numero) {
      Swal?.fire?.("Falta número", "El número de mesa es obligatorio.", "warning");
      return;
    }

    try {
      const result = await Model.createMesa({
        numero,
        capacidad,
        estado,
        descripcion
      });

      if (!result.ok) {
        Swal?.fire?.("Error", result.message || "No se pudo crear la mesa.", "error");
        return;
      }

      Swal?.fire?.("Listo", "Mesa creada correctamente.", "success");

      if (mesaNumero) mesaNumero.value = "";
      if (mesaCapacidad) mesaCapacidad.value = 4;
      if (mesaEstado) mesaEstado.value = "disponible";
      if (mesaDescripcion) mesaDescripcion.value = "";

      await refreshDashboardData();
    } catch (err) {
      console.error("Error creando mesa:", err);
      Swal?.fire?.("Error", err.message || "No se pudo crear la mesa.", "error");
    }
  }

  function bindMesaForm() {
    const mesaForm = document.getElementById("mesaForm");
    const btnCreateTable = document.getElementById("btnCreateMesa");
    const btnClearMesa = document.getElementById("btnClearMesa");

    if (!mesaForm) return;

    mesaForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await saveMesaFromForm();
    });

    if (btnCreateTable) {
      btnCreateTable.type = "button";
      btnCreateTable.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await saveMesaFromForm();
      });
    }

    if (btnClearMesa) {
      btnClearMesa.addEventListener("click", () => {
        const mesaNumero = document.getElementById("mesaNumero");
        const mesaCapacidad = document.getElementById("mesaCapacidad");
        const mesaEstado = document.getElementById("mesaEstado");
        const mesaDescripcion = document.getElementById("mesaDescripcion");

        if (mesaNumero) mesaNumero.value = "";
        if (mesaCapacidad) mesaCapacidad.value = 4;
        if (mesaEstado) mesaEstado.value = "disponible";
        if (mesaDescripcion) mesaDescripcion.value = "";
      });
    }
  }

  async function setupCreateTableSectionIfMissing() {
    const tablesSectionExists = document.getElementById("mesaForm") || document.getElementById("tablesTable");

    if (!tablesSectionExists) {
      const dashboard = document.querySelector(".dashboard");
      if (!dashboard) return;

      const section = document.createElement("section");
      section.className = "table-container";
      section.style.marginBottom = "20px";
      section.id = "mesaFormSection";
      section.innerHTML = `
        <h3>Agregar mesa</h3>
        <form id="mesaForm" style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
          <div class="product-select-wrapper">
            <label for="mesaNumero">Número de mesa</label>
            <input id="mesaNumero" type="text" placeholder="Ej: 1, A-3, VIP-2">
          </div>

          <div class="qty-wrapper">
            <label for="mesaCapacidad">Capacidad</label>
            <input id="mesaCapacidad" type="number" min="1" value="4">
          </div>

          <div class="product-select-wrapper">
            <label for="mesaEstado">Estado</label>
            <select id="mesaEstado">
              <option value="disponible">Disponible</option>
              <option value="reservada">Reservada</option>
              <option value="ocupada">Ocupada</option>
              <option value="mantenimiento">Mantenimiento</option>
            </select>
          </div>

          <div class="product-select-wrapper" style="flex:1; min-width:260px;">
            <label for="mesaDescripcion">Descripción</label>
            <input id="mesaDescripcion" type="text" placeholder="Descripción opcional">
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="btnCreateMesa" class="btn-primary" type="button">Guardar mesa</button>
            <button id="btnClearMesa" class="btn-outline" type="button">Limpiar</button>
          </div>
        </form>
      `;

      dashboard.insertBefore(section, dashboard.children[2] || null);
    }

    bindMesaForm();
  }

  async function safeLogout(reason = "manual") {
    try {
      console.warn("Cerrando sesión:", reason);

      if (Auth && typeof Auth.signOut === "function") {
        await Auth.signOut({ redirect: true });
      } else if (window.supabase?.auth?.signOut) {
        await window.supabase.auth.signOut();
        window.location.replace("index.html");
      }
    } catch (err) {
      console.error("Error en safeLogout:", err);
    }
  }

  async function bootstrapUser() {
    const currentUser = await Model.bootstrapAuth();
    if (!currentUser) return null;

    Model.setCurrentUser(currentUser);
    currentRole = normalizeRole(currentUser?.role || "");

    applyMenuRoles(currentRole);
    return currentUser;
  }

  async function boot() {
    try {
      setupMenu();
      setupQr();
      bindUI();
      renderEventTypes();
      ensureEventFormSection();
      bindEventForm();
      await setupCreateTableSectionIfMissing();

      if (logoutBtn) {
        logoutBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          await safeLogout("manual");
        });
      }

      const currentUser = await bootstrapUser();

      if (!currentUser) {
        window.location.replace("index.html");
        return;
      }

      if (!canAccessModule(currentRole)) {
        await safeLogout("not-authorized");
        return;
      }

      await refreshDashboardData();
      toggleMesaWrapper();
    } catch (err) {
      console.error("Error inicializando reservas:", err);
      Swal?.fire?.("Error", "No se pudo inicializar el módulo de reservas.", "error");
    }
  }

  document.addEventListener("DOMContentLoaded", boot);

  global.ReservasController = {
    boot,
    refreshDashboardData,
    renderEventTypes
  };
})(window);