import React from 'react';
import { Plus, Edit2, Trash2, GripVertical } from 'lucide-react';
import { Category } from '../types';

interface CategoryContextMenuProps {
  x: number;
  y: number;
  category: Category | null;
  onClose: () => void;
  onAddCategory: () => void;
  onEditCategory: () => void;
  onDeleteCategory: () => void;
  onSortCategories?: () => void;
}

export function CategoryContextMenu({
  x,
  y,
  category,
  onClose,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
  onSortCategories,
}: CategoryContextMenuProps) {
  return (
    <div
      className="fixed z-[9999] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-600 w-44 py-2 flex flex-col animate-in fade-in zoom-in duration-100"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        onClick={() => {
          onAddCategory();
          onClose();
        }}
        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left"
      >
        <Plus size={16} className="text-slate-400" />
        <span>添加</span>
      </button>

      {category && (
        <>
          <button
            onClick={() => {
              onEditCategory();
              onClose();
            }}
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left"
          >
            <Edit2 size={16} className="text-slate-400" />
            <span>编辑</span>
          </button>
        </>
      )}

      {onSortCategories && (
        <button
          onClick={() => {
            onSortCategories();
            onClose();
          }}
          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors text-left"
        >
          <GripVertical size={16} className="text-slate-400" />
          <span>排序</span>
        </button>
      )}

      {category && (
        <>
          <div className="h-px bg-slate-100 dark:bg-slate-700 my-1 mx-2" />

          <button
            onClick={() => {
              onDeleteCategory();
              onClose();
            }}
            className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition-colors text-left"
          >
            <Trash2 size={16} />
            <span>删除</span>
          </button>
        </>
      )}
    </div>
  );
}

export default CategoryContextMenu;
