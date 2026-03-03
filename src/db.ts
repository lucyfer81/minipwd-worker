export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  MASTER_PASSWORD: string; // 仅用于登录认证
  ENCRYPTION_KEY: string; // 用于数据加解密，永久不变
  JWT_SECRET: string;
  SESSION_DURATION: string;
}

export type ItemSpace = 'personal' | 'work';
export type ItemSort = 'updated_desc' | 'used_desc' | 'title_asc';

export interface ItemSummary {
  id: number;
  space: ItemSpace;
  title: string;
  username: string;
  login_url: string | null;
  notes: string | null;
  folder: string | null;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
  last_used_at: string | null;
}

export interface PasswordItem extends ItemSummary {
  password: string;
}

export interface ItemInput {
  space?: ItemSpace;
  title: string;
  username: string;
  password: string;
  login_url?: string | null;
  notes?: string | null;
  folder?: string | null;
  tags?: string[];
}

export interface ListItemsOptions {
  space?: ItemSpace | 'all';
  q?: string;
  sort?: ItemSort;
}

interface RawItemRow {
  id: unknown;
  space: unknown;
  title: unknown;
  username: unknown;
  password?: unknown;
  login_url: unknown;
  notes: unknown;
  folder: unknown;
  tags_json: unknown;
  created_at: unknown;
  updated_at: unknown;
  last_used_at: unknown;
}

let schemaReadyPromise: Promise<void> | null = null;

