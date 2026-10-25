import type { Client } from '../../api/index.ts';
import { cx } from '../../ui/index.ts';

/** An OAuth Client's icon, or the first letter of its name. */
export function ClientMark({
  client,
  size = 'lg',
}: {
  client: Client;
  size?: 'sm' | 'lg';
}) {
  const box =
    size === 'lg' ? 'size-11 rounded-xl text-lg' : 'size-9 rounded-lg text-sm';
  return client.icon ? (
    <img
      src={client.icon}
      alt=""
      width={size === 'lg' ? 44 : 36}
      height={size === 'lg' ? 44 : 36}
      className={cx(box, 'shrink-0 object-contain')}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cx(
        box,
        'grid shrink-0 select-none place-items-center bg-muted font-semibold',
      )}
    >
      {client.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
