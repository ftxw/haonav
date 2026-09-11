import { api } from './adminApi';

export interface CheckResult {
  url: string;
  ok: boolean;
  status?: number;
}

export type CheckMode = 'server' | 'browser';

/**
 * 死链检测：每请求 ≤20 条，前端驱动多轮。
 * 优先走后端 `POST /api/check/links`（HEAD + 超时，受子请求预算控制）；
 * 接口未就绪（404）时回退浏览器端 no-cors 探测（只能测 DNS/连接失败，可信度低）。
 */
export async function checkLinks(
  urls: string[],
  onBatch: (results: CheckResult[]) => void,
): Promise<CheckMode> {
  const BATCH = 20;
  let mode: CheckMode = 'server';

  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH);
    let res = await api.checkLinks(batch).catch(() => null);
    if (!res) {
      mode = 'browser';
      res = { results: await Promise.all(batch.map(browserProbe)) };
    }
    onBatch(res.results);
    if (i + BATCH < urls.length) await sleep(120); // 温和的多轮节奏
  }
  return mode;
}

async function browserProbe(url: string): Promise<CheckResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    await fetch(url, { mode: 'no-cors', signal: ctrl.signal });
    return { url, ok: true };
  } catch {
    return { url, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
