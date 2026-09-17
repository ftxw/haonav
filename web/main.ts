import { createApp } from 'vue';
import App from './App.vue';
import './styles/app.css';

createApp(App).mount('#app');

/**
 * Service Worker：跨站图标缓存（public/sw.js → dist/sw.js，scope "/"）。
 * 纯加速用途，任何一步失败都必须静默 —— 注册失败绝不能影响页面。
 *
 * 逃生门（SW 有 bug 时极难清理，必须留）：
 *   URL 带 ?nosw，或 localStorage['haonav.v1.nosw'] === '1'
 *   → 反注册已有的 SW 且不注册新的。
 */
function setupServiceWorker(): void {
  if (!import.meta.env.PROD) return; // 只在生产构建注册
  if (location.protocol !== 'https:') return; // SW 需要安全上下文
  if (!('serviceWorker' in navigator)) return;

  let killed = false;
  try {
    killed = new URLSearchParams(location.search).has('nosw') || localStorage.getItem('haonav.v1.nosw') === '1';
  } catch {
    killed = new URLSearchParams(location.search).has('nosw');
  }

  if (killed) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => r.unregister()))
      .catch(() => {});
    return;
  }

  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}

setupServiceWorker();
