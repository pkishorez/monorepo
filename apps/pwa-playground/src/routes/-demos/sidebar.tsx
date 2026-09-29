import { useSidebar } from '@kstackz/use-gesture';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import {
  ArchiveIcon,
  FileIcon,
  InboxIcon,
  MenuIcon,
  SendIcon,
  StarIcon,
} from '@kstackz/ui-toolkit/lucide';
import {
  motion,
  useMotionValueEvent,
  useTransform,
} from '@kstackz/ui-toolkit/motion';
import { cn } from '@kstackz/ui-toolkit/utils';
import { type ReactNode, useState } from 'react';
import {
  Actions,
  Controls,
  Segmented,
  Stage,
  Toggle,
  Value,
  Values,
} from '../../components/index.ts';
import { oneOf } from '../../lib/search.ts';
import { Fingers, MAIL, pct, Phone, px } from './kit.tsx';

export type SidebarOptions = {
  readonly side: 'left' | 'right';
  readonly width: number;
  readonly enabled: boolean;
};

export const SIDEBAR_DEFAULTS: SidebarOptions = {
  side: 'left',
  width: 240,
  enabled: true,
};

const WIDTHS = [200, 240, 280] as const;

/** Options from a URL's search params; anything unknown falls back. */
export const parseSidebar = (s: Record<string, unknown>): SidebarOptions => ({
  side: oneOf(s['side'], ['left', 'right'], SIDEBAR_DEFAULTS.side),
  width: oneOf(s['width'], WIDTHS, SIDEBAR_DEFAULTS.width),
  enabled: oneOf(s['enabled'], [true, false], SIDEBAR_DEFAULTS.enabled),
});

export const sidebarCode = (
  o: SidebarOptions,
) => `import { useSidebar } from '@kstackz/use-gesture';

const [open, setOpen] = useState(false);
const sidebar = useSidebar({
  side: '${o.side}',
  width: ${o.width},${o.enabled ? '' : '\n  enabled: false, // buttons only'}
  open,
  onOpenChange: setOpen,
});

// It returns motion values; you render them.
<motion.div
  style={{ opacity: sidebar.progress }}
  onClick={() => sidebar.setOpen(false)}
/>
<motion.aside style={{ x: sidebar.x, width: ${o.width} }} />`;

const NAV = [
  { name: 'Inbox', Icon: InboxIcon },
  { name: 'Starred', Icon: StarIcon },
  { name: 'Sent', Icon: SendIcon },
  { name: 'Drafts', Icon: FileIcon },
  { name: 'Archive', Icon: ArchiveIcon },
] as const;

function Screen(props: {
  readonly options: SidebarOptions;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly controls: ReactNode;
}) {
  const { side, width, enabled } = props.options;
  const sidebar = useSidebar({
    side,
    width,
    enabled,
    open: props.open,
    onOpenChange: props.onOpenChange,
  });
  // The inbox steps back as the sidebar comes in.
  const scale = useTransform(sidebar.progress, [0, 1], [1, 0.94]);
  const [showing, setShowing] = useState(false);
  useMotionValueEvent(sidebar.progress, 'change', (v) => setShowing(v > 0));
  const covering = props.open || sidebar.dragging || showing;
  const progressText = useTransform(sidebar.progress, pct);
  const xText = useTransform(sidebar.x, px);

  return (
    <>
      <Stage className="py-8">
        <Phone className="bg-muted">
          <motion.div
            style={{ scale }}
            className="flex h-full flex-col overflow-hidden bg-background"
          >
            <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-1.5">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Open the sidebar"
                onClick={() => sidebar.setOpen(true)}
                className="size-10"
              >
                <MenuIcon aria-hidden="true" />
              </Button>
              <span className="font-medium">Inbox</span>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {MAIL.map((mail) => (
                <li key={mail.id} className="border-b border-border px-4 py-3">
                  <p className="text-sm font-medium">{mail.from}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {mail.subject}
                  </p>
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div
            aria-hidden="true"
            style={{ opacity: sidebar.progress }}
            onClick={() => sidebar.setOpen(false)}
            className={cn(
              'absolute inset-0 z-20 bg-black/45',
              !covering && 'pointer-events-none',
            )}
          />
          <motion.aside
            aria-label="Sidebar"
            inert={!props.open}
            style={{ x: sidebar.x, width }}
            className={cn(
              'absolute inset-y-0 z-30 flex flex-col bg-card shadow-xl',
              side === 'left' ? 'left-0' : 'right-0',
            )}
          >
            <p className="flex h-12 shrink-0 items-center px-4 font-semibold">
              Mail
            </p>
            <nav className="flex flex-col gap-0.5 px-2">
              {NAV.map(({ name, Icon }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => sidebar.setOpen(false)}
                  className="flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-muted"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {name}
                </button>
              ))}
            </nav>
          </motion.aside>
        </Phone>
        <Fingers />
      </Stage>
      {props.controls}
      <Values>
        <Value label="open" testId="sidebar-open">
          {String(sidebar.open)}
        </Value>
        <Value label="dragging" testId="sidebar-dragging">
          {String(sidebar.dragging)}
        </Value>
        <Value label="progress">
          <motion.span>{progressText}</motion.span>
        </Value>
        <Value label="x">
          <motion.span>{xText}</motion.span>
        </Value>
      </Values>
    </>
  );
}

/** useSidebar on an inbox, with its options beside it. */
export function SidebarDemo(props: {
  readonly options: SidebarOptions;
  readonly onOptions: (options: SidebarOptions) => void;
}) {
  const { options } = props;
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<SidebarOptions>) =>
    props.onOptions({ ...options, ...patch });
  return (
    <Screen
      // A new side or width starts closed, from its own resting place.
      key={`${options.side}-${options.width}`}
      options={options}
      open={open}
      onOpenChange={setOpen}
      controls={
        <Controls>
          <Segmented
            label="Side"
            value={options.side}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(side) => {
              setOpen(false);
              set({ side });
            }}
          />
          <Segmented
            label="Width"
            value={options.width}
            options={WIDTHS.map((w) => ({ value: w, label: String(w) }))}
            onChange={(width) => set({ width })}
          />
          <Toggle
            label="Swipes open and close it"
            checked={options.enabled}
            onChange={(enabled) => set({ enabled })}
          />
          <Actions>
            <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
              {open ? 'setOpen(false)' : 'setOpen(true)'}
            </Button>
          </Actions>
        </Controls>
      }
    />
  );
}
