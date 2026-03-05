import { encrypt, decrypt } from './crypto';
import { createToken, verifyToken } from './auth';
import { generatePassword } from './password';
import {
  listItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  markItemUsed,
  toItemSummary,
  type Env,
  type ItemInput,
  type ItemSort,
  type ItemSpace,
} from './db';

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface RawItemPayload {
  space?: unknown;
  title?: unknown;
  username?: unknown;
  password?: unknown;
  login_url?: unknown;
  notes?: unknown;
  tags?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSpace(raw: unknown, fallback: ItemSpace = 'personal'): ItemSpace {
  if (raw == null || raw === '') {
    return fallback;
  }
  if (raw === 'personal' || raw === 'work') {
    return raw;
  }
  throw new HttpError(400, 'Invalid space, expected personal or work');
}

function parseOptionalString(raw: unknown): string | null {
  if (raw == null) {
    return null;
  }
  if (typeof raw !== 'string') {
    throw new HttpError(400, 'Invalid text field type');
  }
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

function parseRequiredString(raw: unknown, fieldName: string, trim = true): string {
  if (typeof raw !== 'string') {
    throw new HttpError(400, `Missing or invalid ${fieldName}`);
  }

  const value = trim ? raw.trim() : raw;
  if (value.length === 0) {
    throw new HttpError(400, `${fieldName} cannot be empty`);
  }
  return value;
}

function parseTags(raw: unknown): string[] {
  if (raw == null) {
    return [];
  }

  let values: string[] = [];
  if (Array.isArray(raw)) {
    values = raw.filter((item): item is string => typeof item === 'string');
  } else if (typeof raw === 'string') {
    values = raw.split(',');
  } else {
    throw new HttpError(400, 'Invalid tags format');
  }

  return Array.from(
    new Set(
      values
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

function parseSort(raw: string | null): ItemSort {
  if (!raw || raw === 'updated_desc') {
    return 'updated_desc';
  }
  if (raw === 'used_desc' || raw === 'title_asc') {
    return raw;
  }
  throw new HttpError(400, 'Invalid sort value');
}

function parseListSpace(raw: string | null): ItemSpace | 'all' {
  if (!raw || raw === 'all') {
    return 'all';
  }
  if (raw === 'personal' || raw === 'work') {
    return raw;
  }
  throw new HttpError(400, 'Invalid space filter');
}

function parseItemId(path: string): number {
  const itemMatch = path.match(/^\/api\/items\/(\d+)$/);
  if (!itemMatch) {
    throw new HttpError(400, 'Invalid item id');
  }
  const id = Number.parseInt(itemMatch[1], 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid item id');
  }
  return id;
}

function parseUsedItemId(path: string): number {
  const match = path.match(/^\/api\/items\/(\d+)\/used$/);
  if (!match) {
    throw new HttpError(400, 'Invalid item id');
  }
  const id = Number.parseInt(match[1], 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'Invalid item id');
  }
  return id;
}

async function parseItemInput(request: Request): Promise<ItemInput> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }

  if (!isRecord(payload)) {
    throw new HttpError(400, 'Invalid request body');
  }

  const body = payload as RawItemPayload;

  return {
    space: parseSpace(body.space),
    title: parseRequiredString(body.title, 'title'),
    username: parseRequiredString(body.username, 'username'),
    password: parseRequiredString(body.password, 'password', false),
    login_url: parseOptionalString(body.login_url),
    notes: parseOptionalString(body.notes),
    tags: parseTags(body.tags),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/' || path === '/index.html') {
        const asset = await env.ASSETS.fetch(new Request(url.origin + '/index.html'));
        return new Response(asset.body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/html;charset=UTF-8' },
        });
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json().catch(() => ({} as { password?: unknown }));
        const password = isRecord(body) ? body.password : undefined;
        const inputPassword = typeof password === 'string' ? password : '';

        const masterPassword = env.MASTER_PASSWORD || '';
        if (inputPassword === masterPassword) {
          const duration = Number.parseInt(env.SESSION_DURATION || '1800', 10);
          const safeDuration = Number.isFinite(duration) ? duration : 1800;
          const token = await createToken(env.JWT_SECRET, safeDuration);
          return Response.json({ token, expiresAt: Date.now() + safeDuration * 1000 }, { headers: corsHeaders });
        }

        return Response.json({ error: 'Invalid password' }, { status: 401, headers: corsHeaders });
      }

      if (path === '/api/generate-password' && request.method === 'GET') {
        const options = {
          length: Number.parseInt(url.searchParams.get('length') || '16', 10),
          uppercase: url.searchParams.get('uppercase') !== 'false',
          lowercase: url.searchParams.get('lowercase') !== 'false',
          numbers: url.searchParams.get('numbers') !== 'false',
          symbols: url.searchParams.get('symbols') !== 'false',
          excludeSimilar: url.searchParams.get('excludeSimilar') === 'true',
        };

        const password = generatePassword(options);
        return Response.json({ password }, { headers: corsHeaders });
      }

      if (path.startsWith('/api/')) {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
        }

        const token = authHeader.substring(7);
        const payload = await verifyToken(token, env.JWT_SECRET);
        if (!payload) {
          return Response.json({ error: 'Invalid or expired token' }, { status: 401, headers: corsHeaders });
        }
      }

      if (path === '/api/items' && request.method === 'GET') {
        const items = await listItems(env, {
          space: parseListSpace(url.searchParams.get('space')),
          q: url.searchParams.get('q') ?? undefined,
          sort: parseSort(url.searchParams.get('sort')),
        });
        return Response.json(items, { headers: corsHeaders });
      }

      if (path === '/api/items' && request.method === 'POST') {
        const data = await parseItemInput(request);
        const encryptedPassword = await encrypt(data.password, env.ENCRYPTION_KEY);

        const created = await createItem(env, {
          ...data,
          password: encryptedPassword,
        });

        if (!created) {
          throw new HttpError(500, 'Failed to create item');
        }

        return Response.json(toItemSummary(created), { status: 201, headers: corsHeaders });
      }

      if (path.match(/^\/api\/items\/\d+\/used$/) && request.method === 'POST') {
        const id = parseUsedItemId(path);
        const lastUsedAt = await markItemUsed(env, id);

        if (!lastUsedAt) {
          return Response.json({ error: 'Item not found' }, { status: 404, headers: corsHeaders });
        }

        return Response.json({ last_used_at: lastUsedAt }, { headers: corsHeaders });
      }

      if (path.match(/^\/api\/items\/\d+$/) && request.method === 'GET') {
        const id = parseItemId(path);
        const item = await getItemById(env, id);
        if (!item) {
          return Response.json({ error: 'Item not found' }, { status: 404, headers: corsHeaders });
        }

        const decryptedPassword = await decrypt(item.password, env.ENCRYPTION_KEY);
        return Response.json({ ...toItemSummary(item), password: decryptedPassword }, { headers: corsHeaders });
      }

      if (path.match(/^\/api\/items\/\d+$/) && request.method === 'PUT') {
        const id = parseItemId(path);
        const data = await parseItemInput(request);
        const encryptedPassword = await encrypt(data.password, env.ENCRYPTION_KEY);

        const updated = await updateItem(env, id, {
          ...data,
          password: encryptedPassword,
        });

        if (!updated) {
          return Response.json({ error: 'Item not found' }, { status: 404, headers: corsHeaders });
        }

        return Response.json(toItemSummary(updated), { headers: corsHeaders });
      }

      if (path.match(/^\/api\/items\/\d+$/) && request.method === 'DELETE') {
        const id = parseItemId(path);
        const deleted = await deleteItem(env, id);
        if (!deleted) {
          return Response.json({ error: 'Item not found' }, { status: 404, headers: corsHeaders });
        }
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ error: error.message }, { status: error.status, headers: corsHeaders });
      }

      console.error(error);
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
  },
} satisfies ExportedHandler<Env>;
