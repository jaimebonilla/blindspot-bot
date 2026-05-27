import { logger } from './logger.js';

const boardName = (boardId) => {
  const id = String(boardId);
  if (id === String(process.env.BOARD_PROFESIONALES)) return 'profesionales';
  if (id === String(process.env.BOARD_TAREAS)) return 'tareas';
  return 'unknown';
};

const parseLabel = (val) => {
  if (!val) return 'Sin estado';
  try {
    const p = typeof val === 'string' ? JSON.parse(val) : val;
    return p?.label?.text ?? p?.label ?? 'Sin estado';
  } catch {
    return String(val);
  }
};

const parseDate = (val) => {
  if (!val) return null;
  try {
    const p = typeof val === 'string' ? JSON.parse(val) : val;
    return p?.date ?? null;
  } catch {
    return null;
  }
};

const parsePeople = (val) => {
  if (!val) return [];
  try {
    const p = typeof val === 'string' ? JSON.parse(val) : val;
    return (p?.personsAndTeams ?? []).map((x) => x.name ?? x.id).filter(Boolean);
  } catch {
    return [];
  }
};

export const classifyEvent = (body) => {
  const ev = body.event ?? body;

  const bid = String(ev.boardId ?? ev.board_id ?? '');
  const bname = boardName(bid);
  const itemId = String(ev.pulseId ?? ev.pulse_id ?? ev.itemId ?? ev.item_id ?? '');
  const itemName = ev.pulseName ?? ev.pulse_name ?? ev.itemName ?? ev.item_name ?? '';
  const colId = ev.columnId ?? ev.column_id ?? '';
  const colTitle = ev.columnTitle ?? ev.column_title ?? '';
  const colType = ev.columnType ?? ev.column_type ?? '';
  const prev = ev.previousValue ?? ev.previous_value;
  const next = ev.value ?? ev.newValue ?? ev.new_value;

  const base = {
    boardId: bid,
    boardName: bname,
    itemId,
    itemName,
    columnId: colId,
    columnTitle: colTitle,
    rawEvent: ev,
  };

  const type = ev.type;

  if ((type === 'create_pulse' || type === 'create_item') && bname === 'profesionales') {
    return { ...base, type: 'new_client', previousValue: null, newValue: null };
  }

  if (type === 'update_column_value') {
    if (colType === 'color' || colType === 'status') {
      return {
        ...base,
        type: 'status_change',
        previousValue: parseLabel(prev),
        newValue: parseLabel(next),
      };
    }

    if (colType === 'date') {
      return {
        ...base,
        type: 'date_set',
        previousValue: parseDate(prev),
        newValue: parseDate(next),
      };
    }

    if (colType === 'people' || colType === 'multiple-person') {
      return {
        ...base,
        type: 'assignment_change',
        previousValue: parsePeople(prev),
        newValue: parsePeople(next),
      };
    }
  }

  logger.warn(`Evento no clasificado: type=${type} | board=${bname} | col=${colType}`);
  return { ...base, type: 'unknown', previousValue: null, newValue: null };
};
