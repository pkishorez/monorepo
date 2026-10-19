import { Button, GoogleMark } from '../ui/index.ts';

/** The one way to sign in: Google's own neutral button, its mark beside the words, on every page. */
export function GoogleButton({
  label = 'Continue with Google',
  leaving,
  onClick,
}: {
  label?: string;
  leaving: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      tone="secondary"
      size="lg"
      busy={leaving && 'Opening Google…'}
      onClick={onClick}
    >
      <GoogleMark />
      <span className="truncate">{label}</span>
    </Button>
  );
}
