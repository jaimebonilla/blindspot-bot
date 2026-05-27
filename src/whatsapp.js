import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { logger } from './logger.js';

let sock = null;
let isConnected = false;

const noopLogger = {
  level: 'silent',
  fatal: () => {}, error: () => {}, warn: () => {},
  info: () => {}, debug: () => {}, trace: () => {},
  child() { return this; },
};

export const init = async () => {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: noopLogger,
  });

  sock.ev.on('creds.update', saveCreds);

  // Solicitar código de vinculación si no hay sesión activa
  if (!state.creds.registered) {
    const botNumber = process.env.WHATSAPP_BOT_NUMBER;
    if (botNumber) {
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(botNumber);
          logger.info(`============================================`);
          logger.info(`CÓDIGO DE VINCULACIÓN: ${code}`);
          logger.info(`WhatsApp → Dispositivos vinculados → Vincular dispositivo → Vincular con número de teléfono`);
          logger.info(`============================================`);
        } catch (err) {
          logger.error(`Error solicitando código: ${err.message}`);
        }
      }, 3000);
    } else {
      logger.warn('WHATSAPP_BOT_NUMBER no configurado, no se puede generar código de vinculación');
    }
  }

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      isConnected = true;
      logger.success('WhatsApp conectado');

      if (!process.env.WHATSAPP_GROUP_ID) {
        logger.warn('WHATSAPP_GROUP_ID vacío — listando grupos disponibles en 3s...');
        setTimeout(listGroups, 3000);
      }
    }

    if (connection === 'close') {
      isConnected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      logger.warn(`Conexión cerrada (código ${code}). Reconectar: ${shouldReconnect}`);

      if (shouldReconnect) {
        logger.info('Reconectando en 5s...');
        setTimeout(init, 5000);
      } else {
        logger.error('Sesión cerrada (logout). Borrá auth_info_baileys/ y reiniciá el servidor.');
      }
    }
  });
};

export const listGroups = async () => {
  if (!sock || !isConnected) {
    logger.warn('WhatsApp no conectado, no se pueden listar grupos');
    return;
  }

  try {
    const groups = await sock.groupFetchAllParticipating();
    console.log('\n--- Grupos disponibles ---');
    for (const [id, meta] of Object.entries(groups)) {
      console.log(`ID: ${id}  |  Nombre: ${meta.subject}`);
    }
    console.log('---');
    console.log('Copiá el ID del grupo de Blindspot y pegalo en WHATSAPP_GROUP_ID en .env');
    console.log('Luego reiniciá el servidor.\n');
  } catch (err) {
    logger.error(`Error al listar grupos: ${err.message}`);
  }
};

export const sendToGroup = async (message) => {
  const groupId = process.env.WHATSAPP_GROUP_ID;

  if (!groupId) {
    logger.warn('WHATSAPP_GROUP_ID no configurado — mensaje descartado');
    return;
  }

  if (!sock || !isConnected) {
    logger.warn('WhatsApp no conectado — mensaje descartado');
    return;
  }

  await sock.sendMessage(groupId, { text: message });
  logger.success(`Mensaje enviado al grupo (${message.length} chars)`);
};
