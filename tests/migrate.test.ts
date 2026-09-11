import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../api/store';
import { formatReport, migrate } from '../migrate/v0-to-v1';

function seedStore(extra: Record<string, unknown> = {}) {
  return createMemoryStore({
    haonav_links: JSON.stringify([
      {
        id: '1',
        title: 'GitHub',
        url: 'https://github.com/',
        categoryId: 'dev',
        createdAt: 1,
        description: '代码托管',
      },
      { id: '2', title: 'React', url: 'https://react.dev', categoryId: 'dev', createdAt: 2 },
    ]),
    haonav_categories: JSON.stringify([
      { id: 'dev', name: '开发工具', icon: 'Code' },
      { id: 'secret', name: '私密收藏', icon: '🔒', password: 'hunter2' },
    ]),
    haonav_settings: JSON.stringify({
      title: '我的导航',
      navTitle: '我的导航',
      favicon: 'https://x.com/f.ico',
      cardStyle: 'simple',
      darkMode: true,
    }),
    haonav_search_engines: JSON.stringify([
      { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
    ]),
    haonav_auth_password: 'legacy-pw',
    app_data: JSON.stringify({
      links: [
        {
          id: '1',
          title: 'GitHub',
          url: 'https://github.com',
          categoryId: 'dev',
          createdAt: 3,
          icon: 'https://github.com/favicon.ico',
          pinned: true,
        },
        { id: '9', title: 'Tailwind', url: 'https://tailwindcss.com', categoryId: 'design' },
      ],
      categories: [{ id: 'dev', name: '开发工具' }, { id: 'design', name: '设计资源' }],
    }),
    ...extra,
  });
}

describe('migrate v0 → v1', () => {
  it('dry-run 默认不写入，但输出完整报告', async () => {
    const store = seedStore();
    const report = await migrate({ store });

    expect(report.dryRun).toBe(true);
    expect(await store.getText('nav:v1')).toBeNull();

    // 两个来源都读到了
    expect(report.sources.haonavLinks).toBe(2);
    expect(report.sources.appDataLinks).toBe(2);
    expect(report.sources.haonavCategories).toBe(2);
    expect(report.sources.appDataCategories).toBe(2);

    // 链接：4 → 3（GitHub 去重）
    expect(report.totals.linksBefore).toBe(4);
    expect(report.totals.linksAfter).toBe(3);
    expect(report.dedup.duplicateGroups).toBe(1);
    expect(report.dedup.duplicatesRemoved).toBe(1);

    // 分类：4 → 3（dev 合并；secret/design）
    expect(report.totals.categoriesBefore).toBe(4);
    expect(report.totals.categoriesAfter).toBe(3);
  });

  it('按 urlKey 去重并做字段级合并', async () => {
    const store = seedStore();
    const report = await migrate({ store });
    const gh = report.doc.links.find((l) => l.urlKey === 'https://github.com');
    expect(gh).toBeTruthy();
    expect(gh!.desc).toBe('代码托管'); // 来自 haonav_links
    expect(gh!.icon).toBe('https://github.com/favicon.ico'); // 来自 app_data
    expect(gh!.pinned).toBe(true); // 来自 app_data
  });

  it('丢弃分类密码并报告', async () => {
    const store = seedStore();
    const report = await migrate({ store });
    expect(report.removedPasswords.map((p) => p.name)).toContain('私密收藏');
    // 新文档里不存在 password 字段
    expect(JSON.stringify(report.doc.categories)).not.toContain('hunter2');
  });

  it('重复的 id 被重新分配', async () => {
    const store = createMemoryStore({
      haonav_links: JSON.stringify([
        { id: 'dup', title: 'A', url: 'https://a.com', categoryId: 'c', createdAt: 1 },
        { id: 'dup', title: 'B', url: 'https://b.com', categoryId: 'c', createdAt: 2 },
      ]),
      haonav_categories: JSON.stringify([{ id: 'c', name: 'C' }]),
    });
    const report = await migrate({ store });
    const ids = report.doc.links.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(report.idReassigned).toBeGreaterThanOrEqual(1);
  });

  it('识别只存在于 app_data 的链接（Chrome 扩展）', async () => {
    const store = seedStore();
    const report = await migrate({ store });
    expect(report.appDataOnlyLinks).toBe(1); // Tailwind
  });

  it('迁移设置字段', async () => {
    const store = seedStore();
    const report = await migrate({ store });
    expect(report.settingsFields).toContain('name');
    expect(report.settingsFields).toContain('cardStyle');
    expect(report.settingsFields).toContain('searchEngines');
    expect((report.doc.settings as any).cardStyle).toBe('compact');
    expect((report.doc.settings as any).themeDefault).toBe('dark');
  });

  it('引用不存在的分类 → 归入未分类', async () => {
    const store = seedStore();
    const report = await migrate({ store });
    const tw = report.doc.links.find((l) => l.urlKey === 'https://tailwindcss.com');
    // app_data 里的 design 分类存在，故不应被归零
    expect(tw!.cat).toBe('design');
  });

  it('--commit 才写入 nav:v1，旧 key 不动', async () => {
    const store = seedStore();
    const report = await migrate({ store, commit: true });
    expect(report.dryRun).toBe(false);
    const written = await store.getText('nav:v1');
    expect(written).toBeTruthy();
    expect(JSON.parse(written!).schemaVersion).toBe(1);
    // 旧 key 保留
    expect(await store.getText('haonav_links')).toBeTruthy();
    expect(await store.getText('app_data')).toBeTruthy();
  });

  it('formatReport 输出可读报告', async () => {
    const store = seedStore();
    const report = await migrate({ store });
    const text = formatReport(report);
    expect(text).toContain('迁移前 vs 迁移后');
    expect(text).toContain('链接: 4 → 3');
  });
});
