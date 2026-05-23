import { useState, useCallback } from 'react';
import { DPad } from './d-pad';
import { KeyboardDialog } from './keyboard-dialog';

interface MobileControlsProps {
  onInput: (data: string) => void;
  onRowsUp: () => void;
  onRowsDown: () => void;
  rows: number;
  cols: number;
}

export function MobileControls({
  onInput,
  onRowsUp,
  onRowsDown,
  rows,
  cols,
}: MobileControlsProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [text, setText] = useState('');

  const handleSubmit = useCallback(() => {
    if (text.length === 0) return;
    onInput(text + '\r');
    setText('');
    setKeyboardOpen(false);
  }, [text, onInput]);

  const handleInsert = useCallback(() => {
    if (text.length === 0) return;
    onInput(text);
    setText('');
    setKeyboardOpen(false);
  }, [text, onInput]);

  return (
    <>
      {!keyboardOpen && (
        <div className="z-10 flex items-center justify-center px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 bg-[#09090b] border-t border-zinc-800/50">
          <DPad
            onKey={onInput}
            onKeyboardOpen={() => setKeyboardOpen(true)}
            onRowsUp={onRowsUp}
            onRowsDown={onRowsDown}
            rows={rows}
            cols={cols}
          />
        </div>
      )}
      <KeyboardDialog
        open={keyboardOpen}
        value={text}
        onChange={setText}
        onSubmit={handleSubmit}
        onInsert={handleInsert}
        onClose={() => setKeyboardOpen(false)}
      />
    </>
  );
}
