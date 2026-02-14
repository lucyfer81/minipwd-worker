export interface Env {
  DB: D1Database;
  MASTER_PASSWORD: string;  // 仅用于登录认证
  ENCRYPTION_KEY: string;   // 用于数据加解密，永久不变
  JWT_SECRET: string;
  SESSION_DURATION: string;
}

export interface PasswordItem {
  id?: number;
  title: string;
  username: string;
  password: string;
  login_url?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getAllItems(env: Env): Promise<PasswordItem[]> {
  const result = await env.DB.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
  return result.results.map((row: any) => ({
    id: row.id,
    title: row.title,
    username: row.username,
    password: row.password,
    login_url: row.login_url,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function getItemById(env: Env, id: number): Promise<PasswordItem | null> {
  const result = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
  return result as PasswordItem | null;
}

export async function createItem(env: Env, item: PasswordItem): Promise<PasswordItem> {
  const result = await env.DB.prepare(
    'INSERT INTO items (title, username, password, login_url, notes) VALUES (?, ?, ?, ?, ?) RETURNING *'
  )
    .bind(item.title, item.username, item.password, item.login_url || null, item.notes || null)
    .first();

  return result as PasswordItem;
}

export async function updateItem(env: Env, id: number, item: PasswordItem): Promise<PasswordItem> {
  const result = await env.DB.prepare(
    'UPDATE items SET title = ?, username = ?, password = ?, login_url = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *'
  )
    .bind(item.title, item.username, item.password, item.login_url || null, item.notes || null, id)
    .first();

  return result as PasswordItem;
}

export async function deleteItem(env: Env, id: number): Promise<boolean> {
  const result = await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}
