import type { Brand } from './brand.js';
import type { CollectionName } from './collection-name.js';

export type HandlerName = string & Brand<'HandlerName'>;

export const collectionHandlerName = (name: CollectionName): HandlerName =>
  `collection:${name}` as HandlerName;

export const actionHandlerName = (actionName: string): HandlerName =>
  `action:${actionName}` as HandlerName;
