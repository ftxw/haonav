import { computed, reactive, shallowRef } from 'vue';
import type { CardStyle, Category, Doc, LinkItem, SiteSettings, ThemeMode } from '../lib/models';
import { DEFAULT_SETTINGS, mergeSettings } from '../lib/settings';
import * as cache from '../lib/cache';
import { applyAccent, applyTheme, applyTitle, onSystemThemeChange } from '../lib/theme';
import { fetchDoc } from '../lib/api';
import { SEARCH_DEBOUNCE_MS, debounce } from '../lib/search';

export const ALL = 'all';

/** 预索引链接：hay 为一次性生成的小写检索串（title + url + desc） */
export interface IndexedLink extends LinkItem {
  hay: string;
}

export interface Section {
  cat: Category;
  links: IndexedLink[];
}

interface Snapshot {
  categories: Category[];
  /** Map<catId, IndexedLink[]> —— 一次性预分组，渲染时绝不 O(分类×链接) */
  byCat: Map<string, IndexedLink[]>;
  pinned: IndexedLink[];
  total: number;
}

const UNCATEGORIZED = '__uncategorized__';

const byOrder = (a: { order: string }, b: { order: string }): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : 0;

export const state = reactive({
  ready: false,
  /** /api/data 失败 → 顶栏轻提示（不弹窗、不阻断） */
  stale: false,
  rev: -1,
  settings: { ...DEFAULT_SETTINGS } as SiteSettings,
  activeCat: ALL as string,
  /** 输入框即时值 */
  query: '',
  /** 已防抖、真正参与过滤的值 */
  appliedQuery: '',
  mode: 'local' as 'local' | 'web',
  engineId: '',
  theme: 'system' as ThemeMode,
  cardStyle: 'card' as CardStyle,
  drawerOpen: false,
});

const snap = shallowRef<Snapshot>({
  categories: [],
  byCat: new Map(),
  pinned: [],
  total: 0,
});

/** 个人偏好是否被手动覆盖过（手动值优先于站点默认） */
const pref = { theme: false, card: false, engine: false };

function ingest(doc: Doc, stale: boolean): void {
  const settings = mergeSettings(doc.settings);
  state.settings = settings;
  if (!pref.theme) state.theme = settings.themeDefault ?? 'system';
  if (!pref.card) state.cardStyle = settings.cardStyle ?? 'card';
  if (!pref.engine) state.engineId = settings.searchEngines?.[0]?.id ?? '';

  applyAccent(settings.accent);
  applyTheme(state.theme);
  applyTitle(settings.name);

  const categories = [...(doc.categories ?? [])].sort(byOrder);
  const known = new Set(categories.map((c) => c.id));
  const byCat = new Map<string, IndexedLink[]>();
  for (const c of categories) byCat.set(c.id, []);

  const pinned: IndexedLink[] = [];
  const links = doc.links ?? [];
  let hasOrphans = false;
  for (let i = 0; i < links.length; i++) {
    const l = links[i];
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
    const il: IndexedLink = { ...l, hay: `${l.title}\n${l.url}\n${l.desc ?? ''}`.toLowerCase() };
    bucket.push(il);
    if (l.pinned) pinned.push(il);
  }

  if (hasOrphans) {
    categories.push({ id: UNCATEGORIZED, name: '未分类', icon: { type: 'letter' }, order: '\uffff' });
  }

  for (const bucket of byCat.values()) bucket.sort(byOrder);
  pinned.sort(byOrder);

  snap.value = { categories, byCat, pinned, total: links.length };
  state.rev = doc.rev;
  state.stale = stale;
  state.ready = true;

  // 选中的分类若已不存在，回落到「全部链接」
  if (state.activeCat !== ALL && !byCat.has(state.activeCat)) state.activeCat = ALL;
}

// ─────────────────────────── 派生数据 ───────────────────────────

export const categories = computed(() => snap.value.categories);
export const hasData = computed(() => snap.value.total > 0);
export const totalCount = computed(() => snap.value.total);

export const counts = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {};
  for (const c of snap.value.categories) m[c.id] = (snap.value.byCat.get(c.id) ?? []).length;
  return m;
});

