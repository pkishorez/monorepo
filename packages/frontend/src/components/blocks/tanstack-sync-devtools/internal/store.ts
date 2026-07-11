import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const DEFAULT_HEIGHT = 380;
const DEFAULT_SPLIT: [number, number] = [32, 68];
const MIN_HEIGHT = 200;

type DevtoolsState = {
  open: boolean;
  height: number;
  selectedCollectionId: string | null;
  masterDetailSplit: [number, number];
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setHeight: (height: number) => void;
  setSelectedCollectionId: (id: string | null) => void;
  setMasterDetailSplit: (sizes: [number, number]) => void;
};

type PersistedDevtoolsState = Pick<
  DevtoolsState,
  'open' | 'height' | 'selectedCollectionId' | 'masterDetailSplit'
>;

function safeMerge(persisted: unknown, current: DevtoolsState): DevtoolsState {
  const p = (persisted ?? {}) as Partial<PersistedDevtoolsState>;

  const split = p.masterDetailSplit;
  const validSplit: [number, number] =
    Array.isArray(split) &&
    split.length === 2 &&
    typeof split[0] === 'number' &&
    typeof split[1] === 'number'
      ? [split[0], split[1]]
      : DEFAULT_SPLIT;

  const height = p.height;
  const validHeight =
    typeof height === 'number' && height >= MIN_HEIGHT
      ? height
      : DEFAULT_HEIGHT;

  return {
    ...current,
    open: typeof p.open === 'boolean' ? p.open : current.open,
    height: validHeight,
    selectedCollectionId:
      typeof p.selectedCollectionId === 'string' ||
      p.selectedCollectionId === null
        ? (p.selectedCollectionId ?? null)
        : current.selectedCollectionId,
    masterDetailSplit: validSplit,
  };
}

export const useDevtoolsStore = create<DevtoolsState>()(
  persist(
    (set) => ({
      open: false,
      height: DEFAULT_HEIGHT,
      selectedCollectionId: null,
      masterDetailSplit: DEFAULT_SPLIT,
      setOpen: (open) => set({ open }),
      toggleOpen: () => set((s) => ({ open: !s.open })),
      setHeight: (height) => set({ height }),
      setSelectedCollectionId: (id) => set({ selectedCollectionId: id }),
      setMasterDetailSplit: (sizes) => set({ masterDetailSplit: sizes }),
    }),
    {
      name: 'devtools-overlay',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        open: s.open,
        height: s.height,
        selectedCollectionId: s.selectedCollectionId,
        masterDetailSplit: s.masterDetailSplit,
      }),
      merge: (persisted, current) => safeMerge(persisted, current),
    },
  ),
);
