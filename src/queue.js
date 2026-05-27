import { logger } from './logger.js';
import { classifyEvent } from './classifier.js';
import { getItemById } from './monday.js';
import { generateMessage } from './claude.js';
import { sendToGroup } from './whatsapp.js';

const queue = [];
let isProcessing = false;

export const add = (rawEvent) => {
  queue.push({ rawEvent, retries: 0 });
  logger.info(`Evento en cola (total: ${queue.length})`);
};

const processEntry = async ({ rawEvent }) => {
  const ev = classifyEvent(rawEvent);

  if (ev.type === 'unknown') {
    logger.warn('Evento desconocido — descartado');
    return;
  }

  logger.info(`Procesando: ${ev.type} | "${ev.itemName}"`);

  // Esperar que Monday sincronice todos los campos del formulario antes de consultar
  if (ev.type === 'new_client') {
    await new Promise((r) => setTimeout(r, 8000));
  }

  const item = ev.itemId ? await getItemById(ev.itemId) : null;
  const msg = await generateMessage(ev, item);

  if (!msg) {
    logger.warn(`Sin mensaje generado para: ${ev.type}`);
    return;
  }

  await sendToGroup(msg);
  logger.success(`Listo: ${ev.type} | "${ev.itemName}"`);
};

const tick = async () => {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  const entry = queue[0];

  try {
    await processEntry(entry);
    queue.shift();
  } catch (err) {
    entry.retries++;
    logger.error(`Error procesando (intento ${entry.retries}/2): ${err.message}`);

    if (entry.retries >= 2) {
      logger.error(`Descartando evento tras 2 fallos: ${JSON.stringify(entry.rawEvent).slice(0, 200)}`);
      queue.shift();
    } else {
      logger.warn('Reintentando en 6s...');
      await new Promise((r) => setTimeout(r, 6000));
    }
  } finally {
    isProcessing = false;
  }
};

export const startQueue = () => {
  setInterval(tick, 4000);
  logger.info('Cola de eventos iniciada (tick cada 4s)');
};
