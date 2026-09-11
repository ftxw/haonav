import type { Category, Doc, LinkItem, Op, SiteSettings } from '../../shared/types';

/**
 * 以「文档差异」生成 ops，而不是在操作时收集 ops。
 *
 * 好处：文档始终是唯一事实源，撤销（Ctrl/Cmd+Z）只是恢复一份内存快照，
 * 与是否已保存无关 —— 保存后依然可以撤销，下次保存会重新 diff 出正确的 ops。
 *
 * 顺序约定：分类先于链接（保证新分类先于引用它的 link.add 到达服务端）。
 */
export function diffOps(prev: Doc, next: Doc): Op[] {
  const ops: Op[] = [];

  const prevCats = new Map(prev.categories.map((c) => [c.id, c]));
  const nextCatIds = new Set(next.categories.map((c) => c.id));

  for (const c of next.categories) {
    const p = prevCats.get(c.id);
    if (!p) {
      ops.push({ t: 'cat.add', cat: { ...c } });
      continue;
    }
    const patch: Partial<Category> = {};
    if (p.name !== c.name) patch.name = c.name;
    if (JSON.stringify(p.icon) !== JSON.stringify(c.icon)) patch.icon = c.icon;
    if (Object.keys(patch).length) ops.push({ t: 'cat.update', id: c.id, patch });
    if (p.order !== c.order) ops.push({ t: 'cat.move', id: c.id, order: c.order });
  }
  for (const c of prev.categories) {
    if (!nextCatIds.has(c.id)) ops.push({ t: 'cat.delete', id: c.id });
  }

  const prevLinks = new Map(prev.links.map((l) => [l.id, l]));
  const nextLinkIds = new Set(next.links.map((l) => l.id));

  for (const l of next.links) {
    const p = prevLinks.get(l.id);
    if (!p) {
      ops.push({ t: 'link.add', link: { ...l } });
      continue;
    }
    const patch: Partial<LinkItem> = {};
    if (p.title !== l.title) patch.title = l.title;
    if (p.url !== l.url) patch.url = l.url; // 服务端会据此重算 urlKey
    if ((p.desc ?? undefined) !== (l.desc ?? undefined)) patch.desc = l.desc;
    if ((p.icon ?? undefined) !== (l.icon ?? undefined)) patch.icon = l.icon;
    if (Object.keys(patch).length) ops.push({ t: 'link.update', id: l.id, patch });
    if (p.cat !== l.cat || p.order !== l.order) {
      ops.push({
        t: 'link.move',
        id: l.id,
        ...(l.cat !== p.cat ? { cat: l.cat } : {}),
        order: l.order,
      });
    }
    if (!!p.pinned !== !!l.pinned) ops.push({ t: 'link.pin', id: l.id, pinned: !!l.pinned });
  }
  for (const l of prev.links) {
    if (!nextLinkIds.has(l.id)) ops.push({ t: 'link.delete', id: l.id });
  }

  const sp = settingsPatch(prev.settings, next.settings);
  if (sp) ops.push({ t: 'settings.update', patch: sp });

  return ops;
}

function settingsPatch(a: SiteSettings, b: SiteSettings): Partial<SiteSettings> | null {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(b) as (keyof SiteSettings)[]) {
    if (key === 'backup') {
      const ab = (a.backup ?? {}) as Record<string, unknown>;
      const bb = (b.backup ?? {}) as Record<string, unknown>;
      const bp: Record<string, unknown> = {};
      for (const bk of Object.keys(bb)) {
        if (JSON.stringify(ab[bk]) !== JSON.stringify(bb[bk])) bp[bk] = bb[bk];
      }
      if (Object.keys(bp).length) patch.backup = bp;
      continue;
    }
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) patch[key] = b[key];
  }
  return Object.keys(patch).length ? (patch as Partial<SiteSettings>) : null;
}
