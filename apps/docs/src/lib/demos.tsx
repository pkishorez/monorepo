import { Fragment } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { ArrowLeft, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@kstackz/web-platform/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kstackz/web-platform/components/dropdown-menu';

/** The groups demos are listed under, in order. */
export const GROUPS = [
  'Basics',
  'Commands and Lifetimes',
  'Graphics',
  'Data',
  'Apps',
  'Routing and host',
  'Large apps',
] as const;

/** Every demo, in the order the home page lists them within its group. */
export const DEMOS = [
  {
    to: '/demos/effect-oak/counter',
    name: 'Counter',
    group: 'Basics',
    summary: 'One Node, three Messages',
  },
  {
    to: '/demos/effect-oak/counters',
    name: 'Counters',
    group: 'Basics',
    summary: 'A list of counters you can add to and remove from',
  },
  {
    to: '/demos/effect-oak/stopwatch',
    name: 'Stopwatch',
    group: 'Basics',
    summary: 'Running time drawn at every Frame, with no ticks',
  },
  {
    to: '/demos/effect-oak/crash-view',
    name: 'Crash view',
    group: 'Basics',
    summary: 'What happens when an Update throws',
  },
  {
    to: '/demos/effect-oak/todo',
    name: 'Todo',
    group: 'Basics',
    summary: 'Todos kept in localStorage, with a composer Node',
  },
  {
    to: '/demos/effect-oak/weather',
    name: 'Weather',
    group: 'Commands and Lifetimes',
    summary: 'Weather for a zip code from a public API, through a Service',
  },
  {
    to: '/demos/effect-oak/interrupting-commands',
    name: 'Interrupting commands',
    group: 'Commands and Lifetimes',
    summary: 'Fake uploads you can cancel one at a time or all at once',
  },
  {
    to: '/demos/effect-oak/slow-warnings',
    name: 'Slow warnings',
    group: 'Commands and Lifetimes',
    summary: 'Slow Updates and Views, timed from the outside',
  },
  {
    to: '/demos/effect-oak/managed-resource-layer',
    name: 'Managed resource',
    group: 'Commands and Lifetimes',
    summary: 'An engine built from a Layer for as long as a State lasts',
  },
  {
    to: '/demos/effect-oak/form',
    name: 'Form',
    group: 'Commands and Lifetimes',
    summary: 'A waitlist form with field Nodes and an async email check',
  },
  {
    to: '/demos/effect-oak/websocket-chat',
    name: 'WebSocket chat',
    group: 'Commands and Lifetimes',
    summary: 'A chat with an echo server, held open by a Lifetime',
  },
  {
    to: '/demos/effect-oak/road',
    name: 'Road',
    group: 'Graphics',
    summary: 'A Node drawn as SVG at every Frame, with time travel',
  },
  {
    to: '/demos/effect-oak/canvas-art',
    name: 'Canvas art',
    group: 'Graphics',
    summary: 'Bouncing balls on a canvas, placed at every Frame',
  },
  {
    to: '/demos/effect-oak/snake',
    name: 'Snake',
    group: 'Graphics',
    summary: 'The classic game, one tick per step',
  },
  {
    to: '/demos/effect-oak/generative-art',
    name: 'Generative art',
    group: 'Graphics',
    summary: 'Particles in a flow field, stepped on at every Frame',
  },
  {
    to: '/demos/effect-oak/pixel-art',
    name: 'Pixel art',
    group: 'Graphics',
    summary: 'A pixel editor with undo, mirrors and PNG export',
  },
  {
    to: '/demos/effect-oak/api-cache',
    name: 'API cache',
    group: 'Data',
    summary: 'Cached posts and live stats, kept as data in the Model',
  },
  {
    to: '/demos/effect-oak/api-cache-query',
    name: 'API cache query',
    group: 'Data',
    summary: 'The same cache with each query as its own Node',
  },
  {
    to: '/demos/effect-oak/query-sync',
    name: 'Query sync',
    group: 'Data',
    summary: 'A dinosaur table whose filters live in the URL',
  },
  {
    to: '/demos/effect-oak/charting',
    name: 'Charting',
    group: 'Data',
    summary: 'npm and GitHub numbers for Foldkit, drawn as SVG charts',
  },
  {
    to: '/demos/effect-oak/map',
    name: 'Map',
    group: 'Data',
    summary: 'A tile map whose camera is a Node, with markers and fly-to',
  },
  {
    to: '/demos/effect-oak/shopping-cart',
    name: 'Shopping cart',
    group: 'Apps',
    summary: 'Products, cart and checkout as States of one shop Node',
  },
  {
    to: '/demos/effect-oak/kanban',
    name: 'Kanban',
    group: 'Apps',
    summary: 'A board whose cards you drag between columns',
  },
  {
    to: '/demos/effect-oak/auth',
    name: 'Auth',
    group: 'Apps',
    summary: 'Signed-out and signed-in sites, each a Child of its State',
  },
  {
    to: '/demos/effect-oak/state-machine',
    name: 'State machine',
    group: 'Apps',
    summary: 'A multi-step checkout written as one Node’s States',
  },
  {
    to: '/demos/effect-oak/routing',
    name: 'Routing',
    group: 'Routing and host',
    summary: 'Pages as States, with the path kept after the # in the URL',
  },
  {
    to: '/demos/effect-oak/route-transitions',
    name: 'Route transitions',
    group: 'Routing and host',
    summary: 'Work started on entering a page and on leaving one',
  },
  {
    to: '/demos/effect-oak/view-transitions',
    name: 'View transitions',
    group: 'Routing and host',
    summary:
      'Artworks that grow into their page with the browser’s View Transitions',
  },
  {
    to: '/demos/effect-oak/personal-blog',
    name: 'Personal blog',
    group: 'Routing and host',
    summary:
      'Posts written in a markdown subset, with a live counter inside one',
  },
  {
    to: '/demos/effect-oak/embedding',
    name: 'Embedding',
    group: 'Routing and host',
    summary: 'A widget mounted into a plain DOM page that talks to it',
  },
  {
    to: '/demos/effect-oak/web-components',
    name: 'Web components',
    group: 'Routing and host',
    summary: 'Two hand-made custom elements whose events become Messages',
  },
  {
    to: '/demos/effect-oak/job-application',
    name: 'Job application',
    group: 'Large apps',
    summary: 'A five-step form with entry lists and a live resume preview',
  },
  {
    to: '/demos/effect-oak/ui-showcase',
    name: 'UI showcase',
    group: 'Large apps',
    summary: 'Dialogs, menus, tabs, listboxes and more, each a Node',
  },
] as const satisfies ReadonlyArray<{
  readonly to: string;
  readonly name: string;
  readonly group: (typeof GROUPS)[number];
  readonly summary: string;
}>;

/** The demos in each group that has any, in the order of GROUPS. */
export const demosByGroup = () =>
  GROUPS.map((group) => ({
    group,
    demos: DEMOS.filter((demo) => demo.group === group),
  })).filter(({ demos }) => demos.length > 0);

/**
 * A demo route's head, from its entry in DEMOS: the name as the title, the
 * summary as the description. Use as `head: ({ match }) => demoHead(match.fullPath)`.
 */
export const demoHead = (path: string) => {
  const demo = DEMOS.find((d) => d.to === path);
  return {
    meta: [
      { title: `${demo?.name ?? 'Demo'} · Effect Oak` },
      { name: 'description', content: `Effect Oak: ${demo?.summary}.` },
    ],
    styles: [{ children: 'body { overflow: hidden; }' }],
  };
};

/** Every demo, by group, as menu items that open it; `current` is checked. */
const DemoItems = ({ current }: { readonly current?: string }) =>
  demosByGroup().map(({ group, demos }, index) => (
    <Fragment key={group}>
      {index > 0 && <DropdownMenuSeparator />}
      <DropdownMenuGroup>
        <DropdownMenuLabel>{group}</DropdownMenuLabel>
        {demos.map((demo) => (
          <DropdownMenuItem key={demo.to} render={<Link to={demo.to} />}>
            <span className="flex-1">{demo.name}</span>
            {demo.to === current && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </Fragment>
  ));

/** A Demos button opening every demo, for the home page. */
export const DemosDropdown = () => (
  <DropdownMenu>
    <DropdownMenuTrigger
      render={<Button size="sm" variant="outline" className="gap-1.5" />}
    >
      Demos
      <ChevronsUpDown className="text-muted-foreground" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DemoItems />
    </DropdownMenuContent>
  </DropdownMenu>
);

/** The current demo's name, opening a menu to go home or to another demo. */
export const DemoMenu = () => {
  const current = useLocation({ select: (location) => location.pathname });
  const name = DEMOS.find((demo) => demo.to === current)?.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button size="sm" variant="ghost" className="-ml-1 gap-1.5" />}
      >
        {name}
        <ChevronsUpDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem render={<Link to="/" />}>
          <ArrowLeft /> Home
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DemoItems current={current} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
