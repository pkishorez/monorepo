import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { cn } from '@kstackz/web-platform/components/utils';
import {
  combobox,
  dialog,
  disclosure,
  disclosurePreview,
  listbox,
  listboxMulti,
  menu,
  notifications,
  settings,
  tabsHorizontal,
  tabsVertical,
  tooltip,
  tooltipNoDelay,
} from './components.js';
import { HEARD, PAGES } from './pages.js';
import { Heard, Section } from './section.js';
import { ToastStack, Variant } from './toasts/index.js';
import { UiShowcase } from './ui-showcase.js';

/*
 * The showcase: a nav of pages, the page on show with its components, what
 * the parent heard from them, and the toasts. The root is `relative` so
 * dialogs and toasts cover the demo, not the Shell around it.
 */

export const UiShowcaseView = View.make(
  UiShowcase,
  ({ model, children, send }) => {
    const { page } = model;
    return (
      <div className="relative flex size-full">
        <nav
          aria-label="Components"
          className="w-44 shrink-0 overflow-y-auto border-r bg-muted/40 p-3"
        >
          <p className="px-2 pb-3 text-sm font-semibold">UI Showcase</p>
          <ul className="flex flex-col gap-0.5">
            {PAGES.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  aria-current={name === page ? 'page' : undefined}
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left text-sm',
                    name === page
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'hover:bg-muted',
                  )}
                  onClick={() => send({ _tag: 'ChosePage', page: name })}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="flex max-w-2xl flex-col gap-8">
            <h2 className="text-2xl font-bold">{page}</h2>
            {page === 'Dialog' && (
              <>
                <Section
                  title="Basic"
                  hint="Tab stays inside; Escape, Close or the backdrop dismiss it."
                >
                  <dialog.DialogView node={children.dialog} />
                </Section>
                <Section
                  title="Nested"
                  hint="The delete dialog is a Child of the settings dialog."
                >
                  <settings.DialogView node={children.settings} />
                </Section>
              </>
            )}
            {page === 'Menu' && (
              <Section
                title="Basic"
                hint="Arrow keys, Home and End move; type a letter to jump; Enter chooses."
              >
                <menu.MenuView node={children.menu} />
              </Section>
            )}
            {page === 'Tabs' && (
              <>
                <Section title="Horizontal" hint="Arrow Left and Right select.">
                  <tabsHorizontal.TabsView node={children.tabsHorizontal} />
                </Section>
                <Section title="Vertical" hint="Arrow Up and Down select.">
                  <tabsVertical.TabsView node={children.tabsVertical} />
                </Section>
              </>
            )}
            {page === 'Listbox' && (
              <>
                <Section title="Single" hint="Choosing closes the list.">
                  <listbox.ListboxView node={children.listbox} />
                </Section>
                <Section
                  title="Multiple"
                  hint="Choosing toggles; the list stays open."
                >
                  <listboxMulti.ListboxView node={children.listboxMulti} />
                </Section>
              </>
            )}
            {page === 'Combobox' && (
              <Section
                title="Basic"
                hint="Type to filter, arrows to move, Enter to choose, Escape to undo."
              >
                <combobox.ComboboxView node={children.combobox} />
              </Section>
            )}
            {page === 'Disclosure' && (
              <>
                <Section title="Basic" hint="The panel animates its height.">
                  <disclosure.DisclosureView node={children.disclosure} />
                </Section>
                <Section
                  title="Collapsed preview"
                  hint="Folds to a few lines instead of hiding."
                >
                  <disclosurePreview.DisclosureView
                    node={children.disclosurePreview}
                  />
                </Section>
              </>
            )}
            {page === 'Switch' && (
              <Section title="Basic" hint="Controlled by its Node's Model.">
                <notifications.SwitchView node={children.notifications} />
              </Section>
            )}
            {page === 'Tooltip' && (
              <>
                <Section
                  title="With a delay"
                  hint="Hover for half a second, or Tab to it."
                >
                  <tooltip.TooltipView node={children.tooltip} />
                </Section>
                <Section title="No delay" hint="Shows as soon as you hover.">
                  <tooltipNoDelay.TooltipView node={children.tooltipNoDelay} />
                </Section>
              </>
            )}
            {page === 'Toast' && (
              <Section
                title="Variants"
                hint="Toasts expire after 4 s; sticky ones wait to be dismissed."
              >
                {Variant.literals.map((variant) => (
                  <Button
                    key={variant}
                    variant="outline"
                    onClick={() =>
                      send({ _tag: 'ClickedShowToast', variant, sticky: false })
                    }
                  >
                    {variant}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  onClick={() =>
                    send({
                      _tag: 'ClickedShowToast',
                      variant: 'Info',
                      sticky: true,
                    })
                  }
                >
                  Sticky
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => send({ _tag: 'ClickedDismissAll' })}
                >
                  Dismiss all
                </Button>
              </Section>
            )}
            <Heard sources={HEARD[page]} heard={model.heard} />
          </div>
        </main>
        <ToastStack
          toasts={model.toasts}
          onDismiss={(id) => send({ _tag: 'DismissedToast', id })}
        />
      </div>
    );
  },
);
