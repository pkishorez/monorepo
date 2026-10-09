import { Context, Effect, Layer, Queue, Schema, Stream } from 'effect';

/*
 * How a parent tells a Query what to do. Effect Oak has no way for a parent
 * to send its Child a Message, so the app's Layer holds a mailbox per Query:
 * the parent's Command posts an Order, the Query's Lifetime hears it and
 * sends it to its own Node. Orders posted before the Query listens wait in
 * its mailbox. Both the parent's Message and the Query's are in the Log.
 */

export const Order = Schema.TaggedUnion({
  /** Load the key if nothing is cached, or the last try failed. */
  LoadIfMissing: { key: Schema.String },
  /** Load the key again, keeping what is cached on screen. */
  Refresh: { key: Schema.String },
  /** Load the key again only if something is cached. */
  Revalidate: { key: Schema.String },
});
type Order = typeof Order.Type;

export class Orders extends Context.Service<
  Orders,
  {
    readonly tell: (query: string, order: Order) => Effect.Effect<void>;
    readonly heard: (query: string) => Stream.Stream<Order>;
  }
>()('docs/api-cache-query/Orders') {}

type Mailbox = {
  readonly waiting: Array<Order>;
  listener?: (order: Order) => void;
};

export const OrdersLive = Layer.sync(Orders, () => {
  const mailboxes = new Map<string, Mailbox>();
  const mailbox = (query: string) => {
    let box = mailboxes.get(query);
    if (!box) mailboxes.set(query, (box = { waiting: [] }));
    return box;
  };
  return {
    tell: (query, order) =>
      Effect.sync(() => {
        const box = mailbox(query);
        if (box.listener) box.listener(order);
        else box.waiting.push(order);
      }),
    heard: (query) =>
      Stream.callback<Order>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const box = mailbox(query);
            box.listener = (order) => Queue.offerUnsafe(queue, order);
            for (const order of box.waiting.splice(0)) box.listener(order);
            return box;
          }),
          (box) => Effect.sync(() => delete box.listener),
        ),
      ),
  };
});
