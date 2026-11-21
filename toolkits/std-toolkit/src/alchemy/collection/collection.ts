import * as Provider from 'alchemy/Provider';

/** The collection every std-toolkit resource type is registered in. */
export class Providers extends Provider.ProviderCollection<Providers>()(
  'StdToolkit',
) {}
