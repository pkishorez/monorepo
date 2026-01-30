import { create } from "zustand";

interface UsersStore {
  recentlyUpdated: Set<string>;
  editingCell: { userId: string; field: string } | null;
  markUpdated: (userId: string) => void;
  clearUpdated: (userId: string) => void;
  setEditingCell: (cell: { userId: string; field: string } | null) => void;
}

export const useUsersStore = create<UsersStore>((set) => ({
  recentlyUpdated: new Set(),
  editingCell: null,
  markUpdated: (userId) => {
    set((state) => ({
      recentlyUpdated: new Set(state.recentlyUpdated).add(userId),
    }));
    setTimeout(() => {
      set((state) => {
        const next = new Set(state.recentlyUpdated);
        next.delete(userId);
        return { recentlyUpdated: next };
      });
    }, 1500);
  },
  clearUpdated: (userId) =>
    set((state) => {
      const next = new Set(state.recentlyUpdated);
      next.delete(userId);
      return { recentlyUpdated: next };
    }),
  setEditingCell: (cell) => set({ editingCell: cell }),
}));
