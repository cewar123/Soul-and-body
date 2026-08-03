# Evidencia de pruebas — Soul and Body

Auditoría realizada el **13 de julio de 2026** sobre la aplicación corriendo en
`http://localhost:3000`, contra el backend y la base de datos **reales** (no
simulados). Se probó cada capa: arranque, base de datos, flujo de reserva,
persistencia, seguridad y panel de administración.

Las capturas de pantalla se tomaron en Google Chrome durante la auditoría y se
compartieron en la conversación de entrega (landing, asistente de reserva, login
y dashboard del panel).

---

## 1. Infraestructura y arranque

| Prueba | Resultado |
|--------|-----------|
| Runtime Node.js 22.23.1 instalado y funcionando | ✅ |
| `better-sqlite3` carga su binario precompilado (sin compilador C++) | ✅ `{ x: 42 }` |
| Migración (`npm run migrate`) crea tablas, índices y trigger | ✅ |
| Seed (`npm run seed`) crea el admin con hash bcrypt `$2a$12$` | ✅ |
| Servidor arranca y sirve API + frontend | ✅ |
| Sin errores en la consola del navegador (incluida CSP) | ✅ |

Objetos creados en la base de datos: tablas `admins` y `appointments`; índices
`idx_appointments_slot_active` (único parcial), `_date`, `_status`, `_created`;
trigger `trg_appointments_updated`.

---

## 2. Flujo completo de reserva (extremo a extremo)

Se recorrió el asistente disparando los manejadores reales de la interfaz:

1. Selección de servicio → *Tratamiento facial*.
2. Fecha *jueves 16/07/2026* → el backend devolvió **9 horarios** (09:00–17:00).
3. Selección de las 09:00.
4. Datos: *María Fernanda Gómez*, tel. 3001234567, correo de prueba, notas.
5. Confirmación.

**Resultado:** reserva creada con código **`SB-BETM6H`** y enlace de WhatsApp
prellenado con los datos de la cita.

### Persistencia verificada en la base de datos
```json
{
  "reference": "SB-BETM6H",
  "name": "María Fernanda Gómez",
  "phone": "3001234567",
  "email": "germanitsomg@gmail.com",
  "service": "facial",
  "date": "2026-07-16",
  "time": "09:00",
  "status": "pending",
  "notes": "Primera vez, piel sensible.",
  "source_ip": "::1"
}
```

---

## 3. Reglas de negocio y seguridad

Batería de pruebas contra la API real:

| # | Caso | Esperado | Resultado |
|---|------|----------|-----------|
| A | Consultar disponibilidad tras reservar las 09:00 | Bloque marcado como ocupado | ✅ `available: false` |
| B | Crear reserva **sin token CSRF** | Rechazo | ✅ `403 CSRF` |
| C | **Doble reserva** del mismo bloque | Rechazo | ✅ `400 SLOT_TAKEN` |
| D | **Honeypot** anti-bot relleno | Rechazo | ✅ `422 (spam)` |
| E | Nombre con **XSS** `<script>…` | Rechazo | ✅ `422 VALIDATION` |
| F | Reservar en **domingo** (cerrado) | Rechazo | ✅ `400 DATE_CLOSED` |

La prevención de doble reserva está garantizada por partida doble: validación en
el servicio de disponibilidad **y** un índice único parcial en SQLite (blindaje
ante condiciones de carrera).

---

## 4. Panel de administración

| # | Caso | Esperado | Resultado |
|---|------|----------|-----------|
| 1 | Login con contraseña incorrecta | Rechazo | ✅ `401 BAD_CREDENTIALS` |
| 2 | `GET /auth/me` sin sesión | Rechazo | ✅ `401` |
| 3 | Login correcto (`wendy`) | Sesión creada | ✅ `200` + cookie httpOnly |
| 4 | `GET /auth/me` con sesión | OK | ✅ `200` |
| 5 | Métricas | Datos reales | ✅ `total 1, pending 1, upcoming 1` |
| 6 | Listado de citas | Muestra la reserva | ✅ 1 registro |
| 7 | Confirmar cita | Estado → `confirmed` | ✅ `updated_at` actualizado por trigger |
| 8 | Estado inválido (`hacked`) | Rechazo | ✅ `422 VALIDATION` |

También se verificó por interfaz (login real en el navegador): el dashboard
muestra las tarjetas de métricas, los filtros y la fila de la cita con estado
**Confirmada** y las acciones *Completar / Cancelar / WhatsApp*.

---

## 5. Errores encontrados y corregidos durante la auditoría

1. **Disponibilidad devolvía HTTP 500** — la consulta `takenTimes` tenía
   marcadores de parámetro para los estados activos pero no se les pasaban los
   valores (`RangeError: Too few parameter values`). **Corregido** pasando
   `...activeStatuses` a la sentencia preparada. Reverificado: la disponibilidad
   responde correctamente y el flujo completo funciona.

---

## 6. Cobertura de seguridad implementada

- **XSS**: CSP con `script-src 'self'` (sin scripts inline); toda salida se
  renderiza con `textContent`; escape en los correos HTML.
- **CSRF**: patrón double-submit con cookie httpOnly + SameSite=Strict.
- **SQL Injection**: 100% consultas preparadas con parámetros vinculados.
- **Fuerza bruta**: rate limiting en login (10/15min) y en reservas (8/hora);
  bcrypt con 12 rondas; respuestas genéricas que no revelan si el usuario existe.
- **Spam/bots**: honeypot + validación estricta + rate limiting.
- **Cabeceras**: Helmet (CSP, no-sniff, frameguard, referrer-policy…).
- **Secretos**: solo en variables de entorno; `.env` en `.gitignore`.
- **Errores**: manejador central que no filtra stack traces al cliente.
