import 'dotenv/config';
import { logger } from './logger.js';

const MONDAY_API_URL = 'https://api.monday.com/v2';

const gql = async (query, variables = {}) => {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MONDAY_API_KEY}`,
      'Content-Type': 'application/json',
      'API-Version': '2024-01',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Monday HTTP ${res.status}: ${res.statusText}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(`Monday GraphQL: ${JSON.stringify(json.errors)}`);

  return json.data;
};

export const getBoardColumns = async (boardId) => {
  const data = await gql(
    `query($id: ID!) {
      boards(ids: [$id]) {
        columns { id title type }
      }
    }`,
    { id: String(boardId) }
  );
  return data.boards[0]?.columns ?? [];
};

const normalizeItems = (items) =>
  items.map((item) => ({
    ...item,
    column_values: item.column_values.map((cv) => ({
      ...cv,
      title: cv.column?.title ?? cv.id,
    })),
  }));

export const getBoardItems = async (boardId) => {
  const data = await gql(
    `query($id: ID!) {
      boards(ids: [$id]) {
        items_page(limit: 500) {
          items {
            id
            name
            updated_at
            column_values {
              id
              type
              value
              text
              column { title }
            }
          }
        }
      }
    }`,
    { id: String(boardId) }
  );
  return normalizeItems(data.boards[0]?.items_page?.items ?? []);
};

export const getItemById = async (itemId) => {
  const data = await gql(
    `query($id: ID!) {
      items(ids: [$id]) {
        id
        name
        updated_at
        board { id name }
        column_values {
          id
          type
          value
          text
          column { title }
        }
      }
    }`,
    { id: String(itemId) }
  );
  const item = data.items?.[0] ?? null;
  return item ? normalizeItems([item])[0] : null;
};

export const getItemsWithUpcomingDates = async (boardId, daysAhead) => {
  const items = await getBoardItems(boardId);
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 86_400_000);

  return items.filter((item) =>
    item.column_values.some((col) => {
      if (col.type !== 'date' || !col.value) return false;
      try {
        const { date } = JSON.parse(col.value);
        if (!date) return false;
        const d = new Date(date);
        return d >= now && d <= cutoff;
      } catch {
        return false;
      }
    })
  );
};

export const getStuckItems = async (boardId, hoursThreshold) => {
  const items = await getBoardItems(boardId);
  const cutoff = Date.now() - hoursThreshold * 3_600_000;
  return items.filter((item) => new Date(item.updated_at).getTime() < cutoff);
};
