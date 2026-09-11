import React from 'react';
import { Trash2, X, ArrowRight } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  type: 'link' | 'category';
  itemName?: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  type,
  itemName
}) => {
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-700 p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors">
          <X size={20} className="text-slate-400" />
        </button>

        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 text-red-600 dark:text-red-400">
            <Trash2 size={28} />
          </div>
          <h2 className="text-lg font-bold dark:text-white">
            删除{type === 'link' ? '链接' : '分类'}
          </h2>
          <div className="text-sm text-slate-500 dark:text-slate-400 text-center mt-2 space-y-1">
            <p>
              确定要删除 <span className="font-bold text-slate-700 dark:text-slate-300">{itemName || (type === 'link' ? '此链接' : '此分类')}</span> 吗？
            </p>
            {type === 'category' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                该分类下的所有链接将被一并删除
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleConfirm}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-lg shadow-red-500/30 flex items-center justify-center gap-2"
          >
            确认删除 <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;
