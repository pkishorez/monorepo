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
      <DropdownMenuContent
        align="start"
        className="max-h-[70dvh] w-56 overflow-y-auto"
      >
        <DropdownMenuItem render={<Link to="/" />}>
          <ArrowLeft /> All demos
        </DropdownMenuItem>
        {demosByGroup().map(({ group, demos }) => (
          <Fragment key={group}>
            <DropdownMenuSeparator />
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
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
