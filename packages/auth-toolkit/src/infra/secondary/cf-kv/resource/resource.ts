import * as Cloudflare from 'alchemy/Cloudflare';

interface KvSessionStoreProps {
  title?: string;
}

export const kvSessionStoreResource = (
  id: string,
  props: KvSessionStoreProps = {},
) => Cloudflare.KV.Namespace(id, props.title ? { title: props.title } : {});
