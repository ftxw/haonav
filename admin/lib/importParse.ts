import type { ParsedItem } from './importParse.worker';

export type { ParsedItem };

/**
 * Worker 调用封装：解析 1–2 MB 书签 HTML 也不卡 UI。
 * 用完即终止（导入是一次性动作，不常驻）。
 */
export function parseBookmarksHtml(html: string, timeoutMs = 30000): Promise<ParsedItem[]> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./importParse.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(new Error('无法启动解析 Worker'));
      return;
    }

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('解析超时'));
    }, timeoutMs);

    const finish = (fn: () => void): void => {
      clearTimeout(timer);
      worker.terminate();
      fn();
    };

    worker.onmessage = (e: MessageEvent<{ ok: boolean; items?: ParsedItem[]; error?: string }>) => {
      finish(() => {
        if (e.data.ok && e.data.items) resolve(e.data.items);
        else reject(new Error(e.data.error || '解析失败'));
      });
    };
    worker.onerror = () => finish(() => reject(new Error('解析 Worker 出错')));

    worker.postMessage({ html });
  });
}
