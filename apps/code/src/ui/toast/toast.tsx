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

/*
 * The app's toasts: a short note of what just happened, with one way to
 * take it back, such as Undo, for a few seconds. `Toasts` draws them, once,
 * at the bottom of the screen above its safe area, and on a phone higher, clear
 * of the sidebar's `+` and the Draft's microphone; `notify` says one from
 * anywhere.
 */

const manager = createToastManager();

/**
 * Says `title`, and `description` under it, for `seconds`, with an `action`
 * button that does its thing and closes the toast.
 */
export const notify = (toast: {
  readonly title: string;
  readonly description?: string;
  readonly action?: { readonly label: string; readonly onClick: () => void };
  readonly seconds?: number;
}) => {
  const { action } = toast;
  const id: string = manager.add({
    title: toast.title,
    description: toast.description,
    timeout: (toast.seconds ?? 5) * 1000,
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
export function Toasts() {
  return (
    <ToastProvider toastManager={manager}>
      <ToastPortal>
        <ToastViewport className="bottom-[max(1rem,env(safe-area-inset-bottom))] max-md:bottom-[calc(env(safe-area-inset-bottom)+9rem)]">
          <List />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  );
}

function List() {
  const { toasts } = useToastManager();
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
