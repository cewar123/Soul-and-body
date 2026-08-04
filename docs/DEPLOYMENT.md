# Despliegue — Soul and Body (Supabase)

Guía rápida para poner el sistema en producción usando **Supabase** como
base de datos y **Render/Railway/Fly.io** para el backend Node.

Para la configuración inicial de Supabase, ver [`docs/SUPABASE.md`](SUPABASE.md).

---

## Resumen de la arquitectura

```
Visitante → GitHub Pages (frontend estático)
                │  fetch()
                ▼
         Render/Railway (backend Node + Express)
                │  cliente Supabase (service_role)
                ▼
            Supabase (PostgreSQL)
```

---

## 1. Variables de entorno del backend

En el servicio donde despliegues el backend (Render, Railway, etc.) configura:

| Variable                     | Descripción                                                 |
|------------------------------|-------------------------------------------------------------|
| `NODE_ENV`                   | `production`                                                 |
| `PORT`                       | El que asigne el proveedor (Render lo define solo)          |
| `PUBLIC_URL`                 | `https://api.tudominio.com` (sin barra final)               |
| `SUPABASE_URL`               | Project URL de Supabase (Settings → API)                    |
| `SUPABASE_SERVICE_ROLE_KEY`  | service_role key (NO la anon) — Settings → API              |
| `JWT_SECRET`                 | 64+ caracteres aleatorios                                   |
| `ADMIN_USERNAME`             | `wendy`                                                     |
| `ADMIN_PASSWORD`             | Contraseña fuerte, solo para el primer seed                 |
| `BUSINESS_TZ`                | `America/Bogota`                                            |
| `BUSINESS_EMAIL`             | Correo de notificaciones                                    |
| `BUSINESS_WHATSAPP`          | `573136147706`                                              |
| `SMTP_*`                     | Opcional, para envío de correos (ver SUPABASE.md)            |

Generar `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 2. Render (recomendado, plan free)

1. Conecta el repo de GitHub en <https://render.com>.
2. **New Web Service** → selecciona el repo.
3. Configuración:
   - **Root directory**: `backend`
   - **Build command**: `npm install`
   - **Start command**: `npm run setup && npm start`
   - **Health check path**: `/api/health`
4. **Environment** → añade todas las variables de la sección 1.
5. **Deploy**.

URL resultante: `https://soul-and-body-api.onrender.com`.

> El plan Free de Render duerme la instancia tras 15 min sin uso; el primer
> request tarda ~30s. Para producción real, plan de pago (~$7/mes).

---

## 3. Railway (alternativa)

1. Conecta el repo en <https://railway.app>.
2. **New Project → Deploy from GitHub** → selecciona el repo.
3. Configura Root: `backend`, Start: `npm run setup && npm start`.
4. Variables de entorno: mismas que Render.
5. **Deploy**.

Railway da $5 USD de crédito/mes, suficiente para una instancia pequeña
incluso con 24/7 uptime.

---

## 4. Fly.io (con disco persistente para SQLite si vuelves a ese esquema)

1. Instala flyctl: <https://fly.io/docs/hands-on/install-flyctl/>.
2. `fly launch` en el directorio `backend/`.
3. `fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...` (etc.)
4. `fly deploy`.

---

## 5. Frontend en GitHub Pages

### Opción A — Rama `gh-pages` (simple)

1. En GitHub: **Settings → Pages → Build from branch → `gh-pages` → `/ (root)`**.
2. Workflow de GitHub Actions que publique `frontend/` en esa rama (ver
   `.github/workflows/pages.yml` si existe, o crearlo).

### Opción B — `/docs` folder

1. Copiar el contenido de `frontend/` a `/docs` en la rama `main`.
2. **Settings → Pages → branch `main` → `/docs`**.

### Editar `<meta name="api-base">` en `index.html` y `admin.html`

```html
<meta name="api-base" content="https://soul-and-body-api.onrender.com/api" />
```

---

## 6. HTTPS y dominio custom

- Render y Railway: HTTPS automático con dominios `*.onrender.com` / `*.up.railway.app`.
- Dominio custom: en el proveedor, añadir el CNAME y luego en el DNS del
  dominio crear el registro que indique el proveedor.

---

## 7. Checklist final

- [ ] `NODE_ENV=production` y secretos fuertes configurados.
- [ ] `JWT_SECRET` rotado (no es el del `.env.example`).
- [ ] `ADMIN_PASSWORD` cambiado tras el primer login y borrado de `.env`.
- [ ] Supabase tiene las 3 tablas y los índices/constraints correctos.
- [ ] SMTP verificado (o decisión consciente de operar solo con panel + WhatsApp).
- [ ] `BUSINESS_WHATSAPP`, horarios y servicios revisados en
      [`backend/src/config/business.js`](../backend/src/config/business.js).
- [ ] `<meta name="api-base">` apunta al backend público.
- [ ] Robots y sitemap actualizados con el dominio real.
- [ ] Prueba de humo: crear una reserva real y verla en el panel.
