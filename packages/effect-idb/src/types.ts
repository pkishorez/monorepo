export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;
