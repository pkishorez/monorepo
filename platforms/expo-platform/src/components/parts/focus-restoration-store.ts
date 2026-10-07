interface FocusDocument {
  activeElement?: FocusTarget | null;
  body?: FocusTarget | null;
  documentElement?: FocusTarget | null;
}

interface FocusTarget {
  disabled?: boolean;
  isConnected?: boolean;
  focus: (options?: { preventScroll?: boolean }) => void;
  getAttribute?: (name: string) => string | null;
}

type RestoreFocus = () => boolean;

interface FocusOwner {
  owner: string;
  released: boolean;
  restore: RestoreFocus;
}

/** Restores nested overlays in last-opened order, even when parents close first. */
export class FocusRestorationStore {
  private owners: FocusOwner[] = [];

  acquire(owner: string, restore: RestoreFocus): (() => void) {
    const entry = { owner, released: false, restore };
    this.owners.push(entry);

    return () => {
      if (entry.released) return;
      entry.released = true;
      this.restoreReleasedOwners();
    };
  }

  private restoreReleasedOwners() {
    const candidates: RestoreFocus[] = [];
    while (this.owners.at(-1)?.released) {
      const entry = this.owners.pop();
      if (entry) candidates.push(entry.restore);
    }
    candidates.some((restore) => restore());
  }
}

/** Captures the current browser focus without evaluating DOM APIs on native. */
export function captureFocusRestore(
  document = (globalThis as { document?: FocusDocument }).document
): RestoreFocus {
  const target = document?.activeElement;
  if (!target || target === document?.body || target === document?.documentElement) {
    return () => false;
  }

  return () => {
    if (target.isConnected === false || target.disabled) return false;
    if (target.getAttribute?.('aria-disabled') === 'true') return false;
    try {
      target.focus({ preventScroll: true });
    } catch {
      try {
        target.focus();
      } catch {
        return false;
      }
    }
    return document?.activeElement === target;
  };
}