function normalizeSpace(space: string | undefined | null): ItemSpace {
  return space === 'work' ? 'work' : 'personal';
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function normalizeNullableString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  const text = normalizeString(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTags(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function serializeTags(tags: string[] | undefined): string | null {
  if (!tags || tags.length === 0) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      tags
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );

  if (normalized.length === 0) {
    return null;
  }

  return JSON.stringify(normalized);
}

function toRawItemRow(row: Record<string, unknown>): RawItemRow {
  return {
    id: row.id,
    space: row.space,
    title: row.title,
    username: row.username,
    password: row.password,
    login_url: row.login_url,
    notes: row.notes,
    folder: row.folder,
    tags_json: row.tags_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
  };
}

function mapToItemSummary(row: RawItemRow): ItemSummary {
  return {
    id: normalizeNumber(row.id),
    space: normalizeSpace(normalizeNullableString(row.space)),
    title: normalizeString(row.title),
    username: normalizeString(row.username),
    login_url: normalizeNullableString(row.login_url),
    notes: normalizeNullableString(row.notes),
    folder: normalizeNullableString(row.folder),
    tags: parseTags(row.tags_json),
    created_at: normalizeNullableString(row.created_at),
    updated_at: normalizeNullableString(row.updated_at),
    last_used_at: normalizeNullableString(row.last_used_at),
  };
}

function mapToPasswordItem(row: RawItemRow): PasswordItem {
  return {
    ...mapToItemSummary(row),
    password: normalizeString(row.password),
  };
}

function mapFirstPasswordItem(row: Record<string, unknown> | null): PasswordItem | null {
  if (!row) {
    return null;
  }
  return mapToPasswordItem(toRawItemRow(row));
}

async function ensureItemsSchemaInternal(env: Env): Promise<void> {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space TEXT NOT NULL DEFAULT 'personal' CHECK (space IN ('personal', 'work')),
      title TEXT NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      login_url TEXT,
      notes TEXT,
      folder TEXT,
      tags_json TEXT,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  const tableInfo = await env.DB.prepare('PRAGMA table_info(items)').all<Record<string, unknown>>();
  const existingColumns = new Set(
    (tableInfo.results ?? [])
      .map((row) => normalizeString(row.name))
      .filter((name) => name.length > 0)
  );

  const alterStatements: string[] = [];
  if (!existingColumns.has('space')) {
    alterStatements.push("ALTER TABLE items ADD COLUMN space TEXT NOT NULL DEFAULT 'personal'");
  }
  if (!existingColumns.has('folder')) {
    alterStatements.push('ALTER TABLE items ADD COLUMN folder TEXT');
  }
  if (!existingColumns.has('tags_json')) {
    alterStatements.push('ALTER TABLE items ADD COLUMN tags_json TEXT');
  }
  if (!existingColumns.has('last_used_at')) {
    alterStatements.push('ALTER TABLE items ADD COLUMN last_used_at DATETIME');
  }

  for (const sql of alterStatements) {
    await env.DB.prepare(sql).run();
  }

  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_space_updated_at ON items(space, updated_at DESC)').run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_items_space_last_used_at ON items(space, last_used_at DESC)'
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_space_title ON items(space, title)').run();
}

export function ensureItemsSchema(env: Env): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureItemsSchemaInternal(env).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

export async function listItems(env: Env, options: ListItemsOptions = {}): Promise<ItemSummary[]> {
  await ensureItemsSchema(env);

  const where: string[] = [];
  const params: Array<string | number> = [];

  if (options.space === 'personal' || options.space === 'work') {
    where.push('space = ?');
    params.push(options.space);
  }

  const query = options.q?.trim().toLowerCase();
  if (query) {
    where.push(`
      (
        lower(title) LIKE ?
        OR lower(username) LIKE ?
        OR lower(coalesce(login_url, '')) LIKE ?
        OR lower(coalesce(notes, '')) LIKE ?
        OR lower(coalesce(folder, '')) LIKE ?
        OR lower(coalesce(tags_json, '')) LIKE ?
      )
    `);

    const like = `%${query}%`;
    params.push(like, like, like, like, like, like);
  }

  const sortMap: Record<ItemSort, string> = {
    updated_desc: 'updated_at DESC',
    used_desc: 'COALESCE(last_used_at, updated_at) DESC',
    title_asc: 'title COLLATE NOCASE ASC',
  };

  const sort: ItemSort = options.sort && sortMap[options.sort] ? options.sort : 'updated_desc';
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const sql = `
    SELECT id, space, title, username, login_url, notes, folder, tags_json, created_at, updated_at, last_used_at
    FROM items
    ${whereSql}
    ORDER BY ${sortMap[sort]}
  `;

  const result = await env.DB.prepare(sql).bind(...params).all<Record<string, unknown>>();
  const rows = (result.results ?? []).map((row) => toRawItemRow(row));
  return rows.map(mapToItemSummary);
}

export async function getItemById(env: Env, id: number): Promise<PasswordItem | null> {
  await ensureItemsSchema(env);
  const row = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return mapFirstPasswordItem(row);
}

export async function createItem(env: Env, item: ItemInput): Promise<PasswordItem | null> {
  await ensureItemsSchema(env);
  const result = await env.DB.prepare(
    `INSERT INTO items (space, title, username, password, login_url, notes, folder, tags_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      normalizeSpace(item.space),
      item.title,
      item.username,
      item.password,
      normalizeNullableString(item.login_url),
      normalizeNullableString(item.notes),
      normalizeNullableString(item.folder),
      serializeTags(item.tags)
    )
    .first<Record<string, unknown>>();

  return mapFirstPasswordItem(result);
}

export async function updateItem(env: Env, id: number, item: ItemInput): Promise<PasswordItem | null> {
  await ensureItemsSchema(env);
  const result = await env.DB.prepare(
    `UPDATE items
     SET space = ?, title = ?, username = ?, password = ?, login_url = ?, notes = ?, folder = ?, tags_json = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
     RETURNING *`
  )
    .bind(
      normalizeSpace(item.space),
      item.title,
      item.username,
      item.password,
      normalizeNullableString(item.login_url),
      normalizeNullableString(item.notes),
      normalizeNullableString(item.folder),
      serializeTags(item.tags),
      id
    )
    .first<Record<string, unknown>>();

  return mapFirstPasswordItem(result);
}

export async function markItemUsed(env: Env, id: number): Promise<string | null> {
  await ensureItemsSchema(env);
  const row = await env.DB.prepare(
    'UPDATE items SET last_used_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING last_used_at'
  )
    .bind(id)
    .first<Record<string, unknown>>();

  return row ? normalizeNullableString(row.last_used_at) : null;
}

export async function deleteItem(env: Env, id: number): Promise<boolean> {
  await ensureItemsSchema(env);
  const result = await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}

export function toItemSummary(item: PasswordItem): ItemSummary {
  return {
    id: item.id,
    space: item.space,
    title: item.title,
    username: item.username,
    login_url: item.login_url,
    notes: item.notes,
    folder: item.folder,
    tags: item.tags,
    created_at: item.created_at,
    updated_at: item.updated_at,
    last_used_at: item.last_used_at,
  };
}
