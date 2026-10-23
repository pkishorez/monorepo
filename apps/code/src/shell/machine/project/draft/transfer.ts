import { useEffect, useRef, useState } from 'react';

/*
 * Pasting or dropping anywhere on the page puts it in the Draft: files are
 * attached, and otherwise the text goes in at its cursor. A paste or drop
 * into another field, such as a Picker's search, stays that field's. Heard on
 * the document before any element, the Draft's own editor included, so
 * every paste and drop takes this one way in.
 */

const FIELD =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** Whether `target` is a field other than the Draft's own, which keeps what is pasted. */
const inOtherField = (target: EventTarget | null, own: Element | null) =>
  target instanceof Element &&
  target.closest(FIELD) !== null &&
  !(own?.contains(target) ?? false);

export function useTransfers({
  own,
  disabled,
  onText,
  onFiles,
}: {
  /** The Draft's own element: a paste in it is the Draft's. */
  readonly own: () => Element | null;
  readonly disabled: boolean;
  readonly onText: (text: string) => void;
  readonly onFiles: (files: ReadonlyArray<File>) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ own, disabled, onText, onFiles });
  latest.current = { own, disabled, onText, onFiles };

  useEffect(() => {
    // Hands what came over to the Draft; says whether it took any.
    const take = (data: DataTransfer | null) => {
      const { disabled, onText, onFiles } = latest.current;
      if (data === null || disabled) return false;
      const files = [...data.files];
      if (files.length > 0) {
        onFiles(files);
        return true;
      }
      const text = data.getData('text/plain');
      if (text === '') return false;
      onText(text);
      return true;
    };
    const paste = (event: ClipboardEvent) => {
      if (inOtherField(event.target, latest.current.own())) return;
      if (take(event.clipboardData)) event.preventDefault();
    };
    const carries = (event: DragEvent) =>
      !latest.current.disabled &&
      !inOtherField(event.target, latest.current.own()) &&
      (event.dataTransfer?.types.includes('Files') === true ||
        event.dataTransfer?.types.includes('text/plain') === true);
    const over = (event: DragEvent) => {
      if (!carries(event)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    };
    // Gone from the window: nothing is over the page now.
    const leave = (event: DragEvent) => {
      if (event.relatedTarget === null) setDragging(false);
    };
    const drop = (event: DragEvent) => {
      setDragging(false);
      if (!carries(event)) return;
      event.preventDefault();
      event.stopPropagation();
      take(event.dataTransfer);
    };
    const end = () => setDragging(false);
    document.addEventListener('paste', paste, true);
    document.addEventListener('dragover', over, true);
    document.addEventListener('dragleave', leave, true);
    document.addEventListener('drop', drop, true);
    document.addEventListener('dragend', end, true);
    return () => {
      document.removeEventListener('paste', paste, true);
      document.removeEventListener('dragover', over, true);
      document.removeEventListener('dragleave', leave, true);
      document.removeEventListener('drop', drop, true);
      document.removeEventListener('dragend', end, true);
    };
  }, []);

  return { dragging };
}
