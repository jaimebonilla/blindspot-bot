import 'dotenv/config';
import express from 'express';
import { getBoardColumns } from './monday.js';
import { init as initWhatsApp, sendToGroup } from './whatsapp.js';
import { startCrons } from './cron.js';
import { add as enqueue, startQueue } from './queue.js';
import { logger } from './logger.js';

const app = express();
app.use(express.json());

export const columnMaps = {};

// POST /webhook/monday
app.post('/webhook/monday', (req, res) => {
  const body = req.body;

  if (body.challenge) {
    logger.info('Monday webhook challenge respondido');
    return res.json({ challenge: body.challenge });
  }

  res.sendStatus(200);
  enqueue(body);
});

// GET /
app.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date() });
});

// GET /test-message
app.get('/test-message', async (_req, res) => {
  const msg = `🤖 *Blindspot Bot activo*\nConexión verificada correctamente.\n${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}`;
  await sendToGroup(msg);
  res.json({ sent: true, message: msg });
});

const start = async () => {
  logger.info('Iniciando Blindspot Bot...');

  try {
    const [proCols, tareasCols] = await Promise.all([
      getBoardColumns(process.env.BOARD_PROFESIONALES),
      getBoardColumns(process.env.BOARD_TAREAS),
    ]);
    columnMaps[process.env.BOARD_PROFESIONALES] = proCols;
    columnMaps[process.env.BOARD_TAREAS] = tareasCols;
    logger.success(`Columnas cargadas — Profesionales: ${proCols.length} | Tareas: ${tareasCols.length}`);
  } catch (err) {
    logger.error(`Error cargando columnas de Monday: ${err.message}`);
  }

  await initWhatsApp();
  startCrons();
  startQueue();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => logger.success(`Express escuchando en puerto ${PORT}`));
};

start().catch((err) => {
  logger.error(`Error fatal al arrancar: ${err.message}`);
  process.exit(1);
});
