import { Actor } from '@kestack/kabuki';
import { Plugin } from './children/actor-plugin/index.js';
import { Tunnel } from './children/actor-tunnel/index.js';
import {
  ConnectShape,
  init,
  pluginInputOf,
  pluginKeys,
  routesOf,
  updates,
  workers,
} from './logic/index.js';

export const Connect = ConnectShape.build({
  init,
  on: updates,
  workers,
  states: {
    SignedIn: {
      children: {
        tunnel: Actor.child(Tunnel, {
          input: ({ model }) => model.settings.tunnel,
          props: ({ model }) => ({ routes: routesOf(model) }),
          emits: {
            TunnelAddressChanged: ({ url, key }) => ({
              _tag: 'TunnelAddressChanged',
              url,
              key,
            }),
            TunnelFailed: ({ reason }) => ({ _tag: 'TunnelFailed', reason }),
          },
        }),
        plugins: Actor.child(Plugin, {
          each: ({ model }) => pluginKeys(model),
          input: ({ model }, key) => pluginInputOf(model, key),
        }),
      },
    },
  },
});
