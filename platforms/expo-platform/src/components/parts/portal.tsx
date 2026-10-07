import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { ModalIsolationStore } from './modal-isolation-store';
import { captureFocusRestore, FocusRestorationStore } from './focus-restoration-store';

type PortalMap = ReadonlyMap<string, ReactNode>;

class PortalStore {
  private portals = new Map<string, ReactNode>();
  private snapshot: PortalMap = this.portals;
  private listeners = new Set<() => void>();

  mount = (key: string, node: ReactNode) => {
    this.portals.set(key, node);
    this.emit();
  };

  unmount = (key: string) => {
    this.portals.delete(key);
    this.emit();
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): PortalMap => this.snapshot;

  private emit() {
    this.snapshot = new Map(this.portals);
    this.listeners.forEach((listener) => listener());
  }
}

const PortalContext = createContext<PortalStore | null>(null);
const ModalIsolationContext = createContext<ModalIsolationStore | null>(null);
const FocusRestorationContext = createContext<FocusRestorationStore | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const portalStoreRef = useRef<PortalStore | null>(null);
  const modalStoreRef = useRef<ModalIsolationStore | null>(null);
  const focusStoreRef = useRef<FocusRestorationStore | null>(null);
  portalStoreRef.current ??= new PortalStore();
  modalStoreRef.current ??= new ModalIsolationStore();
  focusStoreRef.current ??= new FocusRestorationStore();
  return (
    <PortalContext.Provider value={portalStoreRef.current}>
      <ModalIsolationContext.Provider value={modalStoreRef.current}>
        <FocusRestorationContext.Provider value={focusStoreRef.current}>
          {children}
        </FocusRestorationContext.Provider>
      </ModalIsolationContext.Provider>
    </PortalContext.Provider>
  );
}

function usePortalStore(component: string): PortalStore {
  const store = useContext(PortalContext);
  if (!store) {
    throw new Error(`${component} must be used within a <PanelUIProvider>`);
  }
  return store;
}

/** Renders children into the nearest PortalHost (above everything else). */
export function Portal({ children }: { children: ReactNode }) {
  const store = usePortalStore('Portal');
  const key = useId();

  /*
   * Two effects, because they answer to different things.
   *
   * `children` is a new element on every render of whatever owns the portal,
   * so an effect that both mounted and unmounted on it ran `unmount` then
   * `mount` for every one of those renders — deleting the key from the store
   * and putting it straight back, twice through `emit`, twice through a new
   * Map, and a full re-render of the host each time. An open sheet re-rendering
   * as its content changes paid that on every frame it changed on.
   *
   * Split, the update is an update and the teardown happens once, when the
   * portal actually goes away.
   */
  useEffect(() => {
    store.mount(key, children);
  }, [store, key, children]);

  useEffect(() => () => store.unmount(key), [store, key]);

  return null;
}

/** A portal that owns modal focus until it unmounts. */
export function ModalPortal({ children }: { children: ReactNode }) {
  const store = useModalIsolationStore('ModalPortal');
  const focusStore = useFocusRestorationStore('ModalPortal');
  const owner = useId();

  useEffect(() => {
    const releaseIsolation = store.acquire(owner);
    const releaseFocus = focusStore.acquire(owner, captureFocusRestore());
    return () => {
      releaseIsolation();
      releaseFocus();
    };
  }, [focusStore, owner, store]);

  return <Portal>{children}</Portal>;
}

/** A non-isolating portal that returns browser focus to what opened it. */
export function FocusRestorePortal({ children }: { children: ReactNode }) {
  const store = useFocusRestorationStore('FocusRestorePortal');
  const owner = useId();

  useEffect(() => store.acquire(owner, captureFocusRestore()), [owner, store]);

  return <Portal>{children}</Portal>;
}

/** Whether any modal portal currently owns focus. */
export function useModalIsolationActive(): boolean {
  const store = useModalIsolationStore('useModalIsolationActive');
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}

function useModalIsolationStore(component: string): ModalIsolationStore {
  const store = useContext(ModalIsolationContext);
  if (!store) {
    throw new Error(`${component} must be used within a <PanelUIProvider>`);
  }
  return store;
}

function useFocusRestorationStore(component: string): FocusRestorationStore {
  const store = useContext(FocusRestorationContext);
  if (!store) {
    throw new Error(`${component} must be used within a <PanelUIProvider>`);
  }
  return store;
}

/** Mount point for portaled content. PanelUIProvider renders one automatically. */
export function PortalHost() {
  const store = usePortalStore('PortalHost');
  const portals = useSyncExternalStore(store.subscribe, store.getSnapshot);

  return (
    <>
      {Array.from(portals.entries(), ([key, node]) => (
        <PortalFragment key={key}>{node}</PortalFragment>
      ))}
    </>
  );
}

function PortalFragment({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
