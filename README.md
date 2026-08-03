# Soul and Body — Sistema de reservas

Aplicación web completa para **Soul and Body**, el centro estético de
Wendy de la Hoz en Envigado (Antioquia). Incluye la página pública con
un asistente de reserva real, un backend con persistencia en base de
datos y un panel de administración protegido.

---

## Características

- **Asistente de reserva en 4 pasos**: servicio → día y hora → datos → confirmación.
- **Disponibilidad real**: solo se ofrecen horarios libres; imposible reservar dos
  veces el mismo bloque (garantizado a nivel de base de datos).
- **Persistencia real** en SQLite (fácil de migrar a PostgreSQL).
- **Panel de administración** con login, métricas, filtros, búsqueda y cambio de
  estado de las citas.
- **Notificaciones por correo** a la clienta y al negocio (opcional, se activa con
  credenciales SMTP; el sistema funciona igual sin ellas).
- **Confirmación por WhatsApp** con mensaje prellenado (click-to-chat, sin costos).
- **Frontend desplegable a GitHub Pages** (HTML estático sin build).
- **Seguridad de nivel producción**: Helmet + CSP, CSRF, rate limiting, validación
  y saneamiento, consultas parametrizadas, bcrypt 12 rounds, JWT en cookies httpOnly,
  honeypot anti-bot.
- **WCAG 2.1 AA** en lo esencial: skip-link, contraste, ARIA, focus management.
- **SEO completo**: Open Graph, Twitter Card, JSON-LD `LocalBusiness`, geo meta,
  robots.txt, sitemap.xml, manifest.

---

## Stack

| Capa        | Tecnología                                                |
|-------------|-----------------------------------------------------------|
| Frontend    | HTML5 + CSS3 + ES Modules (sin frameworks, sin build)     |
| Backend     | Node 20 + Express 4                                       |
| Base datos  | SQLite (`better-sqlite3`) — precompilado, sin compilador   |
| Seguridad   | Helmet, express-rate-limit, express-validator, JWT, bcrypt|
| Correo      | Nodemailer (SMTP) opcional                                |
| Tests       | `node --test` + supertest                                 |
| Lint        | ESLint v9 flat config                                     |
| CI          | GitHub Actions (lint + test)                              |

> **¿Por qué SQLite?** Para un negocio de una sede es la opción más robusta y
> simple: cero servicios externos, cero configuración, respaldos = copiar un
> archivo. La capa de datos está aislada en `models/`, así que migrar a
> PostgreSQL más adelante es directo.

---

## Estructura del proyecto

```
soul-and-body_GR/
├── backend/                         # API + estáticos servidos por Express
│   ├── src/
│   │   ├── server.js                # arranque + apagado ordenado
│   │   ├── app.js                   # Express + Helmet + parsers + static
│   │   ├── api/index.js             # monta routers por dominio
│   │   ├── config/                  # .env + business.js (reglas del negocio)
│   │   ├── db/                      # conexión + migrate + seed (SQLite)
│   │   ├── lib/                     # asyncHandler, errors, format, time, http, logger
│   │   ├── middleware/              # auth, csrf, error, rateLimit, validate
│   │   └── domains/
│   │       ├── booking/             # cita + disponibilidad + modelo
│   │       ├── config/              # GET /api/config, GET /api/csrf-token
│   │       ├── auth/                # login admin
│   │       ├── admin/               # panel de citas
│   │       ├── customer/            # registro/login de clientas
│   │       └── notifications/       # email service (Nodemailer)
│   ├── test/                        # tests con node --test + supertest
│   ├── eslint.config.js
│   ├── .prettierrc.json
│   └── package.json
│
├── frontend/                        # estáticos, desplegable a GitHub Pages
│   ├── index.html, admin.html, 404.html
│   ├── robots.txt, sitemap.xml, manifest.webmanifest, .nojekyll
│   ├── legal/                       # privacidad.html, terminos.html
│   └── assets/
│       ├── css/                     # tokens.css, base.css, landing.css, booking.css, admin.css
│       ├── js/                      # core/, pages/, services/ (ES modules)
│       └── images/                  # logo.jpg (actuales; añadir SVG y WebP cuando se tengan)
│
├── database/
│   └── schema.sql                   # fuente única de la estructura
│
├── docs/
│   ├── DEPLOYMENT.md
│   └── TESTING.md
│
├── .github/workflows/ci.yml         # lint + test en push/PR
├── .editorconfig, .prettierrc.json, .gitignore
├── Iniciar Soul and Body.bat        # wrapper Windows para arrancar local
└── README.md
```

