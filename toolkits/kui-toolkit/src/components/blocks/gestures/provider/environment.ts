import { useSyncExternalStore } from 'react';
import {
  createEnvironmentStore,
  type Environment,
  serverEnvironment,
} from '../../environment';

let environmentStore: ReturnType<typeof createEnvironmentStore> | undefined;
const store = () => (environmentStore ??= createEnvironmentStore(window));

/** The live Environment, the server's one until hydrated. */
export const useEnvironment = (): Environment =>
  useSyncExternalStore(
    (listener) => store().subscribe(listener),
    () => store().get(),
    () => serverEnvironment,
  );
