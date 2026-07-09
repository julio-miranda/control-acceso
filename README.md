CONTROL-ACCESO
Descripción breve  
CONTROL-ACCESO es una aplicación web para la gestión de control de accesos, asistencia, inventario, reservas y métricas de satisfacción. Está organizada con una separación clara entre vistas HTML, lógica cliente en JavaScript (controladores y modelos) y configuración de servicios backend (Supabase y Firebase).

Tecnologías principales
Frontend: HTML, CSS, JavaScript

Arquitectura cliente: controladores y modelos en public/js (estilo MVC ligero)

Backend / BaaS: Supabase; integraciones con Firebase para autenticación y reglas Firestore según la estructura del proyecto

Herramientas: Git, npm / Deno según funciones, archivos de configuración (firebase.json, deno.json, config.toml)

Estructura del proyecto clave
Ruta principal

Código
CONTROL-ACCESO/
└─ public/
   ├─ css/
   │  ├─ app.css
   │  └─ styles.css
   ├─ js/
   │  ├─ controllers/
   │  ├─ models/
   │  ├─ auth.js
   │  ├─ supabase-config.js
   │  └─ roles.js
   └─ *.html  (dashboard, admin_*, employee, inventory, register, reservas, sales, encuesta_satisfaccion, 404, etc.)
Descripción rápida de carpetas

public/js/controllers  : lógica de interacción por página (login, dashboard, empleados, inventario, ventas, encuestas).

public/js/models       : acceso a datos y abstracciones (empleado, inventory, sales, reservas, etc.).

public/css             : estilos globales y específicos.

public/.html*          : vistas y páginas del panel administrativo y usuario.

supabase/              : funciones serverless, migraciones y configuración de Supabase.

firebase. y firestore.:** configuración y reglas para integraciones con Firebase.

Requisitos previos
Node.js y npm instalados para tareas de desarrollo y build.

Cuenta Supabase y/o Firebase con las credenciales necesarias.

Variables de entorno configuradas para claves y URLs de Supabase/Firebase.

Variables de entorno recomendadas

SUPABASE_URL

SUPABASE_ANON_KEY

FIREBASE_API_KEY

FIREBASE_AUTH_DOMAIN

FIREBASE_PROJECT_ID

Instalación y ejecución local
Clonar el repositorio

bash
git clone https://github.com/tu-usuario/CONTROL-ACCESO.git
cd CONTROL-ACCESO
Instalar dependencias (si aplica)

bash
npm install
Configurar variables de entorno

Crear archivo .env o configurar el sistema con las variables listadas arriba.

Verificar public/js/supabase-config.js o el archivo de configuración correspondiente para apuntar a SUPABASE_URL y SUPABASE_ANON_KEY.

Servir la carpeta public localmente (ejemplo con http-server)

bash
npx http-server public -p 8080
# o con live-server
npx live-server public
Abrir en el navegador

Código
http://localhost:8080/index.html
Pruebas y verificación rápida
Verificar enlaces: abrir cada HTML y comprobar que los controladores se cargan sin errores en consola.

Probar autenticación: crear un usuario de prueba en Supabase o Firebase y verificar login/register.

Ejecutar funciones serverless: si hay funciones en supabase/functions, desplegar o ejecutar localmente según la documentación de Supabase.
