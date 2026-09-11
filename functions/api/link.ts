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

// 添加链接
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
    const currentData = await env.CLOUDNAV_KV.get('app_data');
    let data = currentData ? JSON.parse(currentData) : { links: [], categories: [] };

    // 添加新链接
    const newLink = {
      id: Date.now().toString(),
      title: body.title || '未命名',
      url: body.url,
      categoryId: body.categoryId || 'common',
      icon: body.icon || '',
      createdAt: Date.now(),
      pinned: false
    };

    data.links.unshift(newLink);

    await env.CLOUDNAV_KV.put('app_data', JSON.stringify(data));

    return new Response(JSON.stringify({ success: true, link: newLink }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to add link' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
};
