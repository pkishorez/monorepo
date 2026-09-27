// Both panes scroll independently, so their rows must be kept level by hand:
// a wrapped line on one side is taller than its partner on the other.
export function equalizeRowHeights(
  left: HTMLElement,
  right: HTMLElement,
): void {
  const leftLines = left.querySelectorAll<HTMLElement>('.source-line');
  const rightLines = right.querySelectorAll<HTMLElement>('.source-line');
  const count = Math.min(leftLines.length, rightLines.length);

  for (let index = 0; index < count; index += 1) {
    (leftLines[index] as HTMLElement).style.minHeight = '';
    (rightLines[index] as HTMLElement).style.minHeight = '';
  }
  for (let index = 0; index < count; index += 1) {
    const leftLine = leftLines[index] as HTMLElement;
    const rightLine = rightLines[index] as HTMLElement;
    const height = Math.max(leftLine.offsetHeight, rightLine.offsetHeight);
    leftLine.style.minHeight = `${height}px`;
    rightLine.style.minHeight = `${height}px`;
  }
}

export function syncScroll(
  from: HTMLElement,
  to: HTMLElement,
  lock: { current: boolean },
): void {
  if (lock.current) {
    lock.current = false;
    return;
  }
  lock.current = true;
  to.scrollTop = from.scrollTop;
}

export function clearRowHeights(pane: HTMLElement): void {
  for (const line of pane.querySelectorAll<HTMLElement>('.source-line')) {
    line.style.minHeight = '';
  }
}
