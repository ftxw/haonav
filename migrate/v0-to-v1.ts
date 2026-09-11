/**
 * v0 → v1 迁移脚本（数据零丢失）。
 *
 * ★ 必须同时读两个来源，只读一个会丢一半数据：
 *   - 旧分片 key：haonav_links / haonav_categories / haonav_settings /
 *                 haonav_search_engines / haonav_auth_password（网页端写的）
 *   - 旧单体 key：app_data（结构 {links, categories}，Chrome 扩展写的）
 *
 * 流程：
 *   1. 合并两个来源的 links 与 categories
 *   2. 按 normalizeUrl(url) 去重，**字段级合并**（不是整条取舍）
 *   3. 补齐 order（按位置生成递增 base-62）与 id（重复的 Date.now() id 重新分配）
 *   4. 丢弃 Category.password，报告里列出被移除的锁
 *   5. 写入新 key nav:v1；**旧 key 一律不动**
 *   6. **默认 dry-run**，加 --commit 才真正写入
 *
 * CLI（需 tsx 或 node --experimental-strip-types）：
 *   node --experimental-strip-types migrate/v0-to-v1.ts --in old.json [--commit] [--out new-doc.json]
 *   old.json = { "haonav_links": ..., "app_data": ..., "haonav_categories": ... }
 *   （值可以是字符串或已解析的 JSON）
 */

// 注：本文件是可直接执行的 CLI，故运行时 import 带 .ts 扩展名，
// 以便 `node --experimental-strip-types migrate/v0-to-v1.ts` 直接运行
// （tsconfig 已开 allowImportingTsExtensions，vitest / tsc 同样接受）。
import type { Category, CategoryIcon, Doc, LinkItem, SiteSettings } from '../shared/types.ts';
import { KV, SCHEMA_VERSION } from '../api/keys.ts';
import { orderForIndex } from '../api/order.ts';
import type { Store } from '../api/store.ts';
import { createMemoryStore } from '../api/store.ts';
import { normalizeUrl } from '../api/urlKey.ts';

/* ------------------------------------------------------------------ *
 * 旧 key 名（硬编码在此 —— 迁移脚本必须读固定的历史 key）
 * ------------------------------------------------------------------ */

const OLD = {
  LINKS: 'haonav_links',
  CATEGORIES: 'haonav_categories',
  SETTINGS: 'haonav_settings',
  SEARCH_ENGINES: 'haonav_search_engines',
  AUTH_PASSWORD: 'haonav_auth_password',
  APP_DATA: 'app_data',
} as const;

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function uuid(): string {
  const c = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseJson(text: string | null): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function isNonEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v);
  return true;
}

/** 旧图标字符串（lucide 名 / emoji）→ 新 CategoryIcon */
function toCategoryIcon(icon: unknown): CategoryIcon {
  const t = str(icon).trim();
  if (!t) return { type: 'letter' };
  try {
    if (/\p{Extended_Pictographic}/u.test(t)) {
      return { type: 'emoji', value: [...t][0] ?? t };
    }
  } catch {
    /* 正则不支持则退化为 letter */
  }
  // 'Star' / 'Code' 这类旧 lucide 图标名 → 字母块
  return { type: 'letter' };
}

/* ------------------------------------------------------------------ *
 * 报告结构
 * ------------------------------------------------------------------ */

export interface MigrateReport {
  dryRun: boolean;
  sources: {
    haonavLinks: number;
    haonavCategories: number;
    appDataLinks: number;
    appDataCategories: number;
    hasAuthPassword: boolean;
  };
  totals: {
    linksBefore: number;
    linksAfter: number;
    categoriesBefore: number;
    categoriesAfter: number;
  };
  /** 只在 app_data 里出现（即"Chrome 扩展存的书签"） */
  appDataOnlyLinks: number;
  dedup: {
    duplicateGroups: number;
    duplicatesRemoved: number;
    details: { urlKey: string; sources: string[]; keptTitle: string; mergedFields: string[] }[];
  };
  idReassigned: number;
  ordersAssigned: number;
  unknownCategoryRemapped: number;
  skippedNoUrl: number;
  removedPasswords: { id: string; name: string }[];
  settingsMigrated: boolean;
  settingsFields: string[];
  doc: Doc;
}

/* ------------------------------------------------------------------ *
 * 迁移主逻辑
 * ------------------------------------------------------------------ */

export interface MigrateDeps {
  store: Store;
  commit?: boolean;
  now?: number;
}

