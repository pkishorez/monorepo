export abstract class Source<T = any> {
  abstract set: (key: string, value: T) => Promise<void>;
  abstract get: (key: string) => Promise<T | undefined>;
  abstract getAll: () => Promise<T[]>;
}
