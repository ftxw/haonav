/**
 * EdgeOne Edge Functions 类型定义
 */

export interface Env {
  kv: EdgeKV;
}

export interface EdgeKV {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | object | ArrayBuffer | ReadableStream | undefined>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<ListResult>;
}

export interface ListResult {
  complete: boolean;
  cursor: string | null;
  keys: Array<{ key: string }>;
}

export interface RequestContext {
  request: Request;
  env: Env;
}
