/**
 * 健康检查接口 - 测试 Edge Function 是否正常工作
 */
export async function onRequestGet() {
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'HaoNav Edge Function is working'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
