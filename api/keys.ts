/**
 * KV key 名与文档结构常量。
 *
 * ⚠️ 这是全仓**唯一允许硬编码 KV key 名**的地方。其它模块一律从这里引用，
 * 避免"三套后端各写一套 key"的旧问题重演。
 */

export const KV = {
  /** 主文档 */
  DOC: 'nav:v1',
  /** 快照索引（index-aside，替代 KV.list，免费版 List 仅 1,000/天） */
  SNAPSHOT_INDEX: 'nav:snap:index',
  /** 快照 key 前缀：nav:snap:<ISO 时间> */
  SNAPSHOT_PREFIX: 'nav:snap:',
} as const;

export const SCHEMA_VERSION = 1;

/** 文档序列化后的大小上限（1 MB） */
export const MAX_DOC_BYTES = 1024 * 1024;

/** 会话 cookie 名 */
export const SESSION_COOKIE = 'haonav_session';

/** 会话有效期（秒）：30 天 */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
