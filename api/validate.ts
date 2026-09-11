/**
 * 手写轻量校验（约 40 行）。
 *
 * ⛔ 不用 zod：zod 实测 74 KB brotli（zod/v4-mini 68.6 KB）—— 放客户端把首屏
 *    从约 28 KB 顶到约 100 KB；放服务端校验 2000 条链接需几十毫秒 CPU。
 *    两边都超出预算。
 *
 * 本校验**只检查关键字段类型 / 数组长度上限 / schemaVersion / 体积**，
 * 不做逐字段深度校验（那是 CPU 黑洞）。语义正确性由客户端保证。
 */

import type { Category, Doc, LinkItem, SiteSettings } from '../shared/types';
import { MAX_DOC_BYTES, SCHEMA_VERSION } from './keys';

const MAX_LINKS = 20_000;
const MAX_CATEGORIES = 2_000;

export type ValidateResult = { ok: true; doc: Doc } | { ok: false; error: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function validateDoc(value: unknown): ValidateResult {
  if (!isObject(value)) return { ok: false, error: '文档必须是对象' };
  const d = value as Record<string, unknown>;
  if (d.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: 'schemaVersion 不匹配' };
  if (typeof d.rev !== 'number' || !Number.isFinite(d.rev)) return { ok: false, error: 'rev 非法' };
  if (!isObject(d.settings)) return { ok: false, error: 'settings 非法' };
  if (!Array.isArray(d.categories)) return { ok: false, error: 'categories 必须是数组' };
  if (!Array.isArray(d.links)) return { ok: false, error: 'links 必须是数组' };
  if (d.categories.length > MAX_CATEGORIES) return { ok: false, error: '分类数量超限' };
  if (d.links.length > MAX_LINKS) return { ok: false, error: '链接数量超限' };

  for (const c of d.categories as unknown[]) {
    if (!isObject(c)) return { ok: false, error: '分类项非法' };
    if (typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.order !== 'string') {
      return { ok: false, error: '分类字段非法' };
    }
  }
  for (const l of d.links as unknown[]) {
    if (!isObject(l)) return { ok: false, error: '链接项非法' };
    if (
      typeof l.id !== 'string' ||
      typeof l.title !== 'string' ||
      typeof l.url !== 'string' ||
      typeof l.urlKey !== 'string' ||
      typeof l.cat !== 'string' ||
      typeof l.order !== 'string' ||
      typeof l.createdAt !== 'number'
    ) {
      return { ok: false, error: '链接字段非法' };
    }
  }

  let size: number;
  try {
    size = JSON.stringify(d).length;
  } catch {
    return { ok: false, error: '文档无法序列化' };
  }
  if (size >= MAX_DOC_BYTES) return { ok: false, error: '文档过大' };

  const doc: Doc = {
    schemaVersion: 1,
    rev: d.rev as number,
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
    settings: d.settings as unknown as SiteSettings,
    categories: d.categories as Category[],
    links: d.links as LinkItem[],
  };
  return { ok: true, doc };
}
