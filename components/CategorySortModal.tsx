import React from 'react';
import { X, Check, Plus, Edit2, Trash2, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Category } from '../types';

interface CategorySortModalProps {
  isOpen: boolean;
  categories: Category[];
  onClose: () => void;
  onOrderChange: (newOrder: Category[]) => void;
  onAddCategory: () => void;
  onEditCategory: (category: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
}

function SortableCategory({
  category,
  onEdit,
  onDelete,
  key,
}: {
  category: Category;
  onEdit: () => void;
  onDelete: () => void;
  key?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isEmoji = category.icon && category.icon.length <= 4 && !/^[a-zA-Z]+$/.test(category.icon);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
    >
      <div {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical size={18} className="text-slate-400" />
      </div>
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
        {isEmoji ? (
          <span className="text-base leading-none">{category.icon}</span>
        ) : (
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">
            {category.icon || category.name.charAt(0)}
          </span>
        )}
      </div>
      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
        {category.name}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
        title="编辑"
      >
        <Edit2 size={14} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
        title="删除"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function CategorySortModal({
  isOpen,
  categories,
  onClose,
  onOrderChange,
  onAddCategory,
  onEditCategory,
  onDeleteCategory,
}: CategorySortModalProps) {
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [tempCategories, setTempCategories] = React.useState<Category[]>(categories);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over.id);
      const newCategories = arrayMove(categories, oldIndex, newIndex);
      onOrderChange(newCategories);
    }
    setTempCategories(categories);
  }

  function handleDragStart(event: DragEndEvent) {
    setActiveId(event.active.id as string);
    setTempCategories(categories);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tempCategories.findIndex((c) => c.id === active.id);
      const newIndex = tempCategories.findIndex((c) => c.id === over.id);
      const newCategories = arrayMove(tempCategories, oldIndex, newIndex);
      setTempCategories(newCategories);
      onOrderChange(newCategories);
    }
  }

  if (!isOpen) return null;

  const displayCategories = activeId ? tempCategories : categories;
  const activeCategory = activeId ? categories.find((c) => c.id === activeId) : null;
  const isEmoji = activeCategory?.icon && activeCategory.icon.length <= 4 && !/^[a-zA-Z]+$/.test(activeCategory.icon);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">管理分类</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <button
            onClick={onAddCategory}
            className="w-full flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors mb-4"
          >
            <Plus size={16} />
            <span>添加分类</span>
          </button>

          <div className="max-h-[400px] overflow-y-auto space-y-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayCategories.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                {displayCategories.map((category) => (
                  <SortableCategory
                    key={category.id}
                    category={category}
                    onEdit={() => onEditCategory(category)}
                    onDelete={() => onDeleteCategory(category.id)}
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeCategory ? (
                  <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-blue-400 shadow-lg">
                    <GripVertical size={18} className="text-slate-400" />
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                      {isEmoji ? (
                        <span className="text-base leading-none">{activeCategory.icon}</span>
                      ) : (
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase">
                          {activeCategory.icon || activeCategory.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {activeCategory.name}
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Check size={16} />
            <span>完成</span>
          </button>
        </div>
      </div>
    </div>
  );
}
