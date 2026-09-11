interface Env {
  CLOUDNAV_KV: any;
  PASSWORD: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-auth-password',
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

// 获取 WebDAV 配置
export const onRequestGet = async (context: { env: Env }) => {
  try {
    const { env } = context;
    const config = await env.CLOUDNAV_KV.get('webdav_config');
    
    if (!config) {
      return new Response(JSON.stringify({ url: '', username: '', enabled: false }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(config, {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch WebDAV config' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};

// 保存 WebDAV 配置
export const onRequestPost = async (context: { request: Request; env: Env }) => {
  const { request, env } = context;

  const password = request.headers.get('x-auth-password');
  if (!password || password !== env.PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json();
    await env.CLOUDNAV_KV.put('webdav_config', JSON.stringify(body));

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to save WebDAV config' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};