export async function migrate(deps: MigrateDeps): Promise<MigrateReport> {
  const { store } = deps;
  const commit = !!deps.commit;
  const now = deps.now ?? Date.now();

  /* 1. 读取两个来源 ------------------------------------------------- */
  const [linksText, catsText, settingsText, enginesText, authText, appDataText] =
    await Promise.all([
      store.getText(OLD.LINKS),
      store.getText(OLD.CATEGORIES),
      store.getText(OLD.SETTINGS),
      store.getText(OLD.SEARCH_ENGINES),
      store.getText(OLD.AUTH_PASSWORD),
      store.getText(OLD.APP_DATA),
    ]);

  const legacyLinks: any[] = Array.isArray(parseJson(linksText)) ? parseJson(linksText) : [];
  const legacyCats: any[] = Array.isArray(parseJson(catsText)) ? parseJson(catsText) : [];
  const legacySettings: any = parseJson(settingsText) ?? {};
  const legacyEngines: any[] = Array.isArray(parseJson(enginesText)) ? parseJson(enginesText) : [];
  const appData: any = parseJson(appDataText) ?? {};
  const appLinks: any[] = Array.isArray(appData?.links) ? appData.links : [];
  const appCats: any[] = Array.isArray(appData?.categories) ? appData.categories : [];

  const sources = {
    haonavLinks: legacyLinks.length,
    haonavCategories: legacyCats.length,
    appDataLinks: appLinks.length,
    appDataCategories: appCats.length,
    hasAuthPassword: !!authText,
  };

  /* 2. 合并分类（按 id，再按 name 兜底） ---------------------------- */
  const removedPasswords: { id: string; name: string }[] = [];
  const catById = new Map<string, any>();
  const seenCatNames = new Set<string>();
  const rawCats: { raw: any; source: string }[] = [
    ...legacyCats.map((raw) => ({ raw, source: OLD.CATEGORIES })),
    ...appCats.map((raw) => ({ raw, source: OLD.APP_DATA })),
  ];
  for (const { raw } of rawCats) {
    if (!raw || typeof raw !== 'object') continue;
    const id = str(raw.id).trim();
    const name = str(raw.name).trim();
    const key = id || `name:${name}`;
    if (catById.has(key)) continue;
    if (!id && seenCatNames.has(name)) continue;
    if (!id) seenCatNames.add(name);
    catById.set(key, { raw, id, name });
  }

  const categories: Category[] = [];
  let ci = 0;
  for (const entry of catById.values()) {
    const raw = entry.raw;
    if (isNonEmpty(raw.password)) {
      removedPasswords.push({ id: entry.id || `(name:${entry.name})`, name: entry.name });
    }
    categories.push({
      id: entry.id || uuid(),
      name: entry.name || '未命名分类',
      icon: toCategoryIcon(raw.icon),
      order: orderForIndex(ci++),
    });
  }
  const catIds = new Set(categories.map((c) => c.id));

  /* 3. 合并链接（字段级） ------------------------------------------- */
  const rawLinks: { raw: any; source: string }[] = [
    ...legacyLinks.map((raw) => ({ raw, source: OLD.LINKS })),
    ...appLinks.map((raw) => ({ raw, source: OLD.APP_DATA })),
  ];

  const groups = new Map<string, { raw: any; source: string }[]>();
  const orderIndex = new Map<string, number>();
  let idx = 0;
  let skippedNoUrl = 0;

  for (const rl of rawLinks) {
    if (!rl.raw || typeof rl.raw !== 'object') continue;
    const key = normalizeUrl(str(rl.raw.url));
    if (!key) {
      skippedNoUrl++;
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
      orderIndex.set(key, idx++);
    }
    groups.get(key)!.push(rl);
  }

  const usedIds = new Set<string>();
  let idReassigned = 0;
  let unknownCategoryRemapped = 0;
  const links: LinkItem[] = [];
  const dedupDetails: MigrateReport['dedup']['details'] = [];
  let duplicatesRemoved = 0;
  let appDataOnlyLinks = 0;

  const completeness = (raw: any): number =>
    [raw.title, raw.url, raw.description, raw.icon, raw.pinned === true, raw.categoryId].filter(
      isNonEmpty,
    ).length;

  for (const [urlKey, group] of groups) {
    // 基准 = 字段最全的那条（同分则取先出现的）
    let base = group[0].raw;
    for (const g of group) {
      if (completeness(g.raw) > completeness(base)) base = g.raw;
    }

    // 归一为规范字段名，再做字段级合并
    const merged: Record<string, any> = {
      id: base.id,
      title: str(base.title),
      url: str(base.url),
      desc: base.description,
      icon: base.icon,
      pinned: base.pinned,
      cat: base.categoryId,
      createdAt: base.createdAt,
    };
    const mergedFields: string[] = [];
    const sourceList = [...new Set(group.map((g) => g.source))];

    for (const { raw } of group) {
      if (raw === base) continue;
      // 字段级合并：desc / icon / pinned 任一非空就并进来，其余字段同理补空
      const pairs: [unknown, string][] = [
        [raw.description, 'desc'],
        [raw.icon, 'icon'],
        [raw.pinned, 'pinned'],
        [raw.title, 'title'],
        [raw.categoryId, 'cat'],
        [raw.createdAt, 'createdAt'],
      ];
      for (const [val, key] of pairs) {
        if (!isNonEmpty(merged[key]) && isNonEmpty(val)) {
          merged[key] = val;
          mergedFields.push(key);
        }
      }
    }

    if (group.length > 1) {
      duplicatesRemoved += group.length - 1;
      dedupDetails.push({
        urlKey,
        sources: sourceList,
        keptTitle: str(merged.title),
        mergedFields: [...new Set(mergedFields)],
      });
    }
    if (sourceList.length === 1 && sourceList[0] === OLD.APP_DATA) appDataOnlyLinks++;

    // id：保留唯一合法 id，重复 / 缺失的重新分配
    let id = str(merged.id).trim();
    if (!id || usedIds.has(id)) {
      id = uuid();
      idReassigned++;
    }
    usedIds.add(id);

    // cat：引用不到已合并分类 → 归入未分类（''）
    let cat = str(merged.cat);
    if (cat && !catIds.has(cat)) {
      cat = '';
      unknownCategoryRemapped++;
    }

    links.push({
      id,
      title: str(merged.title),
      url: str(merged.url),
      urlKey,
      desc: isNonEmpty(merged.desc) ? str(merged.desc) : undefined,
      cat,
      order: orderForIndex(orderIndex.get(urlKey) ?? 0),
      pinned: merged.pinned === true ? true : undefined,
      icon: isNonEmpty(merged.icon) ? str(merged.icon) : undefined,
      createdAt: typeof merged.createdAt === 'number' ? merged.createdAt : now,
    });
  }

  /* 4. 设置 ---------------------------------------------------------- */
  const settings: Partial<SiteSettings> = {};
  const settingsFields: string[] = [];
  const name = str(legacySettings.navTitle) || str(legacySettings.title);
  if (name) {
    settings.name = name;
    settingsFields.push('name');
  }
  const favicon = str(legacySettings.favicon);
  if (favicon) {
    settings.icon = /^https?:\/\//i.test(favicon)
      ? { type: 'image', value: favicon }
      : { type: 'letter', value: favicon };
    settingsFields.push('icon');
  }
  if (legacySettings.cardStyle === 'detailed' || legacySettings.cardStyle === 'simple') {
    settings.cardStyle = legacySettings.cardStyle === 'simple' ? 'compact' : 'card';
    settingsFields.push('cardStyle');
  }
  if (typeof legacySettings.darkMode === 'boolean') {
    settings.themeDefault = legacySettings.darkMode ? 'dark' : 'light';
    settingsFields.push('themeDefault');
  }
  if (legacyEngines.length) {
    settings.searchEngines = legacyEngines.map((e: any) => ({
      id: str(e.id) || uuid(),
      name: str(e.name),
      url: str(e.url),
      icon: isNonEmpty(e.icon) ? str(e.icon) : undefined,
    }));
    settingsFields.push('searchEngines');
  }

  const doc: Doc = {
    schemaVersion: SCHEMA_VERSION as 1,
    rev: 0,
    updatedAt: now,
    settings: settings as unknown as SiteSettings,
    categories,
    links,
  };

  /* 5. 提交（仅在 --commit 时写新 key；旧 key 一律不动） ------------- */
  if (commit) {
    await store.putText(KV.DOC, JSON.stringify(doc));
  }

  return {
    dryRun: !commit,
    sources,
    totals: {
      linksBefore: legacyLinks.length + appLinks.length,
      linksAfter: links.length,
      categoriesBefore: legacyCats.length + appCats.length,
      categoriesAfter: categories.length,
    },
    appDataOnlyLinks,
    dedup: {
      duplicateGroups: dedupDetails.length,
      duplicatesRemoved,
      details: dedupDetails,
    },
    idReassigned,
    ordersAssigned: links.length,
    unknownCategoryRemapped,
    skippedNoUrl,
    removedPasswords,
    settingsMigrated: settingsFields.length > 0,
    settingsFields,
    doc,
  };
}

