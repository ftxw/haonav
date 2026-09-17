import { ref, type Ref } from 'vue';

export interface TouchDragOptions {
  /** 落点回调：把 `fromId` 放到 `toId` 上（「放到之前 / 之后」的语义由调用方决定） */
  onDrop: (fromId: string, toId: string) => void;
  /** 触摸点 → 目标项 id（调用方用 `elementFromPoint(x,y).closest('[data-drag-id]')` 取 dataset 值） */
  resolveId: (x: number, y: number) => string | null;
}

export interface TouchDrag {
  dragId: Ref<string | null>;
  overId: Ref<string | null>;
  onTouchDown: (id: string, e: PointerEvent) => void;
  onTouchMove: (e: PointerEvent) => void;
  onTouchUp: (e: PointerEvent) => void;
  onTouchCancel: () => void;
}

/**
 * 触屏拖拽排序 —— **只接管触摸**，鼠标仍走调用方原有的原生 HTML5 DnD，行为不变。
 *
 * 为什么需要：HTML5 `draggable` 在触屏上不触发 `dragstart`，手指按住拖动会直接变成滚动页面，
 * 表现为「拖不准 / 拖不动」。故触屏必须走独立的指针手势分支：
 *   1. 调用方在**拖拽柄**上加 `touch-none`（`touch-action: none`）——从拖拽柄起手时浏览器不再滚动；
 *   2. 本模块用 Pointer Events 接管触摸：按下即抓住该行，移动时用坐标反查落点行，松手落位。
 * 两者配合，触屏拖拽不再与原生滚动打架。
 *
 * ⚠️ 只绑在拖拽柄上（不是整行），手指从列表其他位置起手仍是正常滚动。
 */
export function useTouchDrag(opts: TouchDragOptions): TouchDrag {
  const dragId = ref<string | null>(null);
  const overId = ref<string | null>(null);
  /** 是否正处于触摸拖拽中（用于区分与鼠标拖拽的视觉态） */
  const capturing = ref(false);

  function onTouchDown(id: string, e: PointerEvent): void {
    // 鼠标 / 触控笔交给原生拖拽，不接管
    if (e.pointerType !== 'touch') return;
    if (e.button > 0) return;
    dragId.value = id;
    overId.value = id;
    capturing.value = true;
    const el = e.currentTarget as HTMLElement | null;
    try {
      el?.setPointerCapture(e.pointerId);
    } catch {
      /* 部分浏览器不支持 / 指针已释放：忽略，仍可用坐标反查落点 */
    }
    // 压住长按选中与默认滚动
    e.preventDefault();
  }

  function onTouchMove(e: PointerEvent): void {
    if (!capturing.value) return;
    e.preventDefault();
    overId.value = opts.resolveId(e.clientX, e.clientY);
  }

  function finish(e: PointerEvent): void {
    if (!capturing.value) return;
    const from = dragId.value;
    const to = overId.value;
    capturing.value = false;
    dragId.value = null;
    overId.value = null;
    const el = e.currentTarget as HTMLElement | null;
    try {
      el?.releasePointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
    if (from && to && from !== to) opts.onDrop(from, to);
  }

  function onTouchCancel(): void {
    capturing.value = false;
    dragId.value = null;
    overId.value = null;
  }

  return { dragId, overId, onTouchDown, onTouchMove, onTouchUp: finish, onTouchCancel };
}

/**
 * 生成「触摸点 → `[data-drag-id]` 元素 id」的解析函数。
 * 供 `useTouchDrag` 的 `resolveId` 直接使用（各面板的项 id 都挂在 `data-drag-id` 上）。
 */
export function dragIdAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  return el?.closest<HTMLElement>('[data-drag-id]')?.dataset.dragId ?? null;
}
