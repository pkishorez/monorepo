import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useRouter } from '@kestack/kabuki/routing';
import { MenuIcon } from '@kestack/web-platform/components/lucide';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@kestack/web-platform/components/sheet';
import { TOOLKITS } from '../../shared/index.ts';
import type { Route } from '../../shared/index.ts';
import { KabukiBrand } from './brand.tsx';
import { Sidebar } from './sidebar.tsx';
import { label, navRow } from './styles.ts';
import { ToolkitLink, inToolkit } from './toolkit-link.tsx';

/*
 * The menu below the `lg` width, a sheet from the left: inside kabuki, its
 * sidebar under its name; on the stack's home, the toolkits. Following any
 * link in it closes it.
 */

export function MobileNav() {
  const { route } = useRouter<Route>();
  const kabuki = inToolkit(route, 'kabuki');
  const [open, setOpen] = useState(false);
  const closeOnLink = (event: MouseEvent) => {
    if ((event.target as Element).closest('a')) setOpen(false);
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open the menu"
        className="-ml-1.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <MenuIcon className="size-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-80 gap-0 p-0">
        <SheetTitle className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5 text-[15px] font-semibold tracking-tight">
          {kabuki ? (
            <span onClick={() => setOpen(false)}>
              <KabukiBrand />
            </span>
          ) : (
            'Menu'
          )}
        </SheetTitle>
        <div
          onClick={closeOnLink}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6"
        >
          {kabuki ? (
            <Sidebar />
          ) : (
            <section className="-mx-2 space-y-1.5">
              <h2 className={`${label} px-2`}>Toolkits</h2>
              <ul className="space-y-px">
                {TOOLKITS.map((toolkit) => (
                  <li key={toolkit.id}>
                    <ToolkitLink id={toolkit.id} className={navRow}>
                      {toolkit.name}
                    </ToolkitLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