/* ------------------------------------------------------------------ *
 * 报告打印
 * ------------------------------------------------------------------ */

export function formatReport(r: MigrateReport): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('================ HaoNav v0 → v1 迁移报告 ================');
  lines.push(`模式: ${r.dryRun ? 'DRY-RUN（未写入，加 --commit 才落库）' : '已提交'}`);
  lines.push('');
  lines.push('来源条数:');
  lines.push(`  haonav_links        : ${r.sources.haonavLinks}`);
  lines.push(`  haonav_categories   : ${r.sources.haonavCategories}`);
  lines.push(`  app_data.links      : ${r.sources.appDataLinks}`);
  lines.push(`  app_data.categories : ${r.sources.appDataCategories}`);
  lines.push(`  haonav_auth_password: ${r.sources.hasAuthPassword ? '存在（已忽略，不再迁移密码）' : '无'}`);
  lines.push('');
  lines.push('迁移前 vs 迁移后:');
  lines.push(`  链接: ${r.totals.linksBefore} → ${r.totals.linksAfter}`);
  lines.push(`  分类: ${r.totals.categoriesBefore} → ${r.totals.categoriesAfter}`);
  lines.push(`  只在 app_data 出现的链接（Chrome 扩展写的）: ${r.appDataOnlyLinks}`);
  lines.push('');
  lines.push(`去重: ${r.dedup.duplicateGroups} 组，移除 ${r.dedup.duplicatesRemoved} 条`);
  for (const d of r.dedup.details.slice(0, 50)) {
    lines.push(
      `  · [${d.sources.join(' + ')}] ${d.keptTitle || '(无标题)'} — merged: ${d.mergedFields.join(',') || '无'}`,
    );
    lines.push(`      urlKey: ${d.urlKey}`);
  }
  if (r.dedup.details.length > 50) lines.push(`  … 其余 ${r.dedup.details.length - 50} 组省略`);
  lines.push('');
  lines.push(`id 重新分配: ${r.idReassigned}`);
  lines.push(`order 生成: ${r.ordersAssigned}`);
  lines.push(`引用不存在的分类（已归未分类）: ${r.unknownCategoryRemapped}`);
  lines.push(`无 url 被跳过: ${r.skippedNoUrl}`);
  lines.push('');
  lines.push(`被移除的分类密码锁: ${r.removedPasswords.length} 个`);
  for (const p of r.removedPasswords) lines.push(`  · ${p.name} (${p.id})`);
  lines.push('');
  lines.push(`设置迁移字段: ${r.settingsFields.join(', ') || '（无，全部跟随 L1 出厂默认）'}`);
  lines.push('=========================================================');
  lines.push('');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

