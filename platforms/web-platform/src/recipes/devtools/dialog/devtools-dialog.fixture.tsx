import { DevtoolsDialog } from './devtools-dialog.tsx';

/*
 * The Dialog beside a page fixed to the screen, which a Dock could not lay
 * out: open it from the corner or with Ctrl+/, close it with Escape.
 */

export default (
  <>
    <main className="bg-muted/30 fixed inset-0 grid place-items-center text-sm">
      The page, fixed to the screen
    </main>
    <DevtoolsDialog
      storageKey="devtools-dialog:fixture"
      devtools={
        <div className="bg-background grid h-full place-items-center text-sm">
          Devtools, over the page
        </div>
      }
    />
  </>
);
