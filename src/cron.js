import cron from 'node-cron';
import { getBoardItems, getItemsWithUpcomingDates, getStuckItems } from './monday.js';
import { generateDailyBriefing, generateAlertMessage } from './claude.js';
import { sendToGroup } from './whatsapp.js';
import { logger } from './logger.js';

const TZ = { timezone: 'America/Costa_Rica' };
const DONE_KEYWORDS = ['done', 'listo', 'completado', 'terminado'];

const isDone = (item) => {
  const col = item.column_values?.find(
    (c) => c.type === 'color' || c.title?.toLowerCase().includes('estado')
  );
  const s = (col?.text ?? '').toLowerCase();
  return DONE_KEYWORDS.some((k) => s.includes(k));
};

const getColVal = (item, hints) => {
  for (const hint of [].concat(hints)) {
    const col = item.column_values?.find((c) =>
      c.title?.toLowerCase().includes(hint.toLowerCase())
    );
    if (col?.text) return col.text;
  }
  return null;
};

const getStatus = (item) => getColVal(item, ['estado', 'status']) ?? 'Sin estado';
const getResp = (item) => getColVal(item, ['responsable', 'asignado']) ?? 'Sin asignar';

const getFecha = (item) => {
  const col = item.column_values?.find((c) => c.type === 'date');
  if (!col?.value) return null;
  try {
    return JSON.parse(col.value).date ?? null;
  } catch {
    return null;
  }
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const buildDailyContext = (proItems, tareasItems) => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const statusOf = (item) => getStatus(item).toLowerCase();
  const fmt = (i) => `${i.name} (${getResp(i)})`;

  const clientesNew = proItems.filter((i) => statusOf(i).includes('new'));
  const clientesProceso = proItems.filter((i) => statusOf(i).includes('proceso'));

  const active = tareasItems.filter((i) => !isDone(i));
  const tareasHoy = active.filter((i) => { const d = getFecha(i); return d && sameDay(new Date(d), today); });
  const tareasMañana = active.filter((i) => { const d = getFecha(i); return d && sameDay(new Date(d), tomorrow); });
  const tareasSemana = active.filter((i) => {
    const d = getFecha(i);
    if (!d) return false;
    const dt = new Date(d);
    return dt > tomorrow && dt <= weekEnd;
  });
  const sinResp = active.filter((i) => {
    const r = (getResp(i) ?? '').toLowerCase();
    return r === 'sin asignar' || r === '';
  });
  const bloqueadas = active.filter((i) => statusOf(i).includes('bloqueado'));

  const list = (arr, fn = (i) => i.name) => arr.length ? ' → ' + arr.map(fn).join(', ') : '';

  return `Resumen del día para Blindspot Media:

ONBOARDING PROFESIONALES:
- Total de clientes en el board: ${proItems.length}
- Clientes con Status "New" (sin atender): ${clientesNew.length}${list(clientesNew)}
- Clientes con Status "En proceso": ${clientesProceso.length}

TAREAS MERCADEO:
- Total de tareas activas: ${active.length}
- Tareas con entrega HOY: ${tareasHoy.length}${list(tareasHoy, fmt)}
- Tareas con entrega mañana: ${tareasMañana.length}${list(tareasMañana, fmt)}
- Tareas con entrega esta semana: ${tareasSemana.length}${list(tareasSemana, fmt)}
- Tareas sin responsable asignado: ${sinResp.length}${list(sinResp)}
- Tareas con estado "Bloqueado": ${bloqueadas.length}${list(bloqueadas, fmt)}`;
};

export const startCrons = () => {
  // 8:00am — briefing diario
  cron.schedule('0 8 * * *', async () => {
    logger.info('Ejecutando briefing diario...');
    try {
      const [pro, tareas] = await Promise.all([
        getBoardItems(process.env.BOARD_PROFESIONALES),
        getBoardItems(process.env.BOARD_TAREAS),
      ]);
      const msg = await generateDailyBriefing(buildDailyContext(pro, tareas));
      if (msg) {
        await sendToGroup(msg);
        logger.success('Briefing diario enviado');
      }
    } catch (err) {
      logger.error(`Briefing diario: ${err.message}`);
    }
  }, TZ);

  // Alerta de fechas próximas — 9:00am y 3:00pm
  const alertaFechas = async () => {
    logger.info('Verificando tareas con fechas próximas...');
    try {
      const items = await getItemsWithUpcomingDates(process.env.BOARD_TAREAS, 2);
      const pending = items.filter((i) => !isDone(i)).slice(0, 3);
      if (!pending.length) { logger.info('Sin tareas urgentes por fecha'); return; }
      const msg = await generateAlertMessage(pending, 'upcoming');
      if (msg) {
        await sendToGroup(msg);
        logger.success(`Alerta fechas enviada (${pending.length} tareas)`);
      }
    } catch (err) {
      logger.error(`Alerta fechas: ${err.message}`);
    }
  };

  cron.schedule('0 9 * * *', alertaFechas, TZ);
  cron.schedule('0 15 * * *', alertaFechas, TZ);

  // 5:00pm — tareas estancadas
  cron.schedule('0 17 * * *', async () => {
    logger.info('Verificando tareas estancadas...');
    try {
      const items = await getStuckItems(process.env.BOARD_TAREAS, 48);
      const stuck = items.filter((i) => !isDone(i));
      if (!stuck.length) { logger.info('Sin tareas estancadas'); return; }
      const msg = await generateAlertMessage(stuck, 'stuck');
      if (msg) {
        await sendToGroup(msg);
        logger.success(`Alerta estancadas enviada (${stuck.length} tareas)`);
      }
    } catch (err) {
      logger.error(`Estancadas: ${err.message}`);
    }
  }, TZ);

  logger.success('Crons activos — briefing 8am | fechas 9am/3pm | estancadas 5pm');
};
