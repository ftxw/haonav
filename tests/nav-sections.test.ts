/**
 * 前台「文档 → 渲染用分组数据」链路测试（问题 1 的回归防线）。
 *
 * 覆盖：
 *  - 链接 cat 与分类 id 匹配时归到对应分类
 *  - cat 指向不存在的分类时归到「未分类」（孤儿链接）
 *  - 置顶链接跨分类收集
 *  - 分类 / 链接按 order 排序
 *  - hay 检索串包含 title / url / desc 的小写形式
 *  - 端到端：api/store.ts 的 createMemoryStore 存文档 → 取出 → buildSections
 */
import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../api/store';
import { UNCATEGORIZED, buildSections, hayOf } from '../web/lib/sections';
import type { Category, Doc, LinkItem } from '../shared/types';

const cat = (id: string, order: string): Category => ({
  id,
  name: id,
  icon: 'folder',
  order,
});

function mkLink(i: number, categoryId: string, pinned = false): LinkItem {
  return {
    id: `l${i}`,
    title: `Title${i}`,
    url: `https://example.com/${i}`,
    desc: `Desc${i}`,
    cat: categoryId,
    order: `0${i}`,
    pinned,
    urlKey: `example.com/${i}`,
    createdAt: 1_700_000_000_000,
  };
}

function mkDoc(overrides?: Partial<Doc>): Doc {
  return {
    schemaVersion: 1,
    rev: 1,
    updatedAt: 1_700_000_000_000,
    settings: {} as Doc['settings'],
    categories: [cat('cat-dev', '01'), cat('cat-design', '02'), cat('cat-doc', '03')],
    links: [
      mkLink(1, 'cat-dev', true),
      mkLink(2, 'cat-doc', true),
      mkLink(3, 'cat-dev'),
      mkLink(4, 'cat-dev'),
      mkLink(5, 'cat-design'),
      mkLink(6, 'cat-design'),
    ],
    ...overrides,
  };
}

describe('buildSections', () => {
  it('3 分类 / 6 链接 / 2 置顶：分组、总数、置顶都正确', () => {
    const doc = mkDoc();
    const built = buildSections(doc.categories, doc.links);

    expect(built.total).toBe(6);
    expect(built.categories.map((c) => c.id)).toEqual(['cat-dev', 'cat-design', 'cat-doc']);
    expect(built.byCat.get('cat-dev')?.map((l) => l.id)).toEqual(['l1', 'l3', 'l4']);
    expect(built.byCat.get('cat-design')?.map((l) => l.id)).toEqual(['l5', 'l6']);
    expect(built.byCat.get('cat-doc')?.map((l) => l.id)).toEqual(['l2']);
    expect(built.hasOrphans).toBe(false);
  });

  it('置顶链接跨分类收集（dev 与 doc 各 1 条）', () => {
    const doc = mkDoc();
    const built = buildSections(doc.categories, doc.links);

    expect(built.pinned).toHaveLength(2);
    expect(built.pinned.map((l) => l.id).sort()).toEqual(['l1', 'l2']);
    expect(new Set(built.pinned.map((l) => l.cat))).toEqual(new Set(['cat-dev', 'cat-doc']));
  });

  it('孤儿链接归入「未分类」，且该分类排在最后', () => {
    const doc = mkDoc();
    doc.links.push(mkLink(7, 'cat-missing'));
    const built = buildSections(doc.categories, doc.links);

    expect(built.hasOrphans).toBe(true);
    expect(built.byCat.get(UNCATEGORIZED)?.map((l) => l.id)).toEqual(['l7']);
    expect(built.categories.at(-1)?.id).toBe(UNCATEGORIZED);
    expect(built.categories.at(-1)?.name).toBe('未分类');
    // 原分类不受影响
    expect(built.byCat.get('cat-dev')).toHaveLength(3);
    expect(built.total).toBe(7);
  });

  it('分类与链接都按 order 排序（输入顺序被打乱也要正确）', () => {
    const doc = mkDoc();
    const shuffledCats = [doc.categories[2], doc.categories[0], doc.categories[1]];
    const shuffledLinks = [...doc.links].reverse();
    const built = buildSections(shuffledCats, shuffledLinks);

    expect(built.categories.map((c) => c.id)).toEqual(['cat-dev', 'cat-design', 'cat-doc']);
    expect(built.byCat.get('cat-dev')?.map((l) => l.id)).toEqual(['l1', 'l3', 'l4']);
  });

  it('hay 是 title + url + desc 的小写串（站内搜索依赖它）', () => {
    const l = mkLink(1, 'cat-dev');
    expect(hayOf(l)).toBe('title1\nhttps://example.com/1\ndesc1');

    const built = buildSections([cat('cat-dev', '01')], [{ ...l, title: 'GitHub', url: 'https://GitHub.com', desc: 'Code' }]);
    const hay = built.byCat.get('cat-dev')![0].hay;
    expect(hay).toContain('github');
    expect(hay).toContain('https://github.com');
    expect(hay).toContain('code');
  });

  it('空文档不炸：0 分类 0 链接', () => {
    const built = buildSections([], []);
    expect(built.total).toBe(0);
    expect(built.categories).toEqual([]);
    expect(built.pinned).toEqual([]);
  });
});

describe('数据链路：createMemoryStore → buildSections', () => {
  it('从 store 取出的文档能正确变成渲染用分组数据', async () => {
    const doc = mkDoc();
    const store = createMemoryStore({ 'nav:v1': JSON.stringify(doc) });
    const raw = await store.getText('nav:v1');
    expect(raw).toBeTruthy();

    const parsed = JSON.parse(raw as string) as Doc;
    const built = buildSections(parsed.categories ?? [], parsed.links ?? []);

    expect(built.total).toBe(6);
    expect(built.categories).toHaveLength(3);
    expect(built.pinned).toHaveLength(2);
    expect(built.byCat.get('cat-dev')).toHaveLength(3);
  });
});
