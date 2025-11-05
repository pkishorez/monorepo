import { useRef, useState } from 'react';

interface TodoInputProps {
  onAdd: (text: string) => void;
}

export function TodoInput({ onAdd }: TodoInputProps) {
  const [text, setText] = useState('');
  const v = useRef(0).current++;

  const handleSubmit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };

  return (
    <div className="flex gap-3 mb-6">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder="What needs to be done?"
        className="flex-1 px-4 py-3.5 text-[15px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      />
      <button
        onClick={() => {
          onAdd('TEST TODO : ' + v);
        }}
        className="px-6 py-3.5 text-[15px] font-medium text-white bg-blue-500 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-all shadow-sm hover:shadow-md disabled:shadow-none"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      >
        Test Add
      </button>
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        className="px-6 py-3.5 text-[15px] font-medium text-white bg-blue-500 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-all shadow-sm hover:shadow-md disabled:shadow-none"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      >
        Add Todo
      </button>
    </div>
  );
}
