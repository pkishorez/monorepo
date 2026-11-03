import { Router } from '@kestack/kabuki/routing';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@kestack/web-platform/ui/components/dropdown-menu';
import { CheckIcon, ChevronsUpDownIcon, HouseIcon } from 'lucide-react';
import { packageOf, router, shelved } from '../../shared/index.ts';
import type { Package } from '../../shared/index.ts';
import { PackageMark } from './brand.tsx';
import { packageRoute } from './package-link.tsx';

/*
 * Which package's docs these are, and the way to any other: a button with
 * the package's mark, name and kind, that opens a menu of every package,
 * shelf by shelf (libraries, and apps when there are some), each to its
 * landing page. First in the menu, the way back to the stack's home.
 */

const focus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function PackageSwitcher({ id }: { readonly id: Package['id'] }) {
  const current = packageOf(id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${current.name} docs: switch package`}
        className={`group flex h-12 w-full items-center gap-2.5 rounded-lg border border-border bg-card/60 px-2.5 text-left transition-colors duration-150 hover:bg-muted/60 data-popup-open:bg-muted/60 pointer-coarse:h-14 ${focus}`}
      >
        <PackageMark id={id} className="size-7" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-5 font-semibold tracking-tight">
            {current.name}
          </span>
          <span className="block truncate text-[12px] leading-4 text-muted-foreground">
            {current.kind}
          </span>
        </span>
        <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-(--anchor-width) min-w-64 p-1.5">
        <DropdownMenuItem
          render={<Router.Link to={router.Home()} />}
          className="gap-2.5 py-2"
        >
          <HouseIcon className="size-4 text-muted-foreground" />
          ke stack
        </DropdownMenuItem>
        {shelved().map((shelf) => (
          <DropdownMenuGroup key={shelf.id}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{shelf.title}</DropdownMenuLabel>
            {shelf.packages.map((entry) => (
              <DropdownMenuItem
                key={entry.id}
                render={<Router.Link to={packageRoute(entry.id)} />}
                className="items-start gap-2.5 py-2"
              >
                <PackageMark id={entry.id} className="mt-0.5 size-6" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-medium">
                    {entry.name}
                  </span>
                  <span className="block text-[12px] leading-4 text-pretty text-muted-foreground">
                    {entry.pitch}
                  </span>
                </span>
                {entry.id === id && (
                  <CheckIcon
                    aria-label="Current"
                    className="mt-0.5 size-4 text-foreground"
                  />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
