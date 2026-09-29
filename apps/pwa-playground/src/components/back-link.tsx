import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@kstackz/ui-toolkit/components/ui/button';
import { ArrowLeftIcon } from '@kstackz/ui-toolkit/lucide';

/** The header button of a full-screen bench, back to the page it belongs to. */
export function BackLink(props: {
  readonly to: string;
  readonly label: string;
}) {
  return (
    <Link
      to={props.to}
      aria-label={`Back to ${props.label}`}
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
