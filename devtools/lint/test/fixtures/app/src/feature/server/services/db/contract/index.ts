import { Context } from 'effect';
export class Db extends Context.Service<Db, { readonly rows: number }>()('Feature/server/Db') {}
