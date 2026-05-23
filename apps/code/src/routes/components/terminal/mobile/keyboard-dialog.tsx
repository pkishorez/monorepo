import { useRef, useEffect, useCallback } from 'react';

interface KeyboardDialogProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onInsert: () => void;
  onClose: () => void;
}

export function KeyboardDialog({
  open,
  value,
  onChange,
  onSubmit,
  onInsert,
  onClose,
}: KeyboardDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.selectionStart = el.value.length;
        el.selectionEnd = el.value.length;
      }, 50);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center backdrop-blur-sm bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchEnd={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full p-3 pt-[max(env(safe-area-inset-top),12px)]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 font-mono text-base text-zinc-100 outline-none focus:border-zinc-500 field-sizing-content min-h-11 max-h-40 resize-none"
          placeholder="Type a command..."
          autoCapitalize="off"
          autoCorrect="off"
          autoFocus
          spellCheck={false}
          rows={1}
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={onInsert}
            className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 active:bg-zinc-700"
          >
            Insert
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-900 active:bg-zinc-300"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
