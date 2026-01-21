export type SafePick<T, K extends keyof T> = {
  [P in K]: T[P];
};