---

## Puesta en marcha (local)

### Requisitos
- Node.js 20 o superior.

### Pasos

```bash
cd backend

# 1) Instalar dependencias
npm install

# 2) Configurar variables de entorno
#    Copia la plantilla y edítala con tus valores.
cp .env.example .env

# 3) Crear la base de datos y el usuario administrador
npm run setup      # equivale a: npm run migrate && npm run seed

# 4) Arrancar
npm start          # http://localhost:3000
#    En desarrollo con recarga automática:
npm run dev
```

- Página pública: <http://localhost:3000/>
- Panel de administración: <http://localhost:3000/admin>

El usuario y la contraseña del panel se definen en `.env`
(`ADMIN_USERNAME` / `ADMIN_PASSWORD`) y se crean al ejecutar `npm run seed`.

### Comandos útiles

| Comando            | Descripción                                      |
|--------------------|--------------------------------------------------|
| `npm start`        | Arranca el servidor.                             |
| `npm run dev`      | Arranca con `--watch` (recarga al cambiar).      |
| `npm run migrate`  | Aplica el esquema de la BD (idempotente).        |
| `npm run seed`     | Crea el admin inicial (idempotente).             |
| `npm run setup`    | `migrate` + `seed`.                              |
| `npm test`         | Ejecuta los tests con `node --test`.             |
| `npm run lint`     | Pasa ESLint.                                     |
| `npm run format`   | Aplica Prettier.                                 |

---

## Despliegue

Ver [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) para la guía completa
(Render/Railway para el backend, GitHub Pages para el frontend, Gmail SMTP,
dominio y HTTPS).

### Resumen rápido

- **Backend** (Render, Railway, etc.): root `backend/`, build `npm install`,
  start `npm run setup && npm start`. Variables: las de `.env.example`.
  **Disco persistente** montado en `backend/data` para no perder la BD.
- **Frontend** (GitHub Pages): la carpeta `frontend/` se sube tal cual a Pages
  (con `.nojekyll`). Configurar `<meta name="api-base">` en `index.html` y
  `admin.html` con la URL pública del backend.

---

## Variables de entorno

Ver `backend/.env.example` para la lista completa y comentada. Las más importantes:

| Variable            | Descripción                                                        |
|---------------------|--------------------------------------------------------------------|
| `JWT_SECRET`        | Secreto para firmar las sesiones del panel. **Obligatorio en prod**. |
| `CSRF_SECRET`       | Secreto para la protección CSRF. **Obligatorio en prod**.          |
| `ADMIN_USERNAME`    | Usuario del panel (se usa solo al hacer `seed`).                   |
| `ADMIN_PASSWORD`    | Contraseña inicial del panel (cámbiala y luego bórrala del `.env`).|
| `BUSINESS_TZ`       | Zona horaria del negocio (`America/Bogota`).                       |
| `BUSINESS_WHATSAPP` | WhatsApp del negocio (formato internacional, ej. `573136147706`).  |
| `SMTP_*`            | Credenciales de correo (opcional; ver DEPLOYMENT.md).             |

> Los secretos nunca están en el código. El archivo `.env` está en `.gitignore`.

---

## Personalización del negocio

Todo lo específico del negocio vive en un solo archivo:
[`backend/src/config/business.js`](backend/src/config/business.js).

Ahí se cambian, sin tocar el resto del código:
- Días y horarios de atención (`schedule`).
- Duración de cada cita (`slotMinutes`).
- Anticipación mínima y horizonte de reserva.
- Fechas bloqueadas (festivos / vacaciones).
- Catálogo de servicios.
- Datos de contacto (teléfono, dirección, Instagram).

---

## Pruebas

- **Tests automatizados**: `cd backend && npm test` (cubre endpoints críticos,
  servicios y errores).
- **Lint**: `cd backend && npm run lint`.
- **CI**: cada push ejecuta `lint + test` en GitHub Actions.
- **Auditoría manual** previa: ver [`docs/TESTING.md`](docs/TESTING.md).
