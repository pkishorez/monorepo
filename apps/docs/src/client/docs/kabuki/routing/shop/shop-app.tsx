import type { ReactNode } from 'react';
import { View } from '@kestack/kabuki/react';
import { Router, useRouter } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/ui/components/button';
import { Spinner } from '@kestack/web-platform/ui/components/spinner';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { loading } from './loaders.ts';
import {
  ProductLive,
  ProductsLive,
  ShopLive,
  ThanksLive,
  router,
} from './shop.ts';
import type { Route } from './shop.ts';

/*
 * The shop's Views. The window's address never changes, so the shop draws
 * its own bar: Back, Forward, the page's title and its URL, and under it
 * the Route the Router holds, written as code makes it.
 */

/** A Route as code makes it: `router.Products.Product({ id: 2 })`. */
const written = (route: Route) => {
  const names: Array<string> = [];
  const params: Array<string> = [];
  let level: Readonly<Record<string, unknown>> | undefined = route;
  while (level) {
    names.push(String(level['_tag']));
    for (const [key, value] of Object.entries(level))
      if (key !== '_tag' && key !== 'page')
        params.push(`${key}: ${JSON.stringify(value)}`);
    level = level['page'] as typeof level;
  }
  return `router.${names.join('.')}(${params.length ? `{ ${params.join(', ')} }` : ''})`;
};

function Bar() {
  const { href, title, pending, canGoBack, canGoForward, back, forward } =
    useRouter<Route>();
  return (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Back"
        disabled={!canGoBack}
        onClick={back}
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Forward"
        disabled={!canGoForward}
        onClick={forward}
      >
        <ArrowRightIcon />
      </Button>
      <p className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-md bg-muted px-2.5 py-1 text-xs">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate font-mono text-muted-foreground">
          {pending ? `→ ${router.path(pending.to)}` : href}
        </span>
        {pending && <Spinner className="ml-auto size-3 shrink-0" />}
      </p>
    </div>
  );
}

function Shown() {
  const { route } = useRouter<Route>();
  return (
    <p className="truncate border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
      {written(route)}
    </p>
  );
}

const ProductView = View.make(ProductLive, ({ props, send, root }) => {
  const { status } = props;
  switch (status._tag) {
    case 'Loading':
      return (
        <div
          {...root}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner /> Loading product {props.params.id}…
        </div>
      );
    case 'Failed':
      return (
        <div {...root} role="alert" className="space-y-2 text-sm">
          <p className="font-medium">
            {status.notFound ? 'Not found' : 'Its Loader broke'}
          </p>
          <p className="text-muted-foreground">
            {status.notFound
              ? `Product ${props.params.id} is gone.`
              : status.reason}
          </p>
          {!status.notFound && (
            <Router.Retry className="text-sm underline underline-offset-4">
              Retry
            </Router.Retry>
          )}
        </div>
      );
    case 'Ready':
      return (
        <div {...root} className="space-y-3">
          <div>
            <p className="text-lg font-semibold">{status.data.name}</p>
            <p className="text-sm text-muted-foreground">
              ${status.data.price}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {status.info.from === 'cache'
              ? 'From the Data cache'
              : `Loaded in ${status.info.took ?? 0} ms`}
            {status.refreshing && ' · loading again…'}
          </p>
          <Button size="sm" onClick={() => send({ _tag: 'Bought' })}>
            Buy
          </Button>
        </div>
      );
  }
});

/** What each product shows the reader, beside its name. */
const NOTES: Record<number, string> = {
  1: '0.1 s',
  2: '0.8 s',
  3: '2 s, never preloads',
  4: 'breaks once',
  5: 'taken down',
};

function Item({
  id,
  children,
}: {
  readonly id: number;
  readonly children: ReactNode;
}) {
  const { route } = useRouter<Route>();
  const open =
    route._tag === 'Products' &&
    route.page?._tag === 'Product' &&
    route.page.id === id;
  return (
    <Router.Link
      to={router.Products.Product({ id })}
      preload={id === 3 || id === 4 ? false : 'intent'}
      aria-current={open ? 'page' : undefined}
      className="flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-sm transition-colors duration-150 hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:font-medium"
    >
      {children}
      <span className="text-[11px] font-normal text-muted-foreground">
        {NOTES[id]}
      </span>
    </Router.Link>
  );
}

const ProductsView = View.make(ProductsLive, ({ props, children, root }) => (
  <div {...root} className="grid min-h-0 flex-1 grid-cols-[11rem_1fr]">
    <nav aria-label="Products" className="border-r border-border p-1.5">
      {props.status._tag === 'Ready' &&
        props.status.data.items.map((item) => (
          <Item key={item.id} id={item.id}>
            {item.name}
          </Item>
        ))}
    </nav>
    <div className="p-4">
      {children.Product ? (
        <ProductView instance={children.Product} />
      ) : (
        <p className="text-sm text-muted-foreground">Pick a product.</p>
      )}
    </div>
  </div>
));

const ThanksView = View.make(ThanksLive, ({ root }) => (
  <div {...root} className="flex-1 space-y-2 p-4">
    <p className="text-lg font-semibold">Thank you!</p>
    <p className="text-sm text-muted-foreground">
      Your order is in. Back skips the product: Buy replaced it.
    </p>
    <Router.Link
      to={router.Products()}
      className="text-sm underline underline-offset-4"
    >
      Keep shopping
    </Router.Link>
  </div>
));

const ShopView = View.make(ShopLive, ({ children, props, root }) => (
  <div
    {...root}
    className="flex h-60 w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-background"
  >
    <Bar />
    {children.Products && <ProductsView instance={children.Products} />}
    {children.Thanks && <ThanksView instance={children.Thanks} />}
    {props.route.notFound !== null && (
      <p className="flex-1 p-4 text-sm">Nothing at {props.route.notFound}.</p>
    )}
    <Shown />
  </div>
));

// The Router above the shop. With no Adapter in the Layer it routes in
// memory and never reads or touches the address. It would start at its
// root, which names no page here, so it starts at the products.
const Routed = Router.view(router, ShopView);

export const ShopApp = View.app(Routed, {
  name: 'docs:routing',
  layer: loading,
  input: () => Routed.startAt('/products'),
});
