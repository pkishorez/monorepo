import { useEffect, useMemo, useState } from 'react';
import CodeMirror, { EditorView, Prec } from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { xcodeDark, xcodeLight } from '@uiw/codemirror-theme-xcode';
import { cn } from '#lib/utils';

export type JsonEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
};

const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent', fontSize: '13px' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '.cm-content': { lineHeight: '1.7' },
  '.cm-line': { lineHeight: '1.7' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { overflow: 'auto' },
});

function readDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return getComputedStyle(document.body).colorScheme === 'dark';
}

function useDarkMode(): boolean {
  const [dark, setDark] = useState(readDarkMode);

  useEffect(() => {
    const update = () => setDark(readDarkMode());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme', 'style'],
    });
    update();
    return () => observer.disconnect();
  }, []);

  return dark;
}

/** Controlled JSON editor backed by CodeMirror. */
export function JsonEditor({
  value,
  onChange,
  readOnly,
  placeholder,
  className,
  minHeight,
  maxHeight,
}: JsonEditorProps) {
  const dark = useDarkMode();
  const isReadOnly = readOnly ?? onChange == null;
  const extensions = useMemo(
    () => [json(), EditorView.lineWrapping, Prec.highest(baseTheme)],
    [],
  );
  const fill = minHeight == null && maxHeight == null;

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      readOnly={isReadOnly}
      editable={!isReadOnly}
      theme={dark ? xcodeDark : xcodeLight}
      placeholder={placeholder}
      extensions={extensions}
      height={fill ? '100%' : undefined}
      minHeight={minHeight}
      maxHeight={maxHeight}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: !isReadOnly,
        highlightActiveLineGutter: false,
      }}
      className={cn(
        'border-border overflow-hidden rounded-md border bg-transparent',
        className,
      )}
    />
  );
}
