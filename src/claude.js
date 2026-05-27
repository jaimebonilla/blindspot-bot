import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger.js';

const client = new Anthropic();

const SYSTEM = `Sos el asistente operativo de Blindspot Media, una agencia de marketing en Costa Rica.
Tu trabajo es redactar mensajes cortos y directos para el grupo de WhatsApp interno del equipo.
Reglas:
- Máximo 6 líneas de texto
- Español de Costa Rica (natural, no formal)
- Sin saludos largos ni despedidas
- Si hay un responsable asignado, mencionalo por nombre
- Si hay fecha, siempre decí cuántos días faltan, no solo la fecha
- El tono es de compañero de trabajo avisando algo importante, no de robot`;

const colVal = (item, hints) => {
  if (!item?.column_values) return null;
  for (const hint of [].concat(hints)) {
    const col = item.column_values.find((c) =>
      c.title?.toLowerCase().includes(hint.toLowerCase())
    );
    if (col?.text) return col.text;
  }
  return null;
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86_400_000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff < 0) return `hace ${Math.abs(diff)} días`;
  return `en ${diff} días`;
};

const buildPrompt = (ev, item) => {
  switch (ev.type) {
    case 'new_client': {
      const tipo = colVal(item, ['tipo', 'type', 'negocio']) ?? 'No especificado';
      const wa = colVal(item, ['whatsapp', 'teléfono', 'telefono', 'phone']) ?? 'No especificado';
      const correo = colVal(item, ['correo', 'email', 'mail']) ?? 'No especificado';
      const ig = colVal(item, ['instagram', 'ig', 'redes']) ?? 'No especificado';
      return `Acaba de llegar un cliente nuevo al onboarding.
Nombre del negocio: ${ev.itemName}
Tipo de negocio: ${tipo}
WhatsApp: ${wa}
Correo: ${correo}
Instagram: ${ig}
Redactá un aviso para el equipo que diga que entró un cliente nuevo, con los datos más importantes y que alguien lo tome.`;
    }

    case 'status_change': {
      const resp = colVal(item, ['responsable', 'asignado', 'assigned']) ?? 'Sin asignar';
      const cliente = colVal(item, ['cliente', 'client']) ?? 'Sin cliente';
      const newVal = String(ev.newValue ?? '').toLowerCase();
      const urgente = ['bloqueado', 'blocked', 'necesita revisión', 'necesita revision'].some(
        (s) => newVal.includes(s)
      );
      return `En el board de ${ev.boardName === 'tareas' ? 'Tareas Mercadeo' : 'Onboarding'}, el item "${ev.itemName}" cambió su estado.
Estado anterior: ${ev.previousValue ?? 'Sin estado'}
Estado nuevo: ${ev.newValue ?? 'Sin estado'}
Responsable: ${resp}
Cliente: ${cliente}${urgente ? '\nEs urgente, el equipo necesita atenderlo.' : ''}
Redactá un aviso claro para el grupo.`;
    }

    case 'date_set': {
      const resp = colVal(item, ['responsable', 'asignado', 'assigned']) ?? 'Sin asignar';
      const cliente = colVal(item, ['cliente', 'client']) ?? 'Sin cliente';
      const when = daysUntil(ev.newValue);
      return `La tarea "${ev.itemName}" tiene fecha de entrega asignada.
Fecha de entrega: ${ev.newValue ?? 'Sin fecha'}${when ? ` (${when})` : ''}
Responsable: ${resp}
Cliente: ${cliente}
Redactá un recordatorio para el equipo con los datos relevantes.`;
    }

    case 'assignment_change': {
      const cliente = colVal(item, ['cliente', 'client']) ?? 'Sin cliente';
      const dateCol = item?.column_values?.find((c) => c.type === 'date');
      const fecha = dateCol?.text ?? null;
      const when = daysUntil(fecha);
      const estado = colVal(item, ['estado', 'status']) ?? 'Sin estado';
      const newResp = Array.isArray(ev.newValue)
        ? ev.newValue.join(', ')
        : (ev.newValue ?? 'Sin asignar');
      return `La tarea "${ev.itemName}" acaba de ser asignada o reasignada.
Nuevo responsable: ${newResp}
Cliente: ${cliente}
Fecha de entrega: ${fecha ?? 'Sin fecha'}${when ? ` (${when})` : ''}
Estado actual: ${estado}
Redactá un aviso para que el responsable sepa que tiene una tarea nueva.`;
    }

    default:
      return null;
  }
};

const callClaude = async (prompt, maxTokens = 400) => {
  const res = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    system: SYSTEM,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content[0]?.text ?? null;
};

export const generateMessage = async (ev, item) => {
  const prompt = buildPrompt(ev, item);
  if (!prompt) return null;
  return callClaude(prompt);
};

export const generateDailyBriefing = async (context) => {
  return callClaude(
    `${context}\n\nCon este resumen, redactá el briefing matutino del equipo de Blindspot.\nTiene que ser el mensaje de WhatsApp que abre el día de trabajo del equipo.\nIncluí todo lo urgente primero. Máximo 15 líneas. Español de Costa Rica.`,
    600
  );
};

export const generateAlertMessage = async (items, alertType) => {
  const formatItem = (item) => {
    const resp = item.column_values?.find(
      (c) => c.title?.toLowerCase().includes('responsable') || c.title?.toLowerCase().includes('asignado')
    )?.text ?? 'Sin asignar';
    const cliente = item.column_values?.find((c) =>
      c.title?.toLowerCase().includes('cliente')
    )?.text ?? 'Sin cliente';
    const fecha = item.column_values?.find((c) => c.type === 'date')?.text ?? 'Sin fecha';
    const estado = item.column_values?.find(
      (c) => c.type === 'color' || c.title?.toLowerCase().includes('estado')
    )?.text ?? 'Sin estado';

    return alertType === 'upcoming'
      ? `- ${item.name} | Resp: ${resp} | Cliente: ${cliente} | Fecha: ${fecha}`
      : `- ${item.name} | Resp: ${resp} | Estado: ${estado}`;
  };

  const list = items.map(formatItem).join('\n');
  const prompt =
    alertType === 'upcoming'
      ? `Las siguientes tareas tienen entrega en las próximas 48 horas:\n${list}\nRedactá una alerta para el grupo. Máximo 8 líneas.`
      : `Las siguientes tareas llevan más de 48 horas sin actualización:\n${list}\nRedactá un aviso para revisar estas tareas estancadas. Máximo 8 líneas.`;

  return callClaude(prompt);
};
