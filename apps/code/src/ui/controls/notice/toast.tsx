import {
  createToastManager,
  Toast,
  ToastAction,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from '@kestack/web-platform/ui/components/toast';
import { cn } from '@kestack/web-platform/ui/components/utils';
import { useEffect } from 'react';

/*
 * The app's toasts: a short note of what just happened, with one way to
 * take it back, such as Undo, for a few seconds. `Toasts` draws them, once,
 * at the very bottom of the screen above its safe area, over what is there
 * for the few seconds they show; `notify` says one from anywhere. One said
 * of the sidebar goes once the sidebar shuts, and while the sidebar is the
 * whole screen, as on a phone, they all show above its foot's buttons.
 */

const manager = createToastManager<{ readonly sidebar: boolean }>();

/**
 * Says `title`, and `description` under it, for `seconds`, with an `action`
 * button that does its thing and closes the toast.
 */
export const notify = (toast: {
  readonly title: string;
  readonly description?: string;
  readonly action?: { readonly label: string; readonly onClick: () => void };
  readonly seconds?: number;
  /** Said of the sidebar: it goes once the sidebar shuts. */
  readonly sidebar?: boolean;
}) => {
  const { action } = toast;
  const id: string = manager.add({
    title: toast.title,
    description: toast.description,
    timeout: (toast.seconds ?? 5) * 1000,
    data: { sidebar: toast.sidebar ?? false },
    ...(action === undefined
      ? {}
      : {
          actionProps: {
            children: action.label,
            onClick: () => {
              manager.close(id);
              action.onClick();
            },
          },
        }),
  });
  return id;
};

/** Every toast said, over the page. */
export function Toasts({
  sidebar = { open: true, whole: false },
}: {
  /** Whether the sidebar is open, and whether it is the whole screen. */
  readonly sidebar?: { readonly open: boolean; readonly whole: boolean };
}) {
  return (
    <ToastProvider toastManager={manager}>
      <ToastPortal>
        <ToastViewport
          className={cn(
            'bottom-[max(1rem,env(safe-area-inset-bottom))]',
            // The foot's buttons are 4.25rem tall over the safe area.
            sidebar.open &&
              sidebar.whole &&
              'bottom-[calc(env(safe-area-inset-bottom)+5rem)]',
          )}
        >
          <List sidebarOpen={sidebar.open} />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

function List({ sidebarOpen }: { readonly sidebarOpen: boolean }) {
  const { toasts } = useToastManager<{ readonly sidebar: boolean }>();
  useEffect(() => {
    if (sidebarOpen) return;
    // One already going stays listed while it fades, and closing it again
    // lists the toasts afresh, which would run this again without end.
    for (const each of toasts)
      if (each.data?.sidebar && each.transitionStatus !== 'ending')
        manager.close(each.id);
  }, [sidebarOpen, toasts]);
  return toasts.map((each) => (
    <Toast key={each.id} toast={each}>
      <ToastContent className="gap-3 py-3 pr-3 pl-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <ToastTitle />
          <ToastDescription className="truncate" />
        </div>
        {/* A finger's height, but compact with a keyboard. */}
        <ToastAction className="h-11 rounded-full px-4 keyboard:h-9" />
      </ToastContent>
    </Toast>
  ));
}
