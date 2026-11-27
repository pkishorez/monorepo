import { Data } from 'effect';
import type { Out as Contract } from '../contract/index.js';

export type Out = Contract;

export const Out = Data.taggedEnum<Out>();
