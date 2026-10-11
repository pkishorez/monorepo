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
export const GROUPS = ['Concepts', 'Apps'] as const;

/** Every demo, in the order the home page lists them within its group. */
export const DEMOS = [
  {
    to: '/demos/concepts/actor',
    name: '1. Actor',
    group: 'Concepts',
    summary: 'Model, Message, Update: a Counter as one Circle',
  },
  {
    to: '/demos/concepts/states',
    name: '2. States',
    group: 'Concepts',
    summary: 'State, Transition, State data: a Door with Slots',
  },
  {
    to: '/demos/concepts/children',
    name: '3. Children',
    group: 'Concepts',
    summary: 'A fixed Child Invoked by a State: a Room with a Counter in it',
  },
  {
    to: '/demos/concepts/keyed-children',
    name: '4. Keyed Children',
    group: 'Concepts',
    summary: 'Keyed Children, Input, Actor.many: a Scoreboard of Players',
  },
  {
    to: '/demos/concepts/commands',
    name: '5. Commands',
    group: 'Concepts',
    summary: 'Command: a Dice whose roll runs on a Path to the Edge',
  },
  {
    to: '/demos/concepts/workers',
    name: '6. Workers',
    group: 'Concepts',
    summary: 'Worker, its four Conditions and a Finalizer: a Clock with Rings',
  },
  {
    to: '/demos/concepts/capabilities',
    name: '7. Capabilities',
    group: 'Concepts',
    summary: 'Requires, Provides, Request: a Board and its Scorers on a Band',
  },
  {
    to: '/demos/apps/rockets',
    name: 'Rockets',
    group: 'Apps',
    summary: 'A Rocket, its States and Workers, a Fleet, and its Capabilities',
  },
  {
    to: '/demos/apps/showreel',
    name: 'Showreel',
    group: 'Apps',
    summary: 'The storyboard for the Effect Oak Walkthrough, scene by scene',
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
