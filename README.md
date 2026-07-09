# CONTROL-ACCESO

Sistema web para la gestión de **control de acceso, asistencia, inventario, reservas y métricas de satisfacción**, desarrollado con una arquitectura modular basada en JavaScript y servicios Backend-as-a-Service (BaaS).

---

## Características

- Control de acceso de empleados.
- Gestión de asistencia.
- Administración de inventario.
- Gestión de reservas.
- Encuestas y métricas de satisfacción.
- Panel administrativo.
- Gestión de roles y permisos.
- Arquitectura modular basada en un patrón MVC ligero.
- Integración con Supabase y Firebase.

---

# Tecnologías

| Tecnología | Uso |
|------------|-----|
| HTML5 | Estructura de la aplicación |
| CSS3 | Diseño y estilos |
| JavaScript (ES6+) | Lógica del cliente |
| Supabase | Base de datos, autenticación y funciones |
| Firebase | Integraciones complementarias |
| Git | Control de versiones |
| npm | Gestión de dependencias |
| Deno | Ejecución de funciones serverless |

---

# Arquitectura

El proyecto utiliza una arquitectura modular inspirada en el patrón **MVC (Model–View–Controller)**.

- **Views**
  - Páginas HTML.

- **Controllers**
  - Gestionan la interacción del usuario.
  - Coordinan la comunicación entre la vista y los modelos.

- **Models**
  - Encapsulan el acceso a datos.
  - Manejan las operaciones sobre Supabase/Firebase.

Esta separación facilita el mantenimiento, la escalabilidad y la reutilización del código.

---

# Estructura del proyecto

```text
CONTROL-ACCESO/
│
├── public/
│   ├── css/
│   │   ├── app.css
│   │   └── styles.css
│   │
│   ├── js/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── auth.js
│   │   ├── roles.js
│   │   └── supabase-config.js
│   │
│   ├── dashboard.html
│   ├── employee.html
│   ├── inventory.html
│   ├── register.html
│   ├── reservas.html
│   ├── sales.html
│   ├── encuesta_satisfaccion.html
│   └── ...
│
├── supabase/
│   ├── functions/
│   ├── migrations/
│   └── config.toml
│
├── firebase.json
├── firestore.rules
├── deno.json
├── package.json
└── README.md
```

---

# Organización de directorios

| Directorio | Descripción |
|------------|-------------|
| `public/css` | Hojas de estilo de la aplicación. |
| `public/js/controllers` | Controladores responsables de la lógica de cada módulo. |
| `public/js/models` | Modelos y acceso a datos. |
| `public/js` | Configuración y utilidades generales. |
| `public` | Vistas HTML del sistema. |
| `supabase` | Funciones, migraciones y configuración de Supabase. |
| `firebase.json` | Configuración del proyecto Firebase. |
| `firestore.rules` | Reglas de seguridad de Firestore. |

---

# Requisitos

- Node.js 18 o superior
- npm
- Cuenta de Supabase
- Proyecto Firebase (opcional, según la configuración utilizada)

---

# Variables de entorno

Crear un archivo `.env` con las siguientes variables:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=

FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
```

> No almacene credenciales sensibles directamente en el código fuente.

---

# Instalación

Clonar el repositorio:

```bash
git clone https://github.com/tu-usuario/CONTROL-ACCESO.git

cd CONTROL-ACCESO
```

Instalar dependencias:

```bash
npm install
```

Configurar las variables de entorno.

---

# Ejecución local

Con **http-server**:

```bash
npx http-server public -p 8080
```

o con **Live Server**:

```bash
npx live-server public
```

Abrir en el navegador:

```text
http://localhost:8080/index.html
```

---

# Verificación

Se recomienda realizar las siguientes comprobaciones:

- Verificar que todas las páginas HTML cargan correctamente.
- Comprobar que no existan errores en la consola del navegador.
- Validar el proceso de autenticación.
- Confirmar la conexión con Supabase.
- Verificar el funcionamiento de las funciones serverless.
- Comprobar la correcta aplicación de las reglas de seguridad de Firebase (si se utilizan).

---

# Módulos principales

- Autenticación
- Dashboard
- Control de acceso
- Gestión de empleados
- Inventario
- Reservas
- Ventas
- Encuestas de satisfacción
- Administración de roles

---

# Seguridad

El proyecto implementa medidas de seguridad mediante:

- Reglas de seguridad en Firebase.
- Políticas de acceso en Supabase.
- Gestión de roles y permisos.
- Separación entre lógica de presentación y acceso a datos.

