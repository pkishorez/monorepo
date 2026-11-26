import { Data } from 'effect';
import type * as Contract from '../contract/index.ts';

export type Out = Contract.Out;

export const Out = Data.taggedEnum<Out>();
