const BACKSPACE = '\x7f';

interface DPadProps {
  onKey: (data: string) => void;
  onKeyboardOpen: () => void;
  onRowsUp: () => void;
  onRowsDown: () => void;
  rows: number;
  cols: number;
}

const ARROW_UP = '\x1b[A';
const ARROW_DOWN = '\x1b[B';
const ARROW_RIGHT = '\x1b[C';
const ARROW_LEFT = '\x1b[D';
const ENTER = '\r';
const PAGE_UP = '\x1b[5~';
const PAGE_DOWN = '\x1b[6~';

function PadButton({
  onClick,
  children,
  className = '',
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 active:bg-zinc-600 active:text-zinc-100 transition-colors select-none ${className}`}
    >
      {children}
    </button>
  );
}

function ArrowIcon({
  direction,
}: {
  direction: 'up' | 'down' | 'left' | 'right';
}) {
  const rotations = { up: '0', right: '90', down: '180', left: '270' };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotations[direction]}deg)` }}
    >
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function ActionButton({
  onClick,
  children,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-xl bg-zinc-800/60 px-3 py-2 text-zinc-400 active:bg-zinc-700 active:text-zinc-200 transition-colors select-none"
    >
      {children}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

export function DPad({
  onKey,
  onKeyboardOpen,
  onRowsUp,
  onRowsDown,
  rows,
  cols,
}: DPadProps) {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex flex-col items-center gap-2">
        <ActionButton onClick={() => onKey(BACKSPACE)} label="Bksp">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            <path d="M21 5H7l-4 7 4 7h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z" />
          </svg>
        </ActionButton>
        <ActionButton onClick={onRowsUp} label="Row+">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </ActionButton>
        <ActionButton onClick={onRowsDown} label="Row-">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
          </svg>
        </ActionButton>
        <span className="text-[10px] font-mono text-zinc-500">
          {rows}x{cols}
        </span>
      </div>

      <div
        className="grid grid-cols-3 grid-rows-3 gap-1.5"
        style={{ width: 168, height: 168 }}
      >
        <div />
        <PadButton
          onClick={() => onKey(ARROW_UP)}
          className="h-[52px] w-[52px]"
        >
          <ArrowIcon direction="up" />
        </PadButton>
        <div />

        <PadButton
          onClick={() => onKey(ARROW_LEFT)}
          className="h-[52px] w-[52px]"
        >
          <ArrowIcon direction="left" />
        </PadButton>
        <PadButton
          onClick={() => onKey(ENTER)}
          className="h-[52px] w-[52px] bg-zinc-700 text-base font-bold text-zinc-200"
        >
          ↵
        </PadButton>
        <PadButton
          onClick={() => onKey(ARROW_RIGHT)}
          className="h-[52px] w-[52px]"
        >
          <ArrowIcon direction="right" />
        </PadButton>

        <div />
        <PadButton
          onClick={() => onKey(ARROW_DOWN)}
          className="h-[52px] w-[52px]"
        >
          <ArrowIcon direction="down" />
        </PadButton>
        <div />
      </div>

      <div className="flex flex-col gap-2">
        <ActionButton onClick={onKeyboardOpen} label="Type">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M6 12h.001M10 12h.001M14 12h.001M18 12h.001M8 16h8" />
          </svg>
        </ActionButton>
        <ActionButton onClick={() => onKey(PAGE_UP)} label="Pg Up">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m17 11-5-5-5 5" />
            <path d="m17 18-5-5-5 5" />
          </svg>
        </ActionButton>
        <ActionButton onClick={() => onKey(PAGE_DOWN)} label="Pg Dn">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m7 6 5 5 5-5" />
            <path d="m7 13 5 5 5-5" />
          </svg>
        </ActionButton>
      </div>
    </div>
  );
}
