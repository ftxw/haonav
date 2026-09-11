import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, ChevronDown } from 'lucide-react';
import { Category } from '../types';
import Icon from './Icon';

interface CategoryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (category: Omit<Category, 'id'>) => void;
  editingCategory?: Category | null;
}

// 预定义图标列表
const COMMON_ICONS = [
  'Folder',
  'Star',
  'Tag',
  'Monitor',
  'Smartphone',
  'Tv',
  'Camera',
  'PencilRuler',
  'Image',
  'Palette',
  'CaseSensitive',
  'LayoutPanelLeft',
  'CodeXml',
  'Bot',
  'PanelsTopLeft',
  'FileText',
  'Book',
  'BookOpen',
  'Music',
  'Film',
  'Store',
  'Shield',
  'Wallet',
  'Gem',
  'Hamburger',
  'Wheat',
  'Cloud',
  'Microscope',
  'Atom',
  'Gamepad2',
  'Plane',
  'Map',
];

const CategoryEditModal: React.FC<CategoryEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingCategory
}) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Folder');
  const [showIcons, setShowIcons] = useState(false);
  const [iconDropdownPosition, setIconDropdownPosition] = useState<{ top: number, left: number, width: number } | null>(null);
  const [password, setPassword] = useState('');
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (editingCategory) {
        setName(editingCategory.name);
        setIcon(editingCategory.icon || 'Folder');
        setPassword(editingCategory.password || '');
      } else {
        setName('');
        setIcon('Folder');
        setPassword('');
      }
      setShowIcons(false);
      setIconDropdownPosition(null);
    }
  }, [isOpen, editingCategory]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      icon: icon.trim(),
      password: password.trim() || undefined
    });
    onClose();
  };

  const handleIconClick = () => {
    if (!showIcons && iconButtonRef.current && formRef.current) {
      const rect = iconButtonRef.current.getBoundingClientRect();
      const formRect = formRef.current.getBoundingClientRect();
      setIconDropdownPosition({
        top: rect.bottom + 4,
        left: formRect.left + 16,
        width: formRect.width - 32
      });
    }
    setShowIcons(!showIcons);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold dark:text-white">
            {editingCategory ? '编辑分类' : '添加新分类'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5 dark:text-slate-400" />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSave} className="p-4 space-y-4">
          {/* Name and Icon */}
          <div className="relative">
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">分类名称</label>
            <div className="flex items-center gap-2">
              <button
                ref={iconButtonRef}
                type="button"
                onClick={handleIconClick}
                className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-300 dark:border-slate-600"
              >
                <Icon name={icon} size={20} />
              </button>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="输入分类名称"
                autoFocus
              />
            </div>

            {/* Icon Dropdown */}
            {showIcons && iconDropdownPosition && (
              <div
                className="fixed z-[70] bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-600 shadow-xl max-h-48 overflow-y-auto"
                style={{ top: `${iconDropdownPosition.top}px`, left: `${iconDropdownPosition.left}px`, width: `${iconDropdownPosition.width}px` }}
              >
                <div className="grid grid-cols-8 gap-1 p-2">
                  {COMMON_ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => {
                        setIcon(ic);
                        setShowIcons(false);
                      }}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                        icon === ic
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                      title={ic}
                    >
                      <Icon name={ic} size={18} className="font-normal" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Password Input */}
          <div>
            <label className="block text-sm font-medium mb-1 dark:text-slate-300">密码 (可选)</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 p-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="留空则不加密"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-lg shadow-blue-500/30"
            >
              {editingCategory ? '保存修改' : '添加分类'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CategoryEditModal;
