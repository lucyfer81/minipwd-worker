import { encrypt, decrypt } from './crypto';
import { createToken, verifyToken } from './auth';
import { generatePassword } from './password';
import { getAllItems, createItem, updateItem, deleteItem, type Env, type PasswordItem } from './db';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Serve static assets
      if (path === '/' || path === '/index.html') {
        const asset = await env.ASSETS.fetch(new Request(url.origin + '/index.html'));
        return new Response(asset.body, {
          headers: { ...corsHeaders, 'Content-Type': 'text/html;charset=UTF-8' },
        });
      }

      // API: 登录
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { password } = await request.json();

        // 主密码仅用于身份验证
        const masterPassword = env.MASTER_PASSWORD || '';
        if (password === masterPassword) {
          const duration = parseInt(env.SESSION_DURATION || '1800');
          const token = await createToken(env.JWT_SECRET, duration);
          return Response.json({ token, expiresAt: Date.now() + duration * 1000 }, { headers: corsHeaders });
        }

        return Response.json({ error: 'Invalid password' }, { status: 401, headers: corsHeaders });
      }

      // API: 生成密码
      if (path === '/api/generate-password' && request.method === 'GET') {
        const options = {
          length: parseInt(url.searchParams.get('length') || '16'),
          uppercase: url.searchParams.get('uppercase') !== 'false',
          lowercase: url.searchParams.get('lowercase') !== 'false',
          numbers: url.searchParams.get('numbers') !== 'false',
          symbols: url.searchParams.get('symbols') !== 'false',
          excludeSimilar: url.searchParams.get('excludeSimilar') === 'true',
        };

        const password = generatePassword(options);
        return Response.json({ password }, { headers: corsHeaders });
      }

      // 验证 token (除登录外的所有 API 请求)
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

      // API: 获取所有条目
      if (path === '/api/items' && request.method === 'GET') {
        const items = await getAllItems(env);
        // 解密密码（使用独立的加密密钥）
        const decryptedItems = await Promise.all(
          items.map(async (item) => ({
            ...item,
            password: await decrypt(item.password, env.ENCRYPTION_KEY),
          }))
        );
        return Response.json(decryptedItems, { headers: corsHeaders });
      }

      // API: 创建条目
      if (path === '/api/items' && request.method === 'POST') {
        const data = await request.json();
        const encryptedPassword = await encrypt(data.password, env.ENCRYPTION_KEY);
        const item = await createItem(env, {
          ...data,
          password: encryptedPassword,
        });
        return Response.json(item, { status: 201, headers: corsHeaders });
      }

      // API: 更新条目
      if (path.startsWith('/api/items/') && request.method === 'PUT') {
        const id = parseInt(path.split('/').pop()!);
        const data = await request.json();
        const encryptedPassword = await encrypt(data.password, env.ENCRYPTION_KEY);
        const item = await updateItem(env, id, {
          ...data,
          password: encryptedPassword,
        });
        return Response.json(item, { headers: corsHeaders });
      }

      // API: 删除条目
      if (path.startsWith('/api/items/') && request.method === 'DELETE') {
        const id = parseInt(path.split('/').pop()!);
        await deleteItem(env, id);
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error(error);
      return Response.json({ error: 'Internal server error' }, { status: 500, headers: corsHeaders });
    }
  },
} satisfies ExportedHandler<Env>;
