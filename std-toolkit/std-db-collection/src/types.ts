export type BulkOp<T = any> =
  | {
      type: 'update' | 'insert' | 'delete' | 'upsert';
      value: T;
    }
  | {
      type: 'deleteKey';
      key: string;
    };
