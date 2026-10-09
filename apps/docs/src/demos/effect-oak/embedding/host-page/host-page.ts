/*
 * The host page: plain DOM, with no React and no Effect Oak of its own. It
 * knows the widget only through `embed`, which mounts it into an element and
 * hands back a handle: flags at mount, a step pushed in, counts heard back,
 * and dispose. This mirrors Foldkit's `host.ts` and its `Runtime.embed`.
 */

type Handle = {
  readonly sendStep: (step: number) => void;
  readonly onCount: (listener: (count: number) => void) => () => void;
  readonly dispose: () => void;
};

type Embed = (
  element: HTMLElement,
  flags: { readonly initialCount: number },
) => Handle;

const INITIAL_COUNT = 10;

const MARKUP = `
  <div class="mx-auto flex max-w-xl flex-col gap-6 p-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-2xl font-semibold">Host application</h1>
      <p class="text-sm text-muted-foreground">
        This page is plain DOM with no Effect Oak of its own. It embeds the
        widget below with <code>embed</code> and talks to it only through the
        handle: flags at mount, a step in, counts out, dispose on unmount.
      </p>
    </header>
    <section class="flex flex-col gap-3 rounded-xl border p-6">
      <h2 class="text-sm font-semibold">Host controls</h2>
      <div class="flex flex-wrap items-center gap-4">
        <button data-host="toggle" type="button"
          class="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"></button>
        <label class="flex items-center gap-2 text-sm">
          Step
          <input data-host="step" type="range" min="1" max="10" value="1" />
          <span data-host="step-value" class="w-5 font-semibold tabular-nums">1</span>
        </label>
      </div>
      <p class="text-sm">
        Last count received from the widget:
        <span data-host="count" class="font-semibold tabular-nums">none yet</span>
      </p>
    </section>
    <div data-host="slot"></div>
  </div>
`;

/** Build the host page in `container`; returns how to tear it down. */
export const startHost = (container: HTMLElement, embed: Embed) => {
  container.innerHTML = MARKUP;
  const find = <E extends Element>(name: string) =>
    container.querySelector<E>(`[data-host="${name}"]`)!;
  const toggle = find<HTMLButtonElement>('toggle');
  const step = find<HTMLInputElement>('step');
  const stepValue = find<HTMLElement>('step-value');
  const count = find<HTMLElement>('count');
  const slot = find<HTMLElement>('slot');

  let mounted: { handle: Handle; stopListening: () => void } | null = null;

  const mount = () => {
    const handle = embed(slot, { initialCount: INITIAL_COUNT });
    const stopListening = handle.onCount((latest) => {
      count.textContent = String(latest);
    });
    handle.sendStep(Number(step.value));
    mounted = { handle, stopListening };
    toggle.textContent = 'Unmount widget';
  };

  const unmount = () => {
    mounted?.stopListening();
    mounted?.handle.dispose();
    mounted = null;
    toggle.textContent = 'Mount widget';
  };

  toggle.addEventListener('click', () => (mounted ? unmount() : mount()));
  step.addEventListener('input', () => {
    stepValue.textContent = step.value;
    mounted?.handle.sendStep(Number(step.value));
  });

  mount();
  return () => {
    unmount();
    container.innerHTML = '';
  };
};
