import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

type Loose = Record<string, any>;

function readSiteConfig(): Loose {
  try {
    return JSON.parse(readFileSync(path.join(root, 'site.config.json'), 'utf8')) as Loose;
  } catch {
    return {};
  }
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}

/** 品牌图形 → favicon：letter/emoji 本地生成 SVG data URI，image 直接用 URL */
function resolveFavicon(icon: Loose | undefined, name: string, accent: string): string {
  if (icon && icon.type === 'image' && typeof icon.value === 'string' && icon.value) return icon.value;
  const raw = icon && typeof icon.value === 'string' && icon.value ? icon.value : name;
  const char = Array.from(String(raw).trim())[0] || 'N';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/>` +
    `<text x="32" y="33" font-family="system-ui,-apple-system,'Segoe UI',sans-serif" font-size="34" font-weight="600" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${escapeXml(char)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 图标服务 origin：用于 <link rel="preconnect"> 提前做 DNS + TLS 握手。解析不出就给空串（绝不产出 undefined/null） */
function resolveOrigin(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return '';
  }
}

/** 构建期把 site.config.json 注入 HTML 的 %SITE_NAME% / %SITE_ICON% / %SITE_ACCENT% / %ICON_API_ORIGIN% */
function siteConfigPlugin(): Plugin {
  const cfg = readSiteConfig();
  const name = String(cfg.name || 'HaoNav');
  const accent = String(cfg.accent || '#3b82f6');
  const icon = resolveFavicon(cfg.icon, name, accent);
  const iconApiOrigin = resolveOrigin(cfg.iconApi);
  return {
    name: 'haonav-site-config',
    // order: 'pre' —— 必须在 vite:build-html 生成内联 <style>/<script> 的 html-proxy 之前完成替换，
    // 否则构建报 "No matching HTML proxy module found"（Vite 6 的索引错位问题）
    transformIndexHtml: {
      order: 'pre',
      handler(html: string) {
        const out = html
          .replaceAll('%SITE_NAME%', escapeXml(name))
          .replaceAll('%SITE_ACCENT%', accent)
          .replaceAll('%SITE_ICON%', icon);
        // 有 origin 就填进 preconnect；没有就把整行 <link> 删掉 —— 空的 href="" 会退化成
        // 与本站自己握手，纯属浪费，且不如不留。
        return iconApiOrigin
          ? out.replaceAll('%ICON_API_ORIGIN%', iconApiOrigin)
          : out.replace(/[ \t]*<link\b[^>]*%ICON_API_ORIGIN%[^>]*\/?>/g, '');
      },
    },
  };
}

export default defineConfig(async () => {
  // 容错的 dev API 中间件接入：后端 (api/adapters/dev.ts) 未就绪时静默跳过
  let apiMiddleware: ((req: any, res: any, next: (err?: unknown) => void) => void) | null = null;
  try {
    const mod: Loose = await import('./api/adapters/dev');
    if (typeof mod?.createDevMiddleware === 'function') apiMiddleware = mod.createDevMiddleware();
  } catch {
    /* backend not ready yet — dev API silently disabled */
  }

  return {
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
    preview: {
      host: '127.0.0.1',
      port: 4173,
    },
    plugins: [
      vue(),
      tailwindcss(),
      siteConfigPlugin(),
      {
        name: 'haonav-dev-api',
        configureServer(server: ViteDevServer) {
          if (apiMiddleware) server.middlewares.use(apiMiddleware);
        },
      },
    ],
    resolve: {
      alias: { '@': root },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        input: {
          main: path.resolve(root, 'index.html'),
          admin: path.resolve(root, 'admin.html'),
        },
      },
    },
  };
});
