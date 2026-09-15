import type { PanelId } from './adminStore';

/**
 * 后台导航分组 —— **唯一数据源**。
 *
 * 侧栏导航（AdminNav）与各面板的标题卡（PageHead）都从这里取名字：
 *   · `title` = 一级分类 → 标题卡的微标签
 *   · `label` = 二级分类 → 标题卡的大标题，同时就是侧栏导航项文案
 *   · `desc`  = 该面板标题下的说明文字（每个面板都有，形态保持一致）
 *
 * 改这里一处，左侧导航与右侧标题栏**同时**变 —— 满足「标题栏和左侧同步」的要求。
 */
export interface PanelMeta {
  id: PanelId;
  /** 二级分类：侧栏导航项文案 + 标题卡大标题 */
  label: string;
  icon: string;
  /** 标题卡说明文字 */
  desc: string;
}

export interface PanelGroup {
  /** 一级分类：标题卡微标签 */
  title: string;
  items: PanelMeta[];
}

export const PANEL_GROUPS: PanelGroup[] = [
  {
    title: '内容管理',
    items: [
      {
        id: 'links',
        label: '链接管理',
        icon: 'list',
        desc: '站点收藏的网址入口。左侧分类目录可快速筛选，表格支持拖拽排序与批量操作。',
      },
      {
        id: 'categories',
        label: '分类管理',
        icon: 'grid',
        desc: '拖拽行可排序；删除分类时其下链接可指定去向，不会丢失。',
      },
      {
        id: 'search',
        label: '搜索引擎',
        icon: 'search',
        desc: '配置前台「站外搜索」使用的搜索引擎列表。',
      },
    ],
  },
  {
    title: '数据管理',
    items: [
      {
        id: 'data',
        label: '导入导出',
        icon: 'upload',
        desc: '导入浏览器书签 HTML / JSON 备份，或导出完整数据与标准书签文件。',
      },
      {
        id: 'check',
        label: '链接检测',
        icon: 'activity',
        desc: '检测重复链接与失效链接，可一键清理冗余条目。',
      },
    ],
  },
  {
    title: '系统管理',
    items: [
      {
        id: 'settings',
        label: '系统设置',
        icon: 'gear',
        desc: '站点名称、外观、图标策略、页脚外链等全局设定。',
      },
      {
        id: 'backup',
        label: '备份管理',
        icon: 'download',
        desc: '自动或手动保存站点数据快照，可随时恢复历史版本。',
      },
    ],
  },
];

/** 扁平索引：panel id → 一级分类 / 二级分类 / 说明 */
const META = new Map<PanelId, { group: string; label: string; desc: string }>();
for (const g of PANEL_GROUPS) {
  for (const p of g.items) META.set(p.id, { group: g.title, label: p.label, desc: p.desc });
}

/** 供 PageHead 使用：拿某个面板的「一级分类 / 二级分类 / 说明」 */
export function panelMeta(id: PanelId): { group: string; label: string; desc: string } {
  return META.get(id) ?? { group: '', label: id, desc: '' };
}
