import siteConfig from '../../site.config.json';
import type { SiteSettings } from './models';

/**
 * L1 出厂默认：唯一来源是 `site.config.json`（构建期内联，运行时不发额外请求）。
 * 读取时 `settings = { ...L1, ...doc.settings }` —— 没改过的跟随配置文件，改过的持久化在 KV。
 */
export const DEFAULT_SETTINGS: SiteSettings = siteConfig as unknown as SiteSettings;

export function mergeSettings(partial?: Partial<SiteSettings> | null): SiteSettings {
  if (!partial) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...partial };
}
