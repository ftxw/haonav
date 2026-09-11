/**
 * HaoNav 共享契约 —— 只放 TypeScript 类型 / 接口，绝不放任何运行时代码。
 *
 * 为什么必须如此：`shared/` 会被前端 import，任何函数 / 常量 / class 都会被
 * 打进浏览器包体（首屏预算只有 45 KB brotli）。这里只允许出现
 * `export type` / `export interface`。所有类型在编译期消失，运行时 0 字节。
 */

export type CardStyle = 'card' | 'compact' | 'icon';
export type ThemeMode = 'light' | 'dark' | 'system';
export type IconStrategy = 'letter' | 'fetched';
export type BackupMode = 'auto' | 'manual';
export type BackupFrequency = 'daily' | 'weekly';

export interface SearchEngine {
  id: string;
  name: string;
  url: string;
  icon?: string;
}

export type BrandIcon =
  | { type: 'letter'; value: string }
  | { type: 'emoji'; value: string }
  | { type: 'image'; value: string };

export type CategoryIcon =
  | { type: 'letter' }
  | { type: 'emoji'; value: string };

export interface Category {
  id: string;
  name: string;
  icon: CategoryIcon;
  order: string;
}

export interface LinkItem {
  id: string;
  title: string;
  url: string;
  /** 规范化后的 url（去末尾斜杠、host 小写、剥离追踪参数），用于去重 */
  urlKey: string;
  desc?: string;
  cat: string;
  order: string;
  pinned?: boolean;
  /** fetched 模式下存 '/api/icon?u=<domain>&v=<hash>' */
  icon?: string;
  createdAt: number;
}

export interface SiteSettings {
  name: string;
  /** 品牌图形；favicon 由它自动派生 */
  icon: BrandIcon;
  /** 主色 → CSS 变量 --accent */
  accent: string;
  themeDefault: ThemeMode;
  cardStyle: CardStyle;
  openInNewTab: boolean;
  searchEngines: SearchEngine[];
  /** 链接卡片图标来源 */
  iconStrategy: IconStrategy;
  footerLinks: { label: string; url: string }[];
  /** retention 1-30 */
  backup: { mode: BackupMode; frequency: BackupFrequency; retention: number };
}

export interface Doc {
  schemaVersion: 1;
  /** 乐观并发：每次写入 +1（快照恢复也必须 +1） */
  rev: number;
  updatedAt: number;
  settings: SiteSettings;
  categories: Category[];
  links: LinkItem[];
}

export interface SnapshotMeta {
  key: string;
  at: number;
  size: number;
}

export type Op =
  | { t: 'link.add'; link: LinkItem }
  | { t: 'link.update'; id: string; patch: Partial<LinkItem> }
  | { t: 'link.move'; id: string; cat?: string; order: string }
  | { t: 'link.delete'; id: string }
  | { t: 'link.pin'; id: string; pinned: boolean }
  | { t: 'cat.add'; cat: Category }
  | { t: 'cat.update'; id: string; patch: Partial<Category> }
  | { t: 'cat.move'; id: string; order: string }
  | { t: 'cat.delete'; id: string }
  | { t: 'cat.merge'; fromId: string; toId: string }
  | { t: 'settings.update'; patch: Partial<SiteSettings> };
