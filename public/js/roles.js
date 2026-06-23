// js/roles.js
(function (global) {
  "use strict";

  const ROLES = Object.freeze({
    ADMIN: "admin",
    GERENTE: "gerente",
    BARRA: "barra",
    BODEGA: "bodega",
    PENDIENTE: "pendiente",
    EMPLEADO: "empleado"
  });

  const ROLE_LABELS = Object.freeze({
    [ROLES.ADMIN]: "Administrador",
    [ROLES.GERENTE]: "Gerente",
    [ROLES.BARRA]: "Personal de barra",
    [ROLES.BODEGA]: "Personal de bodega",
    [ROLES.EMPLEADO]: "Empleado",
    [ROLES.PENDIENTE]: "Pendiente"
  });

  const ROLE_ALIASES = Object.freeze({
    administrador: ROLES.ADMIN,
    administrator: ROLES.ADMIN,
    superadmin: ROLES.ADMIN,
    "super administrador": ROLES.ADMIN,
    "super-administrador": ROLES.ADMIN,
    developer: ROLES.ADMIN,

    gerente: ROLES.GERENTE,
    manager: ROLES.GERENTE,

    cajero: ROLES.BARRA,
    cashier: ROLES.BARRA,
    empleado: ROLES.BARRA,
    employee: ROLES.BARRA,

    almacen: ROLES.BODEGA,
    almacenista: ROLES.BODEGA,
    "almacén": ROLES.BODEGA,
    warehouse: ROLES.BODEGA,

    pendiente: ROLES.PENDIENTE,
    pending: ROLES.PENDIENTE,
    empleado: ROLES.EMPLEADO
  });

  const MODULE_PERMISSIONS = Object.freeze({
    dashboard: [ROLES.ADMIN, ROLES.GERENTE],
    empleados: [ROLES.ADMIN, ROLES.GERENTE],
    jornadas: [ROLES.ADMIN, ROLES.GERENTE],
    perfil: [ROLES.ADMIN, ROLES.GERENTE],
    metricas: [ROLES.ADMIN, ROLES.GERENTE],
    planilla: [ROLES.ADMIN, ROLES.GERENTE],
    clientesVip: [ROLES.ADMIN, ROLES.GERENTE],
    reservas: [ROLES.ADMIN, ROLES.GERENTE],
    asistenciasAdmin: [ROLES.ADMIN, ROLES.GERENTE],

    asistencia: [ROLES.ADMIN, ROLES.GERENTE, ROLES.BARRA, ROLES.BODEGA],
    employee: [ROLES.ADMIN, ROLES.GERENTE, ROLES.BARRA, ROLES.BODEGA],

    inventory: [ROLES.ADMIN, ROLES.GERENTE, ROLES.BODEGA],
    inventario: [ROLES.ADMIN, ROLES.GERENTE, ROLES.BODEGA],

    sales: [ROLES.ADMIN, ROLES.GERENTE, ROLES.BARRA],
    ventas: [ROLES.ADMIN, ROLES.GERENTE, ROLES.BARRA],
    empleado: [ROLES.EMPLEADO]
  });

  const ASSIGNABLE_ROLES = Object.freeze([
    ROLES.ADMIN,
    ROLES.BARRA,
    ROLES.BODEGA,
    ROLES.PENDIENTE,
    ROLES.EMPLEADO
  ]);

  function normalizeRole(role) {
    const raw = String(role || "").trim().toLowerCase();
    return ROLE_ALIASES[raw] || raw;
  }

  function roleLabel(role) {
    const normalized = normalizeRole(role);
    return ROLE_LABELS[normalized] || (role ? String(role) : "Sin rol");
  }

  function can(role, moduleName) {
    const permissions = MODULE_PERMISSIONS[moduleName] || [];
    return permissions.includes(normalizeRole(role));
  }

  function isAdmin(role) {
    return normalizeRole(role) === ROLES.ADMIN;
  }

  function isAssignableRole(role) {
    return ASSIGNABLE_ROLES.includes(normalizeRole(role));
  }

  function isStaffRole(role) {
    const normalized = normalizeRole(role);
    return normalized === ROLES.BARRA || normalized === ROLES.BODEGA;
  }

  function isManageableUserRole(role) {
    const raw = String(role || "").trim().toLowerCase();
    const normalized = normalizeRole(raw);

    return (
      ASSIGNABLE_ROLES.includes(normalized) ||
      normalized === ROLES.GERENTE ||
      ["empleado", "cajero", "gerente", "manager"].includes(raw)
    );
  }

  function getRedirectByRole(role) {
    const normalized = normalizeRole(role);

    if (normalized === ROLES.ADMIN) return "dashboard.html";
    if (normalized === ROLES.GERENTE) return "dashboard.html";
    if (normalized === ROLES.BARRA) return "sales.html";
    if (normalized === ROLES.BODEGA) return "inventory.html";
    if (normalized === ROLES.EMPLEADO) return "employee.html";

    return "index.html";
  }

  function roleOptions() {
    return ASSIGNABLE_ROLES.map((value) => ({
      value,
      label: ROLE_LABELS[value]
    }));
  }

  global.RolePolicy = Object.freeze({
    ROLES,
    ROLE_LABELS,
    MODULE_PERMISSIONS,
    ASSIGNABLE_ROLES,
    normalizeRole,
    roleLabel,
    can,
    isAdmin,
    isAssignableRole,
    isStaffRole,
    isManageableUserRole,
    getRedirectByRole,
    roleOptions
  });
})(window);