async function runCli(argv: string[]): Promise<void> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--commit') args.commit = true;
    else if (a === '--in') args.in = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }

  if (!args.in) {
    console.log(
      '用法: node --experimental-strip-types migrate/v0-to-v1.ts --in old.json [--commit] [--out new-doc.json]\n' +
        '  old.json = { "haonav_links": ..., "app_data": ..., "haonav_categories": ..., "haonav_settings": ... }',
    );
    return;
  }

  // 动态 import Node 内建，避免被打进非 Node 构建
  const { readFile, writeFile } = await import('node:fs/promises');
  const bundle = JSON.parse(await readFile(String(args.in), 'utf8')) as Record<string, unknown>;

  const seed: Record<string, string> = {};
  for (const [k, v] of Object.entries(bundle)) {
    seed[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  const store = createMemoryStore(seed);

  const report = await migrate({ store, commit: !!args.commit });
  console.log(formatReport(report));

  if (args.commit) {
    const out = String(args.out ?? 'new-doc.json');
    const text = (await store.getText(KV.DOC)) ?? '{}';
    await writeFile(out, text, 'utf8');
    console.log(`已写出新文档 → ${out}`);
  }
}

// 仅在被直接执行时跑 CLI（被 import / 测试时跳过）
const isMain = (() => {
  if (typeof process === 'undefined' || !process.argv?.[1]) return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error('迁移失败:', err);
    process.exit(1);
  });
}
