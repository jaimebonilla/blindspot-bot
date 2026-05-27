# Blindspot Bot

Asistente operativo de Blindspot Media. Observa boards de Monday.com en tiempo real vía webhooks y notifica al equipo por WhatsApp con mensajes redactados por Claude.

---

## Primer arranque

```bash
# 1. Instalá dependencias
npm install

# 2. Copiá el archivo de variables
cp .env.example .env
# Completá MONDAY_API_KEY en .env

# 3. Arrancá el servidor
node src/index.js
```

4. Aparece un QR en consola → escanealo con WhatsApp en el número del bot:
   **WhatsApp → Dispositivos vinculados → Vincular dispositivo**

5. Una vez conectado, el sistema imprime en consola todos los grupos disponibles:
   ```
   --- Grupos disponibles ---
   ID: 120363xxxxxxxx@g.us  |  Nombre: Blindspot Media Equipo
   ID: 120363xxxxxxxx@g.us  |  Nombre: Familia
   ---
   ```

6. Copiá el ID del grupo de Blindspot (termina en `@g.us`) y pegalo en `WHATSAPP_GROUP_ID` en `.env`

7. `Ctrl+C` y volvé a correr `node src/index.js`

8. Verificá que el bot llegó al grupo correcto:
   ```bash
   curl http://localhost:3000/test-message
   ```

---

## Variables de entorno

| Variable | Descripción |
|---|---|
| `MONDAY_API_KEY` | Token de API de Monday.com (Settings → Admin → API) |
| `BOARD_PROFESIONALES` | ID del board Onboarding Profesionales (`18414918824`) |
| `BOARD_TAREAS` | ID del board Tareas Mercadeo Blindspot (`18414918813`) |
| `ANTHROPIC_API_KEY` | API key de Anthropic |
| `WHATSAPP_GROUP_ID` | ID del grupo de WhatsApp (completar después del primer QR) |
| `PORT` | Puerto del servidor Express (default: `3000`) |
| `TZ` | Timezone del sistema (`America/Costa_Rica`) |

---

## Configurar webhooks en Monday

Para **cada board** (Profesionales y Tareas):

1. Abrí el board → **Integrate** (arriba a la derecha) → **Webhooks**
2. **URL:** `https://TU_DOMINIO.up.railway.app/webhook/monday`
3. Eventos a suscribir:
   - `When an item is created` — **solo en Board Profesionales**
   - `When a column value changes` — en **ambos** boards
4. Monday envía una llamada de verificación con `challenge` al guardar — el servidor la responde automáticamente
5. Repetí para el segundo board

---

## Deploy en Railway

```bash
# Subí el repo a GitHub
git init && git add . && git commit -m "init"
git remote add origin https://github.com/TU_USUARIO/blindspot-bot.git
git push -u origin main
```

1. [Railway](https://railway.app) → **New Project → Deploy from GitHub** → seleccioná el repo
2. Configurá todas las variables en **Settings → Variables**
3. `auth_info_baileys/` no se commitea — después del deploy tenés que hacer el scan QR nuevamente
   - Ver el QR: Railway Dashboard → tu servicio → **Logs** (aparece en los logs de arranque)

---

## Endpoints

| Endpoint | Descripción |
|---|---|
| `GET /` | Health check con uptime |
| `POST /webhook/monday` | Recibe webhooks de Monday (challenge + eventos) |
| `GET /test-message` | Envía un mensaje de prueba al grupo configurado |

---

## Qué hace el bot

### Mensajes reactivos (webhook en tiempo real)

| Trigger | Mensaje |
|---|---|
| Cliente nuevo en Onboarding | Aviso con nombre, tipo de negocio, WhatsApp, correo e Instagram |
| Cambio de estado en cualquier ítem | Aviso con estado anterior/nuevo y responsable; urgente si es "Bloqueado" |
| Fecha de entrega asignada | Recordatorio con cuántos días faltan y responsable |
| Tarea asignada o reasignada | Aviso al responsable nuevo con fecha y estado actual |

### Mensajes programados (cron, hora Costa Rica)

| Hora | Mensaje |
|---|---|
| **8:00am** | Briefing completo del día: clientes sin atender, tareas con entrega hoy/mañana/esta semana, sin responsable, bloqueadas |
| **9:00am y 3:00pm** | Alerta de tareas con entrega en las próximas 48h (solo si las hay) |
| **5:00pm** | Alerta de tareas sin actualización en más de 48h (solo si las hay) |

### Lo que el bot NO hace
- No responde mensajes que le escriban
- No contacta clientes directamente
- No modifica nada en Monday
- No tiene memoria entre conversaciones
