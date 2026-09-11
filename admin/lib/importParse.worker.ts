/// <reference lib="webworker" />
/**
 * 书签 HTML 解析（Netscape Bookmark File Format）。
 *
 * ⚠️ 必须在 Web Worker 里做：服务端解析 1–2 MB HTML 需几十到上百毫秒 CPU，
 *    会撞免费版 10 ms/请求硬上限；主线程解析会卡 UI。
 * ⚠️ Worker 里没有 DOMParser —— 这里用逐行 + 正则解析。
 *    Netscape 格式结构固定（Chrome/Edge/Firefox/Safari 导出均遵循），足够可靠。
 */

export interface ParsedItem {
  title: string;
  url: string;
  desc?: string;
  /** 深层文件夹名（扁平分类用）；根级条目无此字段 */
  cat?: string;
}

interface ParseResult {
  ok: boolean;
  items?: ParsedItem[];
  error?: string;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ html: string }>) => void) | null;
  postMessage: (msg: ParseResult) => void;
};

ctx.onmessage = (e: MessageEvent<{ html: string }>) => {
  try {
    ctx.postMessage({ ok: true, items: parseBookmarks(e.data.html) });
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code: string) => {
    if (code[0] === '#') {
      const num = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

const RE_H3 = /<H3\b[^>]*>([^<]*)<\/H3>/i;
const RE_A = /<A\b[^>]*?\bHREF\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([^<]*)<\/A>/i;
const RE_DD = /<DD\b[^>]*>(.*)$/i;

/** 分类取「最深一层非空文件夹名」；同级同名文件夹合并为同一分类 */
export function parseBookmarks(html: string, limit = 20000): ParsedItem[] {
  const items: ParsedItem[] = [];
  const stack: string[] = [];
  let pendingFolder: string | null = null;
  let last: ParsedItem | null = null;

  const lines = html.replace(/\r\n?/g, '\n').split('\n');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (RE_H3.test(line)) {
      pendingFolder = decodeEntities((line.match(RE_H3) as RegExpMatchArray)[1]).trim();
    }
    if (/<DL\b/i.test(line)) {
      stack.push(pendingFolder ?? '');
      pendingFolder = null;
    }
    if (/<\/DL/i.test(line)) {
      stack.pop();
      pendingFolder = null;
    }

    const a = line.match(RE_A);
    if (a) {
      const url = (a[1] ?? a[2] ?? '').trim();
      const title = decodeEntities(a[3] ?? '').trim();
      // 只收 http/https，过滤 javascript:/place: 等浏览器内部条目
      if (url && /^https?:\/\//i.test(url) && items.length < limit) {
        const cat = [...stack].filter(Boolean).pop();
        const item: ParsedItem = { title: title || url, url };
        if (cat) item.cat = cat;
        items.push(item);
        last = item;
      }
      continue;
    }

    const dd = line.match(RE_DD);
    if (dd && last) {
      const text = decodeEntities(dd[1].replace(/<[^>]*>/g, '')).trim();
      if (text) last.desc = text.slice(0, 300);
    }
  }
  return items;
}
