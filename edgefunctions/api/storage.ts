/**
 * EdgeOne Edge Functions API for KV Storage
 * 处理与 KV 存储的所有交互，使用分离的键值存储提高性能
 */

// KV 键名定义 - 分类存储以提高加载速度
export const KV_KEYS = {
  // 分类数据
  CATEGORIES: 'haonav_categories',
  // 链接数据
  LINKS: 'haonav_links',
  // 系统设置
  SETTINGS: 'haonav_settings',
  // 搜索引擎配置
  SEARCH_ENGINES: 'haonav_search_engines',
  // 认证密码
  AUTH_PASSWORD: 'haonav_auth_password'
};

export interface StorageData {
  links?: any[];
  categories?: any[];
  settings?: any;
  searchEngines?: any[];
}

/**
 * 从 KV 读取所有数据（分离读取，提高性能）
 */
export async function getAllData(HaoNav_KV: any): Promise<StorageData> {
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
 * 验证密码是否正确
 */
export async function verifyPassword(HaoNav_KV: any, password: string): Promise<boolean> {
  try {
    const storedPassword = await HaoNav_KV.get(KV_KEYS.AUTH_PASSWORD);
    if (!storedPassword) {
      // 如果没有设置密码，首次使用时保存密码
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
 * 保存数据到 KV（分离写入，提高性能）
 */
export async function saveData(
  HaoNav_KV: any,
  data: StorageData,
  password?: string
): Promise<void> {
  try {
    const operations = [];

    // 分别保存各类数据
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

    // 并行执行所有写入操作
    await Promise.all(operations);
  } catch (error) {
    console.error('Error saving to KV:', error);
    throw error;
  }
}

/**
 * 验证请求并返回数据
 */
export async function handleGetRequest(HaoNav_KV: any, request: Request): Promise<Response> {
  try {
    const password = request.headers.get('x-auth-password');
    const isAuthorized = password ? await verifyPassword(HaoNav_KV, password) : true; // 允许公开读取

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await getAllData(HaoNav_KV);
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to read data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 处理保存数据的请求
 */
export async function handlePostRequest(HaoNav_KV: any, request: Request): Promise<Response> {
  try {
    const password = request.headers.get('x-auth-password');

    if (!password) {
      return new Response(JSON.stringify({ error: 'Password required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isValid = await verifyPassword(HaoNav_KV, password);
    if (!isValid) {
      return new Response(JSON.stringify({ error: 'Invalid password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    await saveData(HaoNav_KV, body, password);

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to save data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 主入口函数
 */
export async function onRequest(context: { request: Request; env: any }): Promise<Response> {
  const { request, env } = context;
  
  // 获取 HaoNav_KV 绑定
  const HaoNav_KV = env.HaoNav_KV;

  // 处理 CORS
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-auth-password',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method === 'GET') {
    const response = await handleGetRequest(HaoNav_KV, request);
    return new Response(response.body, {
      status: response.status,
      headers: { ...corsHeaders, ...Object.fromEntries(response.headers.entries()) }
    });
  }

  if (request.method === 'POST') {
    const response = await handlePostRequest(HaoNav_KV, request);
    return new Response(response.body, {
      status: response.status,
      headers: { ...corsHeaders, ...Object.fromEntries(response.headers.entries()) }
    });
  }

  return new Response('Method not allowed', {
    status: 405,
    headers: corsHeaders
  });
}
