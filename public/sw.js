/* HaoNav 图标缓存 Service Worker
 * 纯 JS、不参与打包：public/sw.js → 原样拷到 dist/sw.js，scope = "/"。
 *
 * 只做一件事：缓存「跨站图片」请求（图标服务直连 + 用户自定义外链图标）。
 *
 * ⚠️ 铁律：本站 HTML / JS / CSS / /api/* 一律不拦截、不缓存 —— 一旦缓存了构建产物
 *    （如 assets/main-*.css），站点就再也更新不了了。这是本文件最大的风险点，
 *    所有分支都以「不调用 respondWith = 走浏览器默认网络」为安全默认。
 *
 * 为什么需要它：Makers 边缘函数的 caches.default 的 cache.put() 一律抛
 * "forbidden cdn cache"，后端代理拿不到任何缓存，只能在浏览器侧做。
 */

const CACHE_NAME = 'haonav-icons-v1';
/** 缓存条目上限，超出删除最旧的 */
const MAX_ENTRIES = 300;
/** 图片扩展名（pathname 不含 query，直接锚定结尾即可） */
const IMG_EXT = /\.(?:png|jpe?g|gif|webp|ico|svg|avif)$/i;

/** 只认跨站 GET 图片 */
function isCrossOriginImage(request, url) {
  if (request.method !== 'GET') return false;
  // 只处理 http(s)：data:/blob: 等 origin 是 "null" 字符串，会被误判成跨站
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.origin === self.location.origin) return false; // 本站资源一律放行
  // destination 为 image（<img> 直出），或 URL 看着就是图片（图标服务 /api/icon?url= 这类不带扩展名的
  // 场景由 destination 兜；自定义外链带扩展名的由后缀兜）
  return request.destination === 'image' || IMG_EXT.test(url.pathname);
}

/** 接受条件：ok 或 opaque。跨域 no-cors 响应 status 为 0、type 为 opaque，
 *  cache.put 允许存储，必须放行 —— 否则用户填的自定义外链一个都存不下来。
 *  不检查 Cache-Control：bigjpg 那种 no-cache 也要能存（外链基本都是不变静态图）。 */
function acceptable(response) {
  return !!response && (response.ok || response.type === 'opaque');
}

/** 超容量时删最旧的：cache.keys() 按插入顺序返回，从头删即可 */
async function trim(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) {
      await cache.delete(keys[i]);
    }
  } catch (e) {
    /* 清理失败不影响缓存命中 */
  }
}

async function store(cache, key, response) {
  try {
    await cache.put(key, response);
    await trim(cache);
  } catch (e) {
    /* 配额不足 / opaque 被拒：忽略，下次再存 */
  }
}

/** 命中缓存：先返回旧的，后台静默更新（SWR） */
async function revalidate(cache, request) {
  try {
    const response = await fetch(request);
    if (acceptable(response)) return store(cache, request.url, response.clone());
  } catch (e) {
    /* 离线或网络错误：保留旧缓存 */
  }
}

async function handleImage(event, request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url).catch(() => null);

  if (cached) {
    event.waitUntil(revalidate(cache, request));
    return cached;
  }

  // 未命中：正常取网络，成功后入缓存
  const response = await fetch(request);
  if (acceptable(response)) event.waitUntil(store(cache, request.url, response.clone()));
  return response;
}

self.addEventListener('fetch', (event) => {
  try {
    const request = event.request;
    let url;
    try {
      url = new URL(request.url);
    } catch (e) {
      return;
    }
    if (!isCrossOriginImage(request, url)) return; // ← 不是跨站图片：不 respondWith，走默认网络

    // 兜底：任何异常都退回默认网络，绝不让页面请求失败
    event.respondWith(handleImage(event, request).catch(() => fetch(request)));
  } catch (e) {
    /* 什么都不做：不 respondWith = 浏览器默认行为 */
  }
});

self.addEventListener('install', (event) => {
  // 新版本尽快接管（配合 activate 的清理），失败不影响安装
  try {
    event.waitUntil(self.skipWaiting());
  } catch (e) {
    /* noop */
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })().catch(() => {}),
  );
});
