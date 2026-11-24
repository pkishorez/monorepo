import { Data } from 'effect';
import { Context } from 'effect';
export interface StoreService { readonly get: () => string }
export type Key = string;
export class Store extends Context.Service<Store, StoreService>()('Feature/service/Store') {}
export class Oops {} // ✗ contract
export class StoreMissing extends Data.TaggedError('StoreMissing')<{ readonly key: string }> {}
export const limit = 3; // ✗ contract
export * from './more.ts';
export * from '../real/index.ts'; // ✗ door, contract
