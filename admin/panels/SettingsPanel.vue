<script setup lang="ts">
import { computed, ref } from 'vue';
import { mutate, commitCurrent, state, toast } from '../lib/adminStore';
import {
  BTN_PRIMARY_LG,
  BTN_SECONDARY,
  CARD_BOX,
  CARD_TITLE,
  FORM_ROW,
  INPUT,
  LABEL,
  PAGE,
  PAGE_ACTIONS,
  PAGE_HEAD,
  PAGE_HEAD_MAIN,
  PAGE_TITLE,
  SECTION_LABEL,
} from '../lib/adminUi';
import type { SearchEngine, SiteSettings } from '../../shared/types';

const settings = computed<SiteSettings | null>(() => state.doc?.settings ?? null);

/** 直接改 state.doc.settings，保存时 diff 自动生成 settings.update */
function patch(fn: (s: SiteSettings) => void): void {
  mutate((d) => {
    if (d.settings) fn(d.settings);
  });
}

/* ── 基础字段（避免在模板里写复杂 TS 断言） ── */
const setName = (v: string): void => patch((s) => (s.name = v));
const setIconType = (v: string): void => patch((s) => (s.icon = { ...s.icon, type: v as SiteSettings['icon']['type'] }));
const setIconValue = (v: string): void => patch((s) => (s.icon = { ...s.icon, value: v }));
const setAccent = (v: string): void => patch((s) => (s.accent = v));
const setThemeDefault = (v: string): void => patch((s) => (s.themeDefault = v as SiteSettings['themeDefault']));
const setCardStyle = (v: string): void => patch((s) => (s.cardStyle = v as SiteSettings['cardStyle']));
const setOpenInNewTab = (v: boolean): void => patch((s) => (s.openInNewTab = v));
const setIconStrategy = (v: string): void => patch((s) => (s.iconStrategy = v as SiteSettings['iconStrategy']));
/* ── 备份策略 → 已拆到 BackupPanel ── */


/* ── 搜索引擎管理 → 已拆到 SearchPanel ── */

/* ── 页脚外链 ── */
function addFooter(): void {
  patch((s) => {
    s.footerLinks = [...s.footerLinks, { label: '新链接', url: 'https://' }];
  });
}
function removeFooter(i: number): void {
  patch((s) => {
    s.footerLinks = s.footerLinks.filter((_, idx) => idx !== i);
  });
}
function setFooterLabel(i: number, v: string): void {
  patch((s) => (s.footerLinks[i] = { ...s.footerLinks[i], label: v }));
}
function setFooterUrl(i: number, v: string): void {
  patch((s) => (s.footerLinks[i] = { ...s.footerLinks[i], url: v }));
}

const saving = ref(false);
async function saveNow(): Promise<void> {
  saving.value = true;
  try {
    await commitCurrent();
  } finally {
    saving.value = false;
  }
}

/* 类名统一走 admin/lib/adminUi.ts（玻璃面 + accent 令牌，与前台同语言） */
const inputCls = INPUT;
const labelCls = LABEL;
const cardCls = CARD_BOX;
const titleCls = CARD_TITLE;
const rowCls = FORM_ROW;
const miniBtn = BTN_SECONDARY;
</script>

