export type SafePick<T, K extends keyof T> = {
  [P in K]: T[P];
};
export type SafeOmit<T, K extends keyof T> = {
  [P in Exclude<keyof T, K>]: T[P];
};
