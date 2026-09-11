



import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Trash2, Check, Globe, Wand2, GripVertical, Edit2 } from 'lucide-react';
import { SearchEngine } from '../types';
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

interface SearchSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  engines: SearchEngine[];
  activeEngineId: string;
  onUpdateEngines: (engines: SearchEngine[]) => void;
  onSelectEngine: (id: string) => void;
}

function SortableEngine({
  engine,
  isActive,
  isSorting,
  onEdit,
  onDelete,
  onSelect,
}: {
  engine: SearchEngine;
  isActive: boolean;
  isSorting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: engine.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
        isActive
          ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500 dark:bg-blue-900/20 dark:border-blue-500'
          : 'bg-white border-slate-200 hover:border-blue-300 dark:bg-slate-700/50 dark:border-slate-600 dark:hover:border-slate-500'
      } ${isSorting ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onClick={() => !isSorting && onSelect()}
    >
      {isSorting && (
        <div className="text-slate-400">
          <GripVertical size={16} />
        </div>
      )}
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
        {engine.icon?.startsWith('http') ? (
          <img src={engine.icon} className="w-5 h-5 rounded-full object-cover" alt="" />
        ) : (
          <Search size={20} />
        )}
      </div>
      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        {engine.name}
      </span>
      {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
      {!isSorting && (
        <>
          <button
            onPointerDown={(e) => e.stopPropagation()}
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
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}

const SearchSettingsModal: React.FC<SearchSettingsModalProps> = ({
  isOpen,
  onClose,
  engines,
  activeEngineId,
  onUpdateEngines,
  onSelectEngine
}) => {
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [autoFetchIcon, setAutoFetchIcon] = useState(true);
  const [isSorting, setIsSorting] = useState(false);
  const [editingEngine, setEditingEngine] = useState<SearchEngine | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tempEngines, setTempEngines] = useState<SearchEngine[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 当开始编辑时，滚动到底部
  useEffect(() => {
    if (editingEngine) {
      setTimeout(() => {
        const formElement = document.querySelector('[data-engine-form]');
        if (formElement) {
          formElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [editingEngine]);

  if (!isOpen) return null;

  const handleDelete = (id: string) => {
    if (confirm('确定删除此搜索引擎吗？')) {
        const updated = engines.filter(e => e.id !== id);
        onUpdateEngines(updated);
        // 如果删除了当前选中的，重置为第一个可用的
        if (id === activeEngineId && updated.length > 0) {
            onSelectEngine(updated[0].id);
        }
    }
  };

  const handleEdit = (engine: SearchEngine) => {
    setEditingEngine(engine);
    setNewName(engine.name);
    setNewUrl(engine.url);
    setNewIcon(engine.icon);
  };

  const handleSave = () => {
    if (!newName || !newUrl) return;

    let formattedUrl = newUrl;
    if (!formattedUrl.startsWith('http')) {
        formattedUrl = 'https://' + formattedUrl;
    }

    if (editingEngine) {
        // 编辑现有引擎
        const updated = engines.map(e =>
            e.id === editingEngine.id
                ? { ...e, name: newName, url: formattedUrl, icon: newIcon || 'Globe' }
                : e
        );
        onUpdateEngines(updated);
    } else {
        // 添加新引擎
        const newEngine: SearchEngine = {
            id: Date.now().toString(),
            name: newName,
            url: formattedUrl,
            icon: newIcon || 'Globe'
        };
        onUpdateEngines([...engines, newEngine]);
    }

    // 重置表单
    setEditingEngine(null);
    setNewName('');
    setNewUrl('');
    setNewIcon('');
  };

  const handleCancel = () => {
    setEditingEngine(null);
    setNewName('');
    setNewUrl('');
    setNewIcon('');
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = engines.findIndex((e) => e.id === active.id);
      const newIndex = engines.findIndex((e) => e.id === over.id);
      const newEngines = arrayMove(engines, oldIndex, newIndex);
      onUpdateEngines(newEngines);
    }
    setTempEngines(engines);
  }

  function handleDragStart(event: DragEndEvent) {
    setActiveId(event.active.id as string);
    setTempEngines(engines);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tempEngines.findIndex((e) => e.id === active.id);
      const newIndex = tempEngines.findIndex((e) => e.id === over.id);
      const newEngines = arrayMove(tempEngines, oldIndex, newIndex);
      setTempEngines(newEngines);
      onUpdateEngines(newEngines);
    }
  }

  const fetchIconFromUrl = (targetUrl: string) => {
      if (!targetUrl) return;
      try {
        let normalizedUrl = targetUrl;
        if (!targetUrl.startsWith('http')) {
            normalizedUrl = 'https://' + targetUrl;
        }
        
        // 尝试解析域名
        const urlObj = new URL(normalizedUrl);
        const origin = urlObj.origin;

        // 使用 favicon.im 服务获取图标
        const newIconUrl = `https://favicon.im/zh/${origin.replace('https://', '')}?larger=true`;

        setNewIcon(newIconUrl);
      } catch (e) {
          // invalid url
      }
  };

  const handleUrlBlur = () => {
      if (autoFetchIcon && newUrl && !newIcon) {
          fetchIconFromUrl(newUrl);
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex flex-col max-h-[85vh]">
        
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white flex items-center gap-2">
            <Search className="text-blue-500" size={20}/> 搜索引擎管理
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-6">
            
            {/* List */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500 uppercase">选择默认搜索引擎</label>
                    {!isSorting && engines.length > 1 && (
                        <button
                            onClick={() => setIsSorting(true)}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                            排序
                        </button>
                    )}
                    {isSorting && (
                        <button
                            onClick={() => setIsSorting(false)}
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                        >
                            完成
                        </button>
                    )}
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={engines.map((e) => e.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {engines.map((engine) => (
                      <SortableEngine
                        key={engine.id}
                        engine={engine}
                        isActive={activeEngineId === engine.id}
                        isSorting={isSorting}
                        onEdit={() => handleEdit(engine)}
                        onDelete={() => handleDelete(engine.id)}
                        onSelect={() => onSelectEngine(engine.id)}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay>
                    {activeId ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl border bg-white dark:bg-slate-800 shadow-lg">
                        <GripVertical size={16} className="text-slate-400" />
                        <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-600 flex items-center justify-center shrink-0 overflow-hidden">
                          {engines.find((e) => e.id === activeId)?.icon?.startsWith('http') ? (
                            <img src={engines.find((e) => e.id === activeId)?.icon} className="w-5 h-5 rounded-full object-cover" alt="" />
                          ) : (
                            <Search size={20} />
                          )}
                        </div>
                        <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
                          {engines.find((e) => e.id === activeId)?.name}
                        </span>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
            </div>

            {/* Add/Edit Engine */}
            <div data-engine-form className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-200 dark:border-slate-600 space-y-4">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500 uppercase">
                        {editingEngine ? '编辑搜索引擎' : '添加新引擎'}
                    </label>
                    {editingEngine && (
                        <button
                            onClick={handleCancel}
                            className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                        >
                            取消编辑
                        </button>
                    )}
                </div>

                <div className="space-y-3">
                    {/* Name */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">名称</label>
                        <input 
                            type="text" 
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="例如: Google"
                            className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Search URL */}
                    <div>
                         <label className="block text-xs font-medium text-slate-500 mb-1">搜索 URL</label>
                         <input 
                            type="text" 
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            onBlur={handleUrlBlur}
                            placeholder="例如: https://www.google.com/search?q="
                            className="w-full p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">系统会自动将搜索词拼接到此 URL 末尾</p>
                    </div>

                    {/* Icon Section */}
                    <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">图标 URL</label>
                        <div className="flex gap-2">
                             {/* Preview */}
                             <div className="shrink-0 w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
                                {newIcon ? (
                                     <img 
                                        src={newIcon} 
                                        className="w-full h-full object-contain"
                                        onError={(e) => {e.currentTarget.style.display='none'}}
                                     />
                                ) : (
                                    <Globe size={18} className="text-slate-400"/>
                                )}
                             </div>
                             
                             {/* Input */}
                             <input 
                                type="text"
                                value={newIcon}
                                onChange={(e) => setNewIcon(e.target.value)}
                                className="flex-1 p-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="https://..."
                             />
            
                             {/* Button */}
                             <button
                                type="button"
                                onClick={() => fetchIconFromUrl(newUrl)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 whitespace-nowrap transition-colors"
                             >
                                <Wand2 size={14} /> <span className="hidden sm:inline">获取</span>
                             </button>
                        </div>
                        
                        <div className="mt-2 flex items-center gap-2">
                            <input 
                                type="checkbox" 
                                id="autoFetchSearch"
                                checked={autoFetchIcon}
                                onChange={(e) => setAutoFetchIcon(e.target.checked)}
                                className="rounded text-blue-600 focus:ring-blue-500 w-3 h-3"
                            />
                            <label htmlFor="autoFetchSearch" className="text-xs text-slate-500 cursor-pointer select-none">
                                输入 URL 时自动获取图标
                            </label>
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <button
                        onClick={handleSave}
                        disabled={!newName || !newUrl}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {editingEngine ? <Check size={16} /> : <Plus size={16} />}
                        {editingEngine ? '保存修改' : '添加搜索引擎'}
                    </button>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default SearchSettingsModal;
