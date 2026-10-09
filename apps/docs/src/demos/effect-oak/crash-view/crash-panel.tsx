import { Button } from '@kstackz/web-platform/components/button';

/** What the app shows once it has crashed: the error, and a way back. */
export const CrashPanel = ({ error }: { readonly error: Error }) => (
  <div className="flex size-full items-center justify-center p-6">
    <div
      role="alert"
      className="w-full max-w-md rounded-lg border border-destructive/40 p-8 text-center"
    >
      <h2 className="mb-4 text-2xl font-semibold text-destructive">
        Something went wrong
      </h2>
      <p className="mb-6 text-muted-foreground">{error.message}</p>
      <Button variant="destructive" onClick={() => location.reload()}>
        Reload
      </Button>
    </div>
  </div>
);
