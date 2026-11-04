import { GoogleButton, Spinner } from '../../ui/index.ts';

/*
 * Signing in, on every page: Google's own button, never the accent, even
 * when it is the page's next step. It has no busy look, so while the page
 * leaves for Google it disables and the line under it says so.
 */
export function GoogleSignIn({
  label = 'Continue with Google',
  leaving,
  onClick,
}: {
  label?: 'Continue with Google' | 'Sign in with Google';
  leaving: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col">
      <GoogleButton
        theme="auto"
        label={label}
        className="w-full"
        disabled={leaving}
        aria-busy={leaving || undefined}
        onClick={onClick}
      />
      <p
        role="status"
        className="flex items-center justify-center gap-2 text-sm text-muted-fg not-empty:mt-3"
      >
        {leaving ? (
          <>
            <Spinner />
            Opening Google…
          </>
        ) : null}
      </p>
    </div>
  );
}
