import { DevtoolsDock } from './devtools-dock.tsx';

/*
 * The Dock around a plain page: open it from the corner or with Ctrl+/,
 * then pick a Layout beside the button.
 */

export default (
  <DevtoolsDock
    storageKey="devtools-dock:fixture"
    devtools={(layout) => (
      <div className="bg-background grid h-full place-items-center text-sm">
        Devtools, laid out {layout}
      </div>
    )}
  >
    <main className="grid h-full place-items-center bg-muted/30 text-sm">
      The page
    </main>
  </DevtoolsDock>
);
