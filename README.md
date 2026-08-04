# Soul and Body — Sistema de reservas

Aplicación web completa para **Soul and Body**, el centro estético de
Wendy de la Hoz en Envigado (Antioquia). Incluye la página pública con
un asistente de reserva real, un backend con persistencia en **Supabase
(PostgreSQL)** y un panel de administración protegido.

---

## Características

- **Asistente de reserva en 4 pasos**: servicio → día y hora → datos → confirmación.
- **Disponibilidad real**: solo se ofrecen horarios libres; imposible reservar dos
  veces el mismo bloque (índice único parcial en PostgreSQL).
- **Persistencia en Supabase** (PostgreSQL gestionado, free tier generoso).
- **Panel de administración** con login, métricas, filtros, búsqueda y cambio de
  estado de las citas.
- **Notificaciones por correo** a la clienta y al negocio (opcional, SMTP).
- **Confirmación por WhatsApp** con mensaje prellenado (click-to-chat).
- **Frontend en GitHub Pages** (HTML estático, sin build).
- **Seguridad de nivel producción**: Helmet + CSP, CSRF, rate limiting, bcrypt
  12 rounds, JWT en cookies httpOnly, honeypot anti-bot.
- **WCAG 2.1 AA** en lo esencial: skip-link, contraste, ARIA, focus management.
- **SEO completo**: Open Graph, Twitter Card, JSON-LD `LocalBusiness`, geo meta,
  robots.txt, sitemap.xml, manifest.

---

## Stack

| Capa        | Tecnología                                                |
|-------------|-----------------------------------------------------------|
| Frontend    | HTML5 + CSS3 + ES Modules (sin frameworks, sin build)     |
| Backend     | Node 20 + Express 4                                       |
| Base datos  | **Supabase** (PostgreSQL gestionado)                      |
| Seguridad   | Helmet, express-rate-limit, express-validator, JWT, bcrypt|
| Correo      | Nodemailer (SMTP) opcional                                |
| Tests       | `node --test` + supertest                                 |
| Lint        | ESLint v9 flat config                                     |
| CI          | GitHub Actions (lint + test + integration)                |

> **¿Por qué Supabase?** PostgreSQL real, dashboard visual, backups, free
> tier generoso (500 MB) y sin运维. La capa de datos está aislada en
> `models/`, así que cambiar de proveedor en el futuro es directo.

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
│   │   ├── db/                      # Supabase client + migrate + seed
│   │   ├── lib/                     # errors, http, format, time, asyncHandler, logger
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
│       └── images/                  # logo.jpg
│
├── database/
│   └── schema.sql                   # PostgreSQL — se ejecuta UNA vez en Supabase
│
├── docs/
│   ├── SUPABASE.md                  # setup paso a paso
│   ├── DEPLOYMENT.md                # Render / Railway / Fly.io
│   └── TESTING.md                   # auditoría funcional previa
│
├── .github/workflows/ci.yml         # lint + test + integration
├── .editorconfig, .prettierrc.json, .gitignore
├── Iniciar Soul and Body.bat        # wrapper Windows para arrancar local
└── README.md
```

---

## Puesta en marcha (local)

### Requisitos
- Node.js 20 o superior.
- Un proyecto de Supabase (gratis, 2 min) — ver [`docs/SUPABASE.md`](docs/SUPABASE.md).

### Pasos

```bash
cd backend

# 1) Instalar dependencias
npm install

# 2) Configurar variables de entorno
cp .env.example .env
# Editar .env y completar SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + JWT_SECRET + ADMIN_*

# 3) Aplicar esquema (UNA sola vez) en el SQL editor de Supabase
#    → database/schema.sql (las instrucciones están en docs/SUPABASE.md)

# 4) Verificar conexión y crear el admin
npm run setup      # equivale a: npm run migrate && npm run seed

# 5) Arrancar
npm start          # http://localhost:3000
npm run dev        # con --watch (recarga al cambiar)
```

- Página pública: <http://localhost:3000/>
- Panel de administración: <http://localhost:3000/admin>

### Comandos útiles

| Comando            | Descripción                                              |
|--------------------|----------------------------------------------------------|
| `npm start`        | Arranca el servidor.                                     |
| `npm run dev`      | Arranca con `--watch` (recarga al cambiar).              |
| `npm run migrate`  | Verifica que las tablas existen en Supabase.             |
| `npm run seed`     | Crea el admin inicial (idempotente).                     |
| `npm run setup`    | `migrate` + `seed`.                                      |
| `npm test`         | Ejecuta los tests. Si no hay Supabase, salta los de BD.  |
| `npm run lint`     | Pasa ESLint.                                             |
| `npm run format`   | Aplica Prettier.                                         |

---

## Despliegue

Ver [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) para Render/Railway/Fly.io
y [`docs/SUPABASE.md`](docs/SUPABASE.md) para la configuración de la BD.

### Resumen rápido

- **BD**: Supabase free tier (500 MB, suficiente para años).
- **Backend** (Render, Railway, Fly.io): root `backend/`, build `npm install`,
  start `npm run setup && npm start`. Variables de entorno según la tabla.
- **Frontend** (GitHub Pages): la carpeta `frontend/` se sube tal cual con
  `.nojekyll`. Configurar `<meta name="api-base">` con la URL del backend.

---

## Variables de entorno

Ver `backend/.env.example` para la lista completa. Las más importantes:

| Variable                     | Descripción                                            |
|------------------------------|--------------------------------------------------------|
| `SUPABASE_URL`               | Project URL de Supabase                                |
| `SUPABASE_SERVICE_ROLE_KEY`  | service_role key (NO la anon) — solo en el backend    |
| `JWT_SECRET`                 | Secreto para firmar sesiones. **Obligatorio en prod**. |
| `CSRF_SECRET`                | (ya no se usa con Supabase, puede quedar vacío)        |
| `ADMIN_USERNAME`             | Usuario del panel                                      |
| `ADMIN_PASSWORD`             | Solo para el seed inicial                              |
| `BUSINESS_TZ`                | `America/Bogota`                                       |
| `BUSINESS_WHATSAPP`          | `573136147706`                                         |
| `SMTP_*`                     | Opcional, para correos                                 |

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

- **Tests automatizados**: `cd backend && npm test` — corre los tests puros
  siempre; los de BD se saltan si no hay credenciales de Supabase.
- **Tests de integración**: configura `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE_KEY` y vuelve a correr `npm test`.
- **Lint**: `cd backend && npm run lint`.
- **CI**: cada push corre `lint + test` (puros). Si configuras los secrets
  en GitHub, también corre la suite de integración contra Supabase.
- **Auditoría manual** previa: ver [`docs/TESTING.md`](docs/TESTING.md).
