import { todoCollection } from '@/frontend/collection';
import { runtime } from '@/frontend/runtime';
import { useState } from 'react';
import { ulid } from 'ulid';

let v = 0;
export function TodoInput() {
  const [text, setText] = useState('');

  const onAdd = (text: string) => {
    runtime.runFork(
      todoCollection.insert({
        todoId: ulid(),
        updatedAt: new Date().toISOString(),
        userId: 'test',
        title: text,
        status: 'active',
      }),
    );
  };
  const handleSubmit = () => {
    if (!text.trim()) return;

    onAdd(text);

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
        className="flex-1 px-4 py-2 text-[15px] bg-white border border-gray-200 rounded-lg outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      />
      <button
        onClick={() => {
          onAdd('TEST TODO : ' + ++v);
        }}
        className="px-6 py-2 text-[15px] font-medium text-white bg-blue-500 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-all shadow-sm hover:shadow-md disabled:shadow-none"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      >
        Test
      </button>
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        className="px-6 py-2 text-[15px] font-medium text-white bg-blue-500 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-all shadow-sm hover:shadow-md disabled:shadow-none"
        style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}
      >
        Add
      </button>
    </div>
  );
}
