import type { Doc, LinkItem, SnapshotMeta } from '../../shared/types';

/** 会话过期（401）专用错误，App 层据此弹回登录页 */
export class AuthError extends Error {
  constructor() {
    super('未登录或会话已过期');
    this.name = 'AuthError';
  }
}

export class ApiError extends Error {
  status: number;
  payload: any;
  constructor(status: number, payload: any) {
    const msg = payload && typeof payload.error === 'string' ? payload.error : `HTTP ${status}`;
    super(msg);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // 后台所有请求一律禁用 HTTP 缓存。`GET /api/data` 是公开只读 + `Cache-Control: no-cache`
  // + ETag 协商：一旦走协商缓存，服务端可能返回 304（响应体 0 字节），
  // 而 304 绝不能等同于「没有数据」——那会把「未取到文档」误判成「未登录」。
  // init 在后，允许调用方覆盖（当前无人覆盖 cache）。
  const base: RequestInit = { credentials: 'same-origin', cache: 'no-store', ...init };
  let res: Response;
  try {
    res = await fetch(url, base);
  } catch (e) {
    throw new Error('网络请求失败，请检查连接');
  }
  if (res.status === 401) throw new AuthError();
  if (res.status === 304) {
    // 已显式 no-store，正常链路不可能出现 304；真出现说明中间层异常，
    // 此时必须显式报错，绝不静默返回 null（否则「没数据」与「没登录」混为一谈）
    throw new ApiError(304, { error: '意外的 304（不应发生，请求已禁用缓存）' });
  }
  const text = await res.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const api = {
  /**
   * 会话探针：`GET /api/session`（服务端走 requireSession，未登录 401）。
   * 200 → 已登录；401（AuthError）→ 未登录；其它错误照常抛出。
   *
   * ⚠️ 不要用 `GET /api/data` 当会话探针：它是公开只读接口，未登录也返回 200，
   * 会让后台在「完全没有会话」时误判为已登录。
   */
  async session(): Promise<boolean> {
    try {
      await request<{ ok: boolean; sub: string }>('/api/session');
      return true;
    } catch (e) {
      if (e instanceof AuthError) return false;
      throw e;
    }
  },

  getData(): Promise<Doc> {
    return request<Doc>('/api/data');
  },

  /** 成功返回新 rev；409 时抛 ApiError（payload 含 rev / doc） */
  patch(rev: number, ops: unknown[]): Promise<{ rev: number }> {
    return request<{ rev: number }>('/api/data', {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify({ rev, ops }),
    });
  },

  login(password: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/api/login', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ password }),
    });
  },

  logout(): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>('/api/logout', { method: 'POST' });
  },

  /** 单批 ≤200 条 diff（不落库） */
  importParse(
    items: Partial<LinkItem>[],
    targetCat?: string,
  ): Promise<{
    added: Partial<LinkItem>[];
    existing: Partial<LinkItem>[];
    conflict: { item: Partial<LinkItem>; existing: LinkItem }[];
    counts: { added: number; existing: number; conflict: number };
  }> {
    return request('/api/import/parse', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ items, targetCat }),
    });
  },

  /** 按批原子追加（order 一律追加到末尾），返回新 rev 与实际新增数 */
  importApply(rev: number, items: Partial<LinkItem>[], targetCat?: string): Promise<{ rev: number; added: number }> {
    return request('/api/import/apply', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ rev, items, targetCat }),
    });
  },

  snapshot(): Promise<{ ok: boolean; key: string; count: number }> {
    return request('/api/backup/snapshot', { method: 'POST' });
  },

  snapshots(): Promise<{ snapshots: SnapshotMeta[] }> {
    return request('/api/backup/snapshots');
  },

  restore(key: string): Promise<{ rev: number }> {
    return request('/api/backup/restore', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ key }),
    });
  },

  /** 死链批量探测（后端未就绪时返回 null，调用方回退浏览器端探测） */
  async checkLinks(urls: string[]): Promise<{ results: { url: string; ok: boolean; status?: number }[] } | null> {
    try {
      return await request('/api/check/links', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ urls }),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  exportUrl(format: 'json' | 'html'): string {
    return `/api/export?format=${format}`;
  },
};