/** 当前视图要渲染的 section 列表（已应用分类筛选 + 搜索过滤） */
export const sections = computed<Section[]>(() => {
  const q = state.appliedQuery;
  const all = snap.value.categories;
  const cats = state.activeCat === ALL ? all : all.filter((c) => c.id === state.activeCat);
  const out: Section[] = [];
  for (const cat of cats) {
    const bucket = snap.value.byCat.get(cat.id) ?? [];
    if (!q) {
      // 全部链接视图隐藏空分类；单分类视图保留（显示空态）
      if (bucket.length || state.activeCat !== ALL) out.push({ cat, links: bucket });
      continue;
    }
    const hits = bucket.filter((l) => l.hay.includes(q));
    if (hits.length) out.push({ cat, links: hits });
  }
  return out;
});

/** 置顶区：跨分类的全部置顶链接；站内搜索时整体隐藏 */
export const pinnedList = computed<IndexedLink[]>(() => (state.appliedQuery ? [] : snap.value.pinned));

export const noResults = computed(
  () => !!state.appliedQuery && sections.value.length === 0 && pinnedList.value.length === 0,
);

export const engine = computed(
  () => state.settings.searchEngines?.find((e) => e.id === state.engineId) ?? null,
);

// ─────────────────────────── 动作 ───────────────────────────

const applyQueryDebounced = debounce((v: string) => {
  state.appliedQuery = v.trim().toLowerCase();
}, SEARCH_DEBOUNCE_MS);

export function setQuery(v: string): void {
  state.query = v;
  applyQueryDebounced(v);
}

export function flushQuery(): void {
  applyQueryDebounced.cancel();
  state.appliedQuery = state.query.trim().toLowerCase();
}

export function clearQuery(): void {
  state.query = '';
  flushQuery();
}

export function setTheme(mode: ThemeMode): void {
  state.theme = mode;
  pref.theme = true;
  cache.writePref(cache.LS_THEME, mode);
  applyTheme(mode);
}

export function setCardStyle(style: CardStyle): void {
  state.cardStyle = style;
  pref.card = true;
  cache.writePref(cache.LS_CARD, style);
}

export function setActiveCat(id: string): void {
  state.activeCat = id;
  cache.writePref(cache.LS_ACTIVE, id);
  state.drawerOpen = false;
}

export function setMode(mode: 'local' | 'web'): void {
  state.mode = mode;
}

export function setEngine(id: string): void {
  state.engineId = id;
  pref.engine = true;
}

export function setDrawer(open: boolean): void {
  state.drawerOpen = open;
}

export function openLink(url: string): void {
  if (state.settings.openInNewTab) window.open(url, '_blank', 'noopener,noreferrer');
  else window.location.href = url;
}

export function runEngineSearch(q: string): void {
  const e = engine.value;
  if (!e || !q.trim()) return;
  window.open(e.url + encodeURIComponent(q.trim()), '_blank', 'noopener,noreferrer');
}

// ─────────────────────────── 生命周期 ───────────────────────────

let refreshing = false;

/** 拉 /api/data；rev 未变则不重建索引。失败则保持缓存渲染并标记 stale。 */
export async function refresh(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    const { doc, notModified } = await fetchDoc();
    if (notModified || !doc) {
      state.stale = false;
      return;
    }
    if (doc.rev === state.rev && snap.value.total === (doc.links?.length ?? 0)) {
      state.stale = false;
      return;
    }
    ingest(doc, false);
    cache.writeDocCache(doc);
  } catch {
    state.stale = true;
  } finally {
    refreshing = false;
  }
}

let booted = false;

export function bootstrap(): void {
  if (booted) return;
  booted = true;

  const savedTheme = cache.readPref(cache.LS_THEME, ['light', 'dark', 'system'] as const);
  if (savedTheme) {
    state.theme = savedTheme;
    pref.theme = true;
  }
  const savedCard = cache.readPref(cache.LS_CARD, ['card', 'compact', 'icon'] as const);
  if (savedCard) {
    state.cardStyle = savedCard;
    pref.card = true;
  }

  const cached = cache.readDocCache();
  if (cached) {
    // 首屏直接用缓存渲染（几乎看不到骨架）
    ingest(cached.doc, true);
  } else {
    applyTheme(state.theme);
    applyAccent(DEFAULT_SETTINGS.accent);
    applyTitle(DEFAULT_SETTINGS.name);
    state.ready = true;
  }

  const savedCat = cache.readPref(cache.LS_ACTIVE, [ALL, ...snap.value.categories.map((c) => c.id)]);
  if (savedCat) state.activeCat = savedCat;

  onSystemThemeChange(() => {
    if (!pref.theme || state.theme === 'system') applyTheme(state.theme);
  });

  // 切回页面时比对一次 rev（零轮询成本）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });

  void refresh();
}
