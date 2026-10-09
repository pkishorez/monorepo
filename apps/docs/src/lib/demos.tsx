import { Link } from '@tanstack/react-router';
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

/** Every demo, in the order the home page lists them. */
export const DEMOS = [
  {
    to: '/demos/effect-oak',
    name: 'Road',
    summary: 'Effect Oak: a Node drawn at every frame, with time travel',
  },
] as const;

type DemoPath = (typeof DEMOS)[number]['to'];

/** The current demo's name, opening a menu to go home or to another demo. */
export const DemoMenu = ({ current }: { readonly current: DemoPath }) => {
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
          <ArrowLeft /> All demos
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Demos</DropdownMenuLabel>
          {DEMOS.map((demo) => (
            <DropdownMenuItem key={demo.to} render={<Link to={demo.to} />}>
              <span className="flex-1">{demo.name}</span>
              {demo.to === current && <Check />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
