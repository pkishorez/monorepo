import { useEffect, useState } from 'react';
import { Router } from '@kestack/kabuki/routing';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@kestack/web-platform/ui/components/command';
import { Kbd } from '@kestack/web-platform/ui/components/kbd';
import { SearchIcon } from 'lucide-react';
import { SECTIONS, router } from '../../shared/index.ts';

/*
 * Search: every docs page by its title, summary and section, in a dialog
 * that ⌘K or Ctrl+K opens from anywhere. Choosing a page follows its link,
 * which the Router catches as it does any click.
 */

const linkId = (slug: string) => `search:${slug}`;

/**
 * Every word typed must be in the page's title, summary or section; a page
 * whose title has them all comes first. cmdk's own matching is fuzzy, and
 * finds "time" in "Introduction".
 */
const score = (
  _value: string,
  search: string,
  keywords: ReadonlyArray<string> = [],
): number => {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const [title = '', ...rest] = keywords.map((keyword) =>
    keyword.toLowerCase(),
  );
  const all = [title, ...rest].join(' ');
  if (!words.every((word) => all.includes(word))) return 0;
  return words.every((word) => title.includes(word)) ? 1 : 0.5;
};

export function Search() {
  const [open, setOpen] = useState(false);
  // A key the whole page listens for, added once and taken away on unmount.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((was) => !was);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const choose = (slug: string) => {
    setOpen(false);
    document.getElementById(linkId(slug))?.click();
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-56 items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground hover:text-foreground md:flex"
      >
        <SearchIcon className="size-3.5" />
        <span className="flex-1 text-left">Search docs</span>
        <Kbd>⌘K</Kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search docs"
        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:text-foreground md:hidden"
      >
        <SearchIcon className="size-4" />
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search docs"
        description="Find a page by its title or what it is about."
      >
        <Command filter={score}>
          <CommandInput placeholder="Search kabuki's docs…" />
          <CommandList className="max-h-[min(24rem,60dvh)]">
            <CommandEmpty>No page matches.</CommandEmpty>
            {SECTIONS.map((section) => (
              <CommandGroup key={section.title} heading={section.title}>
                {section.docs.map((doc) => (
                  <CommandItem
                    key={doc.slug}
                    value={doc.slug}
                    keywords={[doc.title, doc.summary, section.title]}
                    onSelect={() => choose(doc.slug)}
                  >
                    <Router.Link
                      id={linkId(doc.slug)}
                      to={router.Kabuki.Doc({ slug: doc.slug })}
                      tabIndex={-1}
                      className="pointer-events-none flex min-w-0 flex-1 flex-col"
                    >
                      <span>{doc.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {doc.summary}
                      </span>
                    </Router.Link>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
