// Auth in development: the Fake under `pnpm dev`, and never in a production build.
export {
  type Backend,
  backendsOf,
  carryingFake,
  FAKE_AUTH,
  isFakeAuth,
  noFakeAuth,
} from './dev-auth.ts';
