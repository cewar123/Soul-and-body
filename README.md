# Soul and Body

Sitio web y sistema de reservas de **Soul and Body**, centro de estética de
Wendy de la Hoz en Envigado (Antioquia, Colombia).

Todo vive en una sola plataforma de Cloudflare: el sitio estático, la API y la
base de datos. Un solo `wrangler deploy`, un solo dominio, sin CORS.

---

## Stack

| Capa       | Tecnología                                            |
|------------|-------------------------------------------------------|
| Hosting    | Cloudflare **Workers Static Assets**                  |
| Base datos | Cloudflare **D1** (SQLite)                            |
| Frontend   | **Astro 7** — HTML prerenderizado, sin JS en la vista |
| API        | **Hono 4** + Zod 4, dentro del mismo Worker          |
| Lenguaje  | TypeScript 6 estricto                                 |
| Tests      | Vitest 4 en **workerd** (el runtime real de Workers) |
| Estilos    | Tokens CSS + estilos scoped de Astro (sin Tailwind)   |

> **El proyecto anterior** (Express + Supabase Postgres + HTML a mano) está
> congelado en la rama `legacy`. No se perderá nada.

---

## Puesta en marcha (local)

Requisitos: **Node.js 20+** y una cuenta de Cloudflare (gratis).

```bash
npm install

# Secretos locales (wrangler lee .dev.vars, no .env)
cp .env.example .dev.vars
# Edita .dev.vars y pon un SESSION_SECRET aleatorio

# Crear el esquema en la base local
npm run db:migrate

# Cargar servicios y ajustes iniciales
npm run db:seed

# Arrancar (Astro corre dentro de workerd, igual que producción)
npm run dev
```

| Qué | Dónde |
|-----|-------|
| Sitio | http://localhost:4321 |
| API | http://localhost:4321/api/health |
| Panel | http://localhost:4321/admin |

### Comandos

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | Servidor de desarrollo en workerd |
| `npm run build` | Genera el sitio estático en `dist/client` |
| `npm run preview` | Levanta el build con el runtime de producción |
| `npm run deploy` | Build + `wrangler deploy` |
| `npm test` | Tests en workerd con D1 real |
| `npm run check` | Lint + typecheck + tests (lo que corre CI) |
| `npm run db:migrate` | Aplica migraciones en la base local |
| `npm run db:seed` | Carga servicios y ajustes |
| `npm run db:studio` | Abre D1 Studio sobre la base local |
| `npx wrangler d1 create soul-and-body` | Crea la base remota (te da el `database_id`) |

---

## Publicar

```bash
# 1) Crear la base remota y pegar el database_id en wrangler.jsonc
npx wrangler d1 create soul-and-body
npx wrangler d1 migrations apply soul-and-body --remote
npx wrangler d1 execute soul-and-body --remote --file=./scripts/seed.sql

# 2) Secretos
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TURNSTILE_SECRET_KEY   # opcional
npx wrangler secret put BREVO_API_KEY          # opcional

# 3) Publicar
npm run deploy
```

Queda en `https://soul-and-body.<tu-subdominio>.workers.dev`. Cada
`wrangler deploy` genera además una **URL de preview** por versión, que puedes
candear con Cloudflare Access si no es pública.

Cuando compres el dominio: dos registros DNS en Cloudflare y cambiar
`PUBLIC_URL` + `site` en `astro.config.mjs`. **Sin tocar código.**

---

## Cómo se evita la doble reserva

Es la pieza que no se negocia. Cada bloque de la rejilla (30 min) que ocupa una
cita vive en `slot_holds`, cuya `PRIMARY KEY (date, slot)` hace que **el motor
de la base de datos** rechace el segundo intento:

```
UNIQUE constraint failed: slot_holds.date, slot_holds.slot
```

No hay ventana de carrera porque la restricción no está en el código de la
aplicación: no se puede saltarse por mucho que dos personas hagan clic a la vez.
Un servicio de 90 min ocupa 3 bloques, así que también se detecta el solapamiento
parcial (09:00–10:00 bloquea las 09:30). Al cancelar se borran los bloques y el
horario vuelve a estar libre.

La lógica de `availableSlots()` en `src/lib/slots.ts` solo evita *ofrecer* un
bloque ocupado. Es una cortesía, no la garantía.

---

## Estructura

```
├── migrations/            # Esquema D1 versionado
├── scripts/seed.sql       # Servicios y ajustes iniciales
├── src/
│   ├── lib/               # Lógica pura: tiempo, slots, configuración
│   ├── server/            # Rutas Hono de la API
│   ├── styles/            # Tokens y base
│   ├── layouts/           # Layout compartido
│   ├── pages/             # Páginas Astro (prerenderizadas)
│   └── worker.ts          # Entry point: cf() → API → astro()
├── tests/                 # Vitest en workerd
└── wrangler.jsonc         # Bindings, assets, D1
```

### Dónde está cada cosa

| Quiero… | Archivo |
|----------|---------|
| Cambiar horarios, precios o datos del negocio | Panel `/admin` → **Ajustes** |
| Cambiar la duración de un servicio | Panel → **Servicios** |
| Bloquear vacaciones o festivos | Panel → **Fechas bloqueadas** |
| Cambiar la lógica de disponibilidad | `src/lib/slots.ts` |
| Añadir un endpoint | `src/server/` |
| Cambiar colores o tipografía | `src/styles/tokens.css` |

---

## Notas importantes

- **Hora local, no UTC.** En la base, `date` y `time` son texto local
  (`'2026-11-10'`, `'09:00'`) en hora de Colombia. Colombia es UTC-5 todo el año,
  así que es exacto y evita por completo la matemática de zonas horarias.
- **La configuración se hornea en el HTML.** Las páginas prerenderizadas leen
  D1 *durante el build*, así que el NAP está en el código fuente de la página y
  no se carga por JavaScript — que es lo que necesitan los buscadores.
- **Tests en el runtime real.** Los tests corren en workerd contra una D1 local
  real, no en Node. Lo que pasa en los tests pasa en producción.
- **Sin CORS, a propósito.** La API es de un solo origen. Sin cabeceras
  `Access-Control-Allow-*`, el navegador impide que otro sitio la consuma.
- **Pendiente conocido:** `npm audit` reporta 3 vulnerabilidades *altas* en
  `http-cache-semantics`, dependencia transitiva de Astro. El "arreglo" que
  ofrece npm es degradar Astro a la versión 2.10.9, así que no se aplica. El
  paquete solo participa en la lógica de caché de build, no en el runtime.

---

## Legal (Colombia)

- Los datos de salud son **datos sensibles** (Ley 1581 de 2012): requieren
  consentimiento **explícito** y separado, no un checkbox de "términos".
- La Ley 1799 de 2016 prohíbe procedimientos estéticos en menores. La edad
  mínima se valida en el servidor y es configurable.
- La Ley 1480 de 2011 (Art. 29) hace **vinculante** el precio publicado.