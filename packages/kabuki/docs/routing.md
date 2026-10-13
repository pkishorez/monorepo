# Routing

`@kestack/kabuki/routing` adds routing to a Kabuki app without changing how
an app is written: Routes are data, the Router is one Actor, and every page is
a plain Actor that is handed its Route as Props. Core never imports it.

## Four parts

```
Your Actors and Views        App, Settings, Billing …           plain Kabuki
outlet                       Routes.Settings.outlet({ … })      writes `children`, `invoke` and a View
Router + Adapter             Router.app(Routes, App)            holds where the app is; talks to the URL
Routes                       Route.tree({ … })                  pure data: Schemas, URL ⇄ Route, head
```

### Routes: every place, once

```ts
export const Routes = Route.tree(
  {
    Dashboard: Route.path('/', { head: { title: 'Dashboard' } }),
    Settings: Route.path(
      '/settings',
      { head: { title: 'Settings' } },
      {
        Overview: Route.path('/'),
        Billing: Route.path('/billing', { head: { title: 'Billing' } }),
      },
    ),
    Project: Route.path('/projects/:id', {
      params: { id: Schema.FiniteFromString },
      head: ({ id }) => ({ title: `Project ${id}` }),
    }),
  },
  { redirect: { '/account': (r) => r.Settings.Overview() } },
);
```

- `Routes.Settings.Billing()` is a Route value: `{ _tag: 'Settings', page: { _tag: 'Billing' } }`. Params are checked by type: `Routes.Project({ id: 4 })`.
- `Routes.read(url)` and `Routes.path(route)` turn a URL into a Route and back. A URL that names no place reads as `NotFound`; a malformed one too.
- `Routes.head(route or url)` is pure, so a server can call it.
- `Routes.Settings.props` is the Schema of what the Settings Actor is handed: its params and query, and `page`, the child that is current. `Routes.props` is the root's: `{ page }`, the whole Route.

### The Router: one Actor above the app

`Router.app(Routes, App)` is an Actor like any other. Its Model is the history,
`entries` and `at`, and the last `move`. Its one Child is your App, whose Props
are `{ page: entries[at].route }`. Every move is one Message to it:

| Message      | Sent by                                               |
| ------------ | ----------------------------------------------------- |
| `Pushed`     | a click on a `Router.Link`, or `Router.push`          |
| `Replaced`   | `Router.replace`                                      |
| `Went`       | `Router.back` and `Router.forward`, `useRouter`       |
| `WentBackTo` | `Router.backTo`                                       |
| `Arrived`    | the Adapter: Back, Forward, a typed URL, a fresh load |

It Provides `Navigation`, so a page that moves the app from an Update lists
`Navigation` in its Requires and returns `Router.push(route)` as a Command.

### The Adapter: where the address lives

With no Adapter in the Layer, the app routes in memory: Back and Forward are
`Went` Messages and the URL is never touched. That is the default, so a test
or a story runs the real router.

```ts
toReact(Root.actor, Root.view, Layer.mergeAll(AppLive, tanstack()), {
  input: Root.startAt,
});
```

With an Adapter, the Router writes each move to the address with a Command,
stamping each history entry with a key, and a Worker hears the address: a
Back lands on an entry the Router knows. A redirect, or a URL that is not how
its Route is written, is replaced. `startAt` reads the URL once, so the app is
drawn at the right page from the first frame.

Commands never run during Time Travel, so the address stays live: a past
Step is a drawing, and the move that led there is one Message on the Timeline.

### Outlets: the pages under a place

```ts
const sections = Routes.Settings.outlet({ Overview, Billing });

export const SettingsActor = Actor.make('Settings', { props: Routes.Settings.props })
  .build({ children: sections.children, invoke: sections.invoke });

export const SettingsView = View.make(SettingsActor, (self) => (
  <section>
    <Tabs />
    <sections.View of={self} />
  </section>
));
```

`outlet` writes nothing you could not write yourself:

- `children`: one keyed slot per child Route, `{ Overview: Actor.many(Overview.actor), … }`.
- `invoke`: from the Props' `page`, the current child's slot holds one Instance, keyed by its params, handed its value as Props; the others are empty. A new param is a fresh page; a new query is the same page with new Props.
- `View`: draws whichever Instance is there. A child served by a function instead of an Actor is drawn by it.

Kabuki works the rest out: when Settings' Props change, its keyed Children
follow them, in the same Message.

## One click, Overview to Billing

1. `Router.Link` drew `<a href="/settings/billing">`. The Router's View catches the plain click and Sends `Pushed`.
2. The Router's entries grow by one. The App's Props are now `{ page: Settings › Billing }`.
3. The App's outlet keeps Settings: its key did not change. Settings is handed `{ page: { _tag: 'Billing' } }`; its outlet stops Overview and starts Billing. Anything Settings runs keeps running.
4. With an Adapter, the `write the address` Command pushes `/settings/billing`.

## Guards

A guard is where an Actor sits. Put the pages' outlet in the State that
allows them, `SignedIn`, and they cannot exist without a user; the URL stays
what it is while the user signs in. A page for some users only is the same:
its slot is filled only when the Props or Model allow it.

## Animating pages

An outlet's View takes a function of the page and the move at its level, so
a page can be wrapped in an animation library's component:

```tsx
<AnimatePresence custom={move} mode="popLayout">
  <sections.View of={self}>
    {(page, move) =>
      page && (
        <motion.div
          key={page.key}
          custom={move}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {page.element}
        </motion.div>
      )
    }
  </sections.View>
</AnimatePresence>
```

A leaving page's Actor has already stopped; its View keeps drawing its last
data while it animates out.

## Head and search

The Routes' head is pure: a TanStack route can call `Routes.head(url)` in its
own `head`, and a server renders the title. A title that needs data is drawn
with `Router.Head` and written in the browser only, when an Adapter holds the
address. Loading a page's data on the server, for its title in search
results, is not built.

## Not built yet

- Blocking a move, as over unsaved changes.
- Scroll restoration per history entry.
- A server drawing the page the URL names: `toReact` makes one History per module, so a server cannot be handed each request's Route.
- One routed app per page: two Routers on one page would both write the address.
