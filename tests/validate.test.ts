import { describe, expect, it } from 'vitest';
import type { Doc } from '../shared/types';
import { validateDoc } from '../api/validate';
import { MAX_DOC_BYTES } from '../api/keys';

function goodDoc(): Doc {
  return {
    schemaVersion: 1,
    rev: 3,
    updatedAt: 1,
    settings: {} as unknown as Doc['settings'],
    categories: [{ id: 'c1', name: '开发', icon: 'folder', order: '0000' }],
    links: [
      {
        id: 'l1',
        title: 'GitHub',
        url: 'https://github.com',
        urlKey: 'https://github.com',
        cat: 'c1',
        order: '0000',
        createdAt: 1,
      },
    ],
  };
}

describe('validateDoc', () => {
  it('接受合法文档', () => {
    const r = validateDoc(goodDoc());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc.links.length).toBe(1);
  });

  it('拒绝非对象 / schemaVersion 不匹配', () => {
    expect(validateDoc(null).ok).toBe(false);
    expect(validateDoc('x').ok).toBe(false);
    expect(validateDoc({ ...goodDoc(), schemaVersion: 2 }).ok).toBe(false);
  });

  it('拒绝 rev 非数字 / settings 非对象 / 数组类型错误', () => {
    expect(validateDoc({ ...goodDoc(), rev: 'x' }).ok).toBe(false);
    expect(validateDoc({ ...goodDoc(), settings: 5 }).ok).toBe(false);
    expect(validateDoc({ ...goodDoc(), categories: {} }).ok).toBe(false);
    expect(validateDoc({ ...goodDoc(), links: {} }).ok).toBe(false);
  });

  it('拒绝链接缺关键字段', () => {
    const d = goodDoc();
    delete (d.links[0] as any).urlKey;
    expect(validateDoc(d).ok).toBe(false);
  });

  it('拒绝分类缺字段', () => {
    const d = goodDoc();
    delete (d.categories[0] as any).order;
    expect(validateDoc(d).ok).toBe(false);
  });

  it('超过 1 MB 拒绝', () => {
    const d = goodDoc();
    d.links[0].desc = 'x'.repeat(MAX_DOC_BYTES);
    const r = validateDoc(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('过大');
  });

  it('允许 settings 为空对象（L1 默认由前端合并）', () => {
    expect(validateDoc(goodDoc()).ok).toBe(true);
  });
});
