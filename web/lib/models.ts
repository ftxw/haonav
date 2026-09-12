/**
 * 前端视图模型：直接复用 `shared/types.ts` 的规范契约（编译期类型，运行时 0 字节）。
 * 这里只做转出 + 少量前端侧派生别名，绝不定义第二套结构。
 */
export type {
  BackupFrequency,
  BackupMode,
  BrandIcon,
  CardStyle,
  Category,
  Doc,
  IconStrategy,
  LinkItem,
  Op,
  SearchEngine,
  SiteSettings,
  SnapshotMeta,
  ThemeMode,
} from '../../shared/types';

import type { SiteSettings } from '../../shared/types';

/** 页脚外链（从 SiteSettings 派生，避免重复定义） */
export type FooterLink = SiteSettings['footerLinks'][number];
