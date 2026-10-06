/** Tracks modal owners without unisolating the app while a nested modal remains. */
export class ModalIsolationStore {
  private owners = new Set<string>();
  private listeners = new Set<() => void>();

  acquire = (owner: string): (() => void) => {
    const wasActive = this.getSnapshot();
    this.owners.add(owner);
    if (this.getSnapshot() !== wasActive) this.emit();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const activeBeforeRelease = this.getSnapshot();
      this.owners.delete(owner);
      if (this.getSnapshot() !== activeBeforeRelease) this.emit();
    };
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): boolean => this.owners.size > 0;

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
