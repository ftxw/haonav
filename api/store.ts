/**
 * Store —— 存储抽象。
 *
 * 设计要点：**只处理字符串**。这样业务层可以自己控制"何时 parse 一次"，
 * CPU 成本一目了然（10 ms/请求的硬约束下，parse 次数必须是显式决策）。
 *
 * 三个实现：
 *  - createCloudflareKVStore(ns)  —— Cloudflare Workers KV 绑定
 *  - createEdgeOneKVStore(ns)     —— EdgeOne KV（API 与 CF 一致）
 *  - createMemoryStore(seed)      —— 测试用
 *
 * ⚠️ 平台符号只允许出现在本文件与 api/adapters/ 中，core.ts 不 import 任何平台 SDK。
 */

export interface Store {
  getText(key: string): Promise<string | null>;
  putText(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * CF Workers KV 与 EdgeOne KV 的读取 API 形状一致：
 *   ns.get(key)          -> Promise<string | null>
 *   ns.put(key, value)   -> Promise<void>
 *   ns.delete(key)       -> Promise<void>
 */
function createKVStore(ns: any): Store {
  if (!ns) {
    throw new Error('createKVStore: KV namespace 未绑定');
  }
  return {
    async getText(key: string): Promise<string | null> {
      const v = await ns.get(key);
      if (v === null || v === undefined) return null;
      return typeof v === 'string' ? v : String(v);
    },
    async putText(key: string, value: string): Promise<void> {
      await ns.put(key, value);
    },
    async del(key: string): Promise<void> {
      await ns.delete(key);
    },
  };
}

/** Cloudflare Workers KV 绑定 → Store */
export function createCloudflareKVStore(ns: any): Store {
  return createKVStore(ns);
}

/** EdgeOne KV 绑定 → Store */
export function createEdgeOneKVStore(ns: any): Store {
  return createKVStore(ns);
}

/** 内存 Store（测试 / 本地临时用） */
export function createMemoryStore(seed?: Record<string, string>): Store {
  const map = new Map<string, string>();
  if (seed) {
    for (const [k, v] of Object.entries(seed)) map.set(k, v);
  }
  return {
    async getText(key: string): Promise<string | null> {
      return map.has(key) ? (map.get(key) as string) : null;
    },
    async putText(key: string, value: string): Promise<void> {
      map.set(key, value);
    },
    async del(key: string): Promise<void> {
      map.delete(key);
    },
  };
}
