import { create } from "zustand";
import type { StdDescriptor } from "./types";

interface StudioState {
  descriptors: StdDescriptor[];
  activeEntity: string | null;
  highlightedFields: Record<string, string | null>;

  setDescriptors: (descriptors: StdDescriptor[]) => void;
  setActiveEntity: (entityName: string | null) => void;
  setHighlightedField: (entityName: string, field: string | null) => void;
}

export const useStudioStore = create<StudioState>((set) => ({
  descriptors: [],
  activeEntity: null,
  highlightedFields: {},

  setDescriptors: (descriptors) => set({ descriptors }),

  setActiveEntity: (entityName) => set({ activeEntity: entityName }),

  setHighlightedField: (entityName, field) =>
    set((state) => ({
      highlightedFields: {
        ...state.highlightedFields,
        [entityName]: field,
      },
    })),
}));
