import { useState } from 'react';
import { motion } from 'motion/react';
import { todoCollection } from '@/frontend/collection';

interface TodoItemProps {
  todo: typeof todoCollection.TypeWithOptimistic;
  onToggle: () => void;
  onUpdate: (text: string) => void;
}

export function TodoItem({ todo, onToggle, onUpdate }: TodoItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(todo.title);
  const isComplete = todo.status === 'complete';

  const handleSave = () => {
    if (!editText.trim()) {
      setEditText(todo.title);
      setIsEditing(false);
      return;
    }
    onUpdate(editText.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditText(todo.title);
    setIsEditing(false);
  };

  const handleItemClick = () => {
    if (!isEditing) {
      onToggle();
    }
  };
  const {
    _optimisticState: { insertionInProgress, updateInProgress, updates },
  } = todo;

  return (
    <motion.div
      layoutId={todo.todoId}
      className="group flex items-center gap-3 px-4 py-3.5 bg-white border border-gray-200 rounded-lg transition-colors hover:shadow-sm hover:border-gray-300 cursor-pointer"
      onClick={handleItemClick}
      style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
    >
      <motion.div
        animate={{ scale: isComplete ? 1.1 : 1 }}
        className="flex-shrink-0"
      >
        <input
          type="checkbox"
          checked={isComplete}
          onChange={(e) => e.stopPropagation()}
          className="w-5 h-5 cursor-pointer accent-blue-500 pointer-events-none rounded"
        />
      </motion.div>

      <div className="flex-1 relative" style={{ minWidth: 0 }}>
        {isEditing ? (
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
            onBlur={handleSave}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="w-full text-[15px] bg-transparent border-0 border-b-2 border-blue-500 outline-none focus:outline-none text-gray-900"
            style={{
              padding: 0,
              margin: 0,
              lineHeight: '24px',
              height: '26px',
              boxSizing: 'border-box',
              verticalAlign: 'baseline',
            }}
          />
        ) : (
          <span
            className={`block text-[15px] border-0 border-b-2 border-transparent ${
              isComplete ? 'text-gray-400 line-through' : 'text-gray-900'
            } select-none`}
            style={{
              padding: 0,
              margin: 0,
              lineHeight: '24px',
              height: '26px',
              boxSizing: 'border-box',
              verticalAlign: 'baseline',
              opacity: isComplete ? 0.5 : 1,
            }}
          >
            {todo.title}
          </span>
        )}
      </div>
      <pre>
        {insertionInProgress && 'inserting...'}
        {updateInProgress.length.toString().padStart(4)} ::
        {updates.length.toString().padStart(4)}
      </pre>

      <div
        onClick={(e) => e.stopPropagation()}
        className={`flex gap-1 transition-opacity ${isEditing ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}
        style={{ width: '28px', flexShrink: 0 }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          className="px-1.5 py-1 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
          title="Edit (or double-click)"
          disabled={isEditing}
        >
          edit
        </button>
      </div>
    </motion.div>
  );
}
