# Despliegue con Supabase — Soul and Body

Esta guía explica cómo correr el proyecto contra un proyecto de Supabase
en vez de SQLite local. Es la opción recomendada para demos y
despliegues en la nube.

---

## ¿Por qué Supabase?

- **PostgreSQL real** (no SQLite), con todas las garantías (transacciones, FK, JSON, etc.).
- **Free tier generoso**: 500 MB de BD, 50k filas, 2 GB de egress.
- **Dashboard visual** para inspeccionar tablas, ver datos, ejecutar SQL.
- **Realtime opcional** (no lo usamos aquí, pero disponible).
- **Auth gestionado** (no lo usamos aquí — seguimos con JWT propio para mantener
  el control total sobre cookies httpOnly + CSRF).

---

## 1. Crear el proyecto

1. Ir a <https://supabase.com> y crear una cuenta (gratis, GitHub login).
2. **New project** → nombre (ej. `soul-and-body-prod`) → contraseña de BD
   (anótala, no la usaremos directamente) → región (South America más cercano).
3. Esperar 1-2 minutos a que aprovisione.

---

## 2. Aplicar el esquema

1. En el dashboard: **SQL Editor** (icono de BD en el menú izquierdo).
2. **New query** → pegar TODO el contenido de `database/schema.sql`.
3. **Run** (o Ctrl+Enter). Debe ejecutarse sin errores.
4. Verificar en **Table Editor**: deben existir `admins`, `customers`, `appointments`.

---

## 3. Obtener las claves

1. En el dashboard: **Settings → API**.
2. Copiar:
   - **Project URL** (ej. `https://abc123def.supabase.co`) → `SUPABASE_URL`.
   - **service_role key** (NO la anon key, esa es solo para el cliente)
     → `SUPABASE_SERVICE_ROLE_KEY`.

> ⚠️ La service_role key **bypasea RLS** y tiene permisos totales. NUNCA la
> expongas al frontend. Va SOLO en `backend/.env` (servidor).

---

## 4. Configurar el backend

```bash
cd backend
cp .env.example .env
# Editar .env y completar:
#   SUPABASE_URL=https://xxx.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
#   JWT_SECRET=<64+ caracteres aleatorios>
#   ADMIN_USERNAME=wendy
#   ADMIN_PASSWORD=<contraseña fuerte>
```

Generar el `JWT_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Verificar conexión:
```bash
npm run migrate    # confirma que las tablas existen
npm run seed       # crea el admin
npm start          # arranca en http://localhost:3000
```

---

## 5. Frontend

En `frontend/index.html` y `frontend/admin.html`, el `<meta name="api-base">`
debe apuntar a tu backend desplegado (no a Supabase, sino al backend que
**usa** Supabase):

```html
<!-- Si backend está en Render/Railway/Fly -->
<meta name="api-base" content="https://api.soul-and-body.example.com/api" />
```

Si trabajas en local con el backend en `localhost:3000`, déjalo vacío (se
usa el mismo origen por defecto).

---

## 6. Reset / recrear la BD

Si en algún momento quieres empezar de cero:

1. Dashboard → **SQL Editor** → New query.
2. Pegar y ejecutar (borra todo):
   ```sql
   DROP TRIGGER IF EXISTS trg_admins_updated        ON admins;
   DROP TRIGGER IF EXISTS trg_customers_updated     ON customers;
   DROP TRIGGER IF EXISTS trg_appointments_updated  ON appointments;
   DROP TABLE    IF EXISTS appointments CASCADE;
   DROP TABLE    IF EXISTS customers    CASCADE;
   DROP TABLE    IF EXISTS admins       CASCADE;
   DROP FUNCTION IF EXISTS update_updated_at_column();
   ```
3. Volver a aplicar `database/schema.sql`.

---

## 7. Tests

Los tests de integración (los que tocan Supabase) requieren credenciales.
Los tests puros (errores, formateo, validadores) corren siempre.

```bash
# Solo tests puros (no requieren Supabase)
npm test

# Suite completa (con Supabase)
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc... \
npm test
```

En CI, configura los secrets `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
en el repo (Settings → Secrets) y el job `backend-integration` correrá
automáticamente.

---

## Diferencias clave con SQLite

| Tema | SQLite (versión anterior) | Supabase (versión actual) |
|---|---|---|
| Conexión | better-sqlite3 (síncrono) | @supabase/supabase-js (async) |
| Sentencias | Preparadas, síncronas | Cliente JS con builder async |
| Schema | `database/schema.sql` ejecutado por el backend | `database/schema.sql` ejecutado en SQL Editor |
| Disco | Archivo en `backend/data/` | Gestionado por Supabase |
| Backups | `cp *.db backup.db` | Automáticos diarios (Pro) / manual (Free) |
| Multi-instancia | ❌ Un solo proceso | ✅ Conexiones concurrentes |
| Timezone | Local del servidor | UTC por defecto; el backend aplica `America/Bogota` |

---

## Límites del free tier (referencia)

- **BD**: 500 MB
- **Filas**: 50k (suficiente para años de un negocio local)
- **Egress**: 2 GB/mes
- **Edge functions**: 500k invocaciones/mes
- **Storage**: 1 GB
- **Realtime**: 200 concurrentes, 2M mensajes/mes

Para Soul and Body, con suerte 50 reservas/mes y 5 cambios de estado en el
admin, el free tier es **más que suficiente**.

---

## Troubleshooting

### "La tabla X no existe"
Ejecutaste el schema en el proyecto equivocado, o el cliente apunta a otro
proyecto. Verifica `SUPABASE_URL` y re-ejecuta `database/schema.sql`.

### "Invalid API key"
La `SUPABASE_SERVICE_ROLE_KEY` está mal copiada (le falta un caracter, tiene
espacios, etc.) o estás usando la `anon` key en vez de la `service_role`.

### "permission denied for table admins"
Estás usando la anon key. Cambia a la service_role key (es larga, empieza
con `eyJhbGciOiJIUzI1NiIs...`).

### Los tests se saltan con "Tests de integración requieren Supabase"
Normal: no hay credenciales. Configúralas o vive con los tests puros.
