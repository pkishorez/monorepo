export type Connectivity = {
  readonly isOnline: () => boolean;
  readonly subscribe: (listener: () => void) => () => void;
};

export const alwaysOnline: Connectivity = {
  isOnline: () => true,
  subscribe: () => () => undefined,
};
