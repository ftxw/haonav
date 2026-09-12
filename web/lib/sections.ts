/**
 * 「文档 → 渲染用分组数据」的纯逻辑（无 Vue、无 DOM、可单测）。
 * 从 web/stores/nav.ts 抽出，便于在 Node 环境下断言分组正确性。
 */
import type { Category, LinkItem } from './models';

/** 孤儿链接（cat 指向不存在的分类）归入的兜底分类 id */
export const UNCATEGORIZED = '__uncategorized__';

/** 预索引链接：hay 为一次性生成的小写检索串（title + url + desc） */
export interface IndexedLink extends LinkItem {
  hay: string;
}

export interface Section {
  cat: Category;
  links: IndexedLink[];
}

export interface BuiltSections {
  /** 按 order 排序后的分类（有孤儿时末尾追加「未分类」） */
  categories: Category[];
  /** Map<catId, IndexedLink[]> —— 一次性预分组，渲染时绝不 O(分类×链接) */
  byCat: Map<string, IndexedLink[]>;
  /** 跨分类收集的全部置顶链接 */
  pinned: IndexedLink[];
  total: number;
  hasOrphans: boolean;
}

export const byOrder = (a: { order: string }, b: { order: string }): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

export function hayOf(l: LinkItem): string {
  return `${l.title}\n${l.url}\n${l.desc ?? ''}`.toLowerCase();
}

/**
 * 按分类预分组 + 孤儿链接归到「未分类」+ 跨分类收集置顶。
 * 入参不被修改（categories 内部复制后排序）。
 */
export function buildSections(categories: Category[], links: LinkItem[]): BuiltSections {
  const cats = [...(categories ?? [])].sort(byOrder);
  const known = new Set(cats.map((c) => c.id));
  const byCat = new Map<string, IndexedLink[]>();
  for (const c of cats) byCat.set(c.id, []);

  const pinned: IndexedLink[] = [];
  const list = links ?? [];
  let hasOrphans = false;

  for (const l of list) {
    let catId = l.cat;
    if (!known.has(catId)) {
      catId = UNCATEGORIZED;
      hasOrphans = true;
    }
    let bucket = byCat.get(catId);
    if (!bucket) {
      bucket = [];
      byCat.set(catId, bucket);
    }
    const il: IndexedLink = { ...l, hay: hayOf(l) };
    bucket.push(il);
    if (l.pinned) pinned.push(il);
  }

  if (hasOrphans) {
    cats.push({ id: UNCATEGORIZED, name: '未分类', icon: 'folder', order: '￿' });
  }

  for (const bucket of byCat.values()) bucket.sort(byOrder);
  pinned.sort(byOrder);

  return { categories: cats, byCat, pinned, total: list.length, hasOrphans };
}
