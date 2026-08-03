# Guía de despliegue — Soul and Body

Esta guía explica cómo poner el sitio en producción con un dominio real y HTTPS.
El proyecto es un servidor Node estándar que sirve tanto la API como el frontend,
así que se despliega como cualquier app de Node.

---

## 1. Preparar las variables de entorno

En el servidor de producción define estas variables (no subas el `.env` al repo):

```
NODE_ENV=production
PORT=3000                       # o el que asigne el proveedor
PUBLIC_URL=https://tudominio.com
JWT_SECRET=<64+ caracteres aleatorios>
CSRF_SECRET=<64+ caracteres aleatorios>
ADMIN_USERNAME=wendy
ADMIN_PASSWORD=<contraseña fuerte, solo para el primer seed>
BUSINESS_TZ=America/Bogota
BUSINESS_EMAIL=correo-del-negocio@gmail.com
BUSINESS_WHATSAPP=573136147706
# SMTP (ver sección 3)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=correo-del-negocio@gmail.com
SMTP_PASS=<contraseña de aplicación de Gmail>
MAIL_FROM_NAME=Soul and Body
MAIL_FROM_EMAIL=correo-del-negocio@gmail.com
```

Genera los secretos con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> En producción, si falta `JWT_SECRET` o `CSRF_SECRET`, el servidor **no arranca**
> a propósito (evita correr en un estado inseguro).

---

## 2. Desplegar en Render o Railway (recomendado)

Ambos permiten desplegar un repo de Node en minutos. Configuración:

- **Root directory**: `backend`
- **Build command**: `npm install`
- **Start command**: `npm run setup && npm start`
  (el `setup` crea la base de datos y el admin en el primer arranque; es idempotente)
- **Variables de entorno**: las de la sección 1.

### Persistencia de la base de datos
SQLite guarda los datos en `backend/data/soul-and-body.db`. En plataformas con
disco efímero, **monta un disco persistente** apuntando a la carpeta `backend/data`
para no perder las reservas entre despliegues:

- **Render**: añade un *Persistent Disk* montado en `/opt/render/project/src/backend/data`.
- **Railway**: añade un *Volume* montado en la ruta equivalente de `backend/data`.

### HTTPS y cookies
En producción (`NODE_ENV=production`) las cookies se marcan como `secure` y el
servidor confía en 1 proxy (`trust proxy`). Render y Railway ya terminan TLS por
ti, así que basta con acceder por `https://`.

---

## 3. Correo con Gmail (contraseña de aplicación)

El envío de correos es **opcional**: sin SMTP, las reservas se guardan igual y se
gestionan desde el panel. Para activarlo con Gmail:

1. Activa la **verificación en dos pasos** en la cuenta de Gmail.
2. Entra a <https://myaccount.google.com/apppasswords> y crea una
   **contraseña de aplicación** (16 caracteres).
3. Pon esa contraseña en `SMTP_PASS` (no la contraseña normal de la cuenta).
4. Reinicia el servidor. En el arranque verás en los logs:
   `SMTP verificado: el envío de correos está activo.`

> Para volumen alto de correos conviene un proveedor transaccional (Resend,
> SendGrid, Mailgun). Basta cambiar las variables `SMTP_*`.

---

## 4. Dominio

1. Compra el dominio (ej. en Namecheap, GoDaddy, Google Domains).
2. En el proveedor de hosting, añade el dominio personalizado.
3. Crea el registro DNS que indique la plataforma (normalmente un `CNAME`).
4. Actualiza `PUBLIC_URL` y el `<link rel="canonical">` de `frontend/index.html`
   con el dominio final.

---

## 5. Checklist previo a entregar al cliente

- [ ] `NODE_ENV=production` y secretos fuertes configurados.
- [ ] Contraseña del admin cambiada; `ADMIN_PASSWORD` retirada del entorno tras el seed.
- [ ] Disco persistente montado para `backend/data`.
- [ ] SMTP verificado (o decisión consciente de operar solo con panel + WhatsApp).
- [ ] `BUSINESS_WHATSAPP`, horarios y servicios revisados en `config/business.js`.
- [ ] Fotos reales de antes/después y de los tratamientos (reemplazar placeholders).
- [ ] Prueba de humo: crear una reserva real y verla en el panel.