<template>
  <div v-if="settings" :class="PAGE">
    <!-- 页面标题区：微标签 + 大标题 + 右侧主操作 -->
    <div :class="PAGE_HEAD">
      <div :class="PAGE_HEAD_MAIN">
        <span :class="SECTION_LABEL">站点设置</span>
        <h2 :class="PAGE_TITLE">设置</h2>
      </div>
      <div :class="PAGE_ACTIONS">
        <span class="text-xs text-slate-500">{{ state.dirty ? '有未保存的更改' : '所有更改已保存' }}</span>
        <button
          type="button"
          :class="BTN_PRIMARY_LG"
          :disabled="!state.dirty || state.saving || saving"
          @click="saveNow"
        >
          {{ state.saving || saving ? '保存中…' : '保存设置' }}
        </button>
      </div>
    </div>

    <!-- 品牌 -->
    <div :class="cardCls">
      <h3 :class="titleCls">品牌</h3>
      <div :class="rowCls + ' mt-3'">
        <label class="block">
          <span :class="labelCls">站点名称（标题 / 侧栏 / 分享）</span>
          <input :value="settings.name" type="text" :class="inputCls" @input="setName(($event.target as HTMLInputElement).value)" />
        </label>
        <label class="block">
          <span :class="labelCls">品牌图形类型</span>
          <select :value="settings.icon.type" :class="inputCls" @change="setIconType(($event.target as HTMLSelectElement).value)">
            <option value="letter">字母（取名称首字）</option>
            <option value="emoji">Emoji</option>
            <option value="image">图片 URL</option>
          </select>
        </label>
        <label class="block">
          <span :class="labelCls">品牌图形值（letter 可留空）</span>
          <input :value="settings.icon.value" type="text" :class="inputCls" @input="setIconValue(($event.target as HTMLInputElement).value)" />
        </label>
      </div>
    </div>

    <!-- 外观 -->
    <div :class="cardCls">
      <h3 :class="titleCls">外观</h3>
      <div :class="rowCls + ' mt-3'">
        <label class="block">
          <span :class="labelCls">主色（运行时生效，无需重新构建）</span>
          <div class="flex gap-2">
            <input type="color" :value="settings.accent" class="h-9 w-12 cursor-pointer rounded-lg border border-slate-300/70 dark:border-white/15" @input="setAccent(($event.target as HTMLInputElement).value)" />
            <input :value="settings.accent" type="text" :class="inputCls" @input="setAccent(($event.target as HTMLInputElement).value)" />
          </div>
        </label>
        <label class="block">
          <span :class="labelCls">默认主题</span>
          <select :value="settings.themeDefault" :class="inputCls" @change="setThemeDefault(($event.target as HTMLSelectElement).value)">
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <label class="block">
          <span :class="labelCls">默认卡片视图（前台可临时覆盖）</span>
          <select :value="settings.cardStyle" :class="inputCls" @change="setCardStyle(($event.target as HTMLSelectElement).value)">
            <option value="card">卡片</option>
            <option value="icon">图标</option>
          </select>
        </label>
      </div>
    </div>

    <!-- 行为 / 图标 -->
    <div :class="cardCls">
      <h3 :class="titleCls">行为与图标</h3>
      <div :class="rowCls + ' mt-3'">
        <label class="flex items-center gap-2 self-end text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" :checked="settings.openInNewTab" @change="setOpenInNewTab(($event.target as HTMLInputElement).checked)" />
          链接在新标签打开
        </label>
        <label class="block">
          <span :class="labelCls">链接卡片图标来源</span>
          <select :value="settings.iconStrategy" :class="inputCls" @change="setIconStrategy(($event.target as HTMLSelectElement).value)">
            <option value="letter">字母色块（零请求，推荐）</option>
            <option value="fetched">抓取站点图标（走 /icon）</option>
          </select>
        </label>
      </div>
    </div>

    <!-- 搜索引擎 → 见「搜索」面板 -->

    <!-- 页脚外链 -->
    <div :class="cardCls">
      <div class="flex items-center gap-2">
        <h3 :class="titleCls">侧栏页脚外链</h3>
        <button type="button" :class="miniBtn + ' ml-auto'" @click="addFooter">＋ 添加</button>
      </div>
      <div class="mt-3 space-y-2">
        <div v-for="(f, i) in settings.footerLinks" :key="i" class="flex flex-wrap items-center gap-2">
          <input :value="f.label" type="text" placeholder="名称" :class="inputCls + ' w-40'" @input="setFooterLabel(i, ($event.target as HTMLInputElement).value)" />
          <input :value="f.url" type="text" placeholder="https://" :class="inputCls + ' flex-1'" @input="setFooterUrl(i, ($event.target as HTMLInputElement).value)" />
          <button type="button" class="text-xs text-red-500 hover:underline" @click="removeFooter(i)">删除</button>
        </div>
        <p v-if="!settings.footerLinks.length" class="text-xs text-slate-400">未配置（侧栏底部将不显示外链）</p>
      </div>
    </div>

    <!-- 备份策略 → 见「备份」面板 -->

    <!-- 保存操作统一放在页面标题区（见上） -->
  </div>
</template>
