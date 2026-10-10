import { orders } from '../domain/orders/index.js';
import { internal } from '../domain/orders/internal.js';
import { infra } from '../infra/index.js';

export const app = { orders, internal, infra };
