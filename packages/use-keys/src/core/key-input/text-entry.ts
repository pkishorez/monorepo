// Inputs that take no typing: a key there is the page's, not the input's.
const NOT_TEXT: ReadonlySet<string> = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** Whether typing on `element` goes into it: a text input, a textarea, a select, or anything editable. */
export const isTextEntry = (
  element: Element | null,
): element is HTMLElement => {
  if (element === null) return false;
  if (element instanceof HTMLInputElement) return !NOT_TEXT.has(element.type);
  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }
  return (
    (element instanceof HTMLElement && element.isContentEditable) ||
    element.closest('[contenteditable]:not([contenteditable="false"])') !== null
  );
};
