/**
 * EdgeOne Edge Functions API for KV Storage
 * 处理与 KV 存储的所有交互，使用分离的键值存储提高性能
 */

// KV 键名定义 - 分类存储以提高加载速度
const KV_KEYS = {
  CATEGORIES: 'haonav_categories',
  LINKS: 'haonav_links',
  SETTINGS: 'haonav_settings',
  SEARCH_ENGINES: 'haonav_search_engines',
  AUTH_PASSWORD: 'haonav_auth_password'
};

/**
 * 从 KV 读取所有数据
 */
async function getAllData(HaoNav_KV: any) {
  try {
    const [categories, links, settings, searchEngines] = await Promise.all([
      HaoNav_KV.get(KV_KEYS.CATEGORIES, { type: 'json' }),
      HaoNav_KV.get(KV_KEYS.LINKS, { type: 'json' }),
      HaoNav_KV.get(KV_KEYS.SETTINGS, { type: 'json' }),
      HaoNav_KV.get(KV_KEYS.SEARCH_ENGINES, { type: 'json' })
    ]);

    return {
      categories: categories || [],
      links: links || [],
      settings: settings || {},
      searchEngines: searchEngines || null
    };
  } catch (error) {
    console.error('Error reading from KV:', error);
    throw error;
  }
}

/**
 * 验证密码
 */
async function verifyPassword(HaoNav_KV: any, password: string) {
  try {
    const storedPassword = await HaoNav_KV.get(KV_KEYS.AUTH_PASSWORD);
    if (!storedPassword) {
      await HaoNav_KV.put(KV_KEYS.AUTH_PASSWORD, password);
      return true;
    }
    return password === storedPassword;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * 保存数据
 */
async function saveData(HaoNav_KV: any, data: any, password?: string) {
  try {
    const operations = [];

    if (data.categories !== undefined) {
      operations.push(HaoNav_KV.put(KV_KEYS.CATEGORIES, JSON.stringify(data.categories)));
    }
    if (data.links !== undefined) {
      operations.push(HaoNav_KV.put(KV_KEYS.LINKS, JSON.stringify(data.links)));
    }
    if (data.settings !== undefined) {
      operations.push(HaoNav_KV.put(KV_KEYS.SETTINGS, JSON.stringify(data.settings)));
    }
    if (data.searchEngines !== undefined) {
      operations.push(HaoNav_KV.put(KV_KEYS.SEARCH_ENGINES, JSON.stringify(data.searchEngines)));
    }
    if (password !== undefined) {
      operations.push(HaoNav_KV.put(KV_KEYS.AUTH_PASSWORD, password));
    }

    await Promise.all(operations);
  } catch (error) {
    console.error('Error saving to KV:', error);
    throw error;
  }
}

/**
 * 主入口函数 - EdgeOne Edge Functions
 */
export async function onRequest({ request, env }: { request: Request; env: any }) {
  const HaoNav_KV = env.HaoNav_KV;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-auth-password',
  };

  // Handle OPTIONS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Handle GET
  if (request.method === 'GET') {
    try {
      const password = request.headers.get('x-auth-password');
      const isAuthorized = password ? await verifyPassword(HaoNav_KV, password) : true;

      if (!isAuthorized) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const data = await getAllData(HaoNav_KV);
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      console.error('GET error:', error);
      return new Response(JSON.stringify({ error: 'Failed to read data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  // Handle POST
  if (request.method === 'POST') {
    try {
      const password = request.headers.get('x-auth-password');

      if (!password) {
        return new Response(JSON.stringify({ error: 'Password required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const isValid = await verifyPassword(HaoNav_KV, password);
      if (!isValid) {
        return new Response(JSON.stringify({ error: 'Invalid password' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      const body = await request.json();
      await saveData(HaoNav_KV, body, password);

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    } catch (error) {
      console.error('POST error:', error);
      return new Response(JSON.stringify({ error: 'Failed to save data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: corsHeaders
  });
}
