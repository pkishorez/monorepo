import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { ArrowLeftIcon } from '@kstackz/ui-toolkit/lucide';

/** The header button of a full-screen gesture page, back to the Gestures hub. */
export function BackToGestures() {
  return (
    <Link
      to="/gestures"
      aria-label="Gestures"
      className={buttonVariants({
        variant: 'ghost',
        size: 'icon',
        className: 'size-11 shrink-0',
      })}
    >
      <ArrowLeftIcon aria-hidden="true" />
    </Link>
  );
}
