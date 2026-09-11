import type { ThemeMode } from './models';

const MQ = '(prefers-color-scheme: dark)';

function media(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(MQ)
    : null;
}

export function isDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return media()?.matches === true;
}

/** 暗色 = <html class="dark">，纯 CSS 变量/类驱动，无 JS 参与渲染 */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', isDark(mode));
}

/** 主色写进 CSS 变量，无需改 Tailwind 配置、无需重新构建 */
export function applyAccent(accent: string): void {
  if (!accent) return;
  document.documentElement.style.setProperty('--accent', accent);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', accent);
}

export function applyTitle(name: string): void {
  if (name) document.title = name;
}

export function onSystemThemeChange(cb: () => void): () => void {
  const mq = media();
  if (!mq) return () => {};
  const handler = () => cb();
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
