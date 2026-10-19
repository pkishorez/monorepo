import { cx } from './cx.ts';

const sizes = {
  sm: 'size-7 text-xs',
  md: 'size-8 text-sm',
  lg: 'size-12 text-lg',
};

/** An Account's picture, or its first letter when it has none. */
export function Avatar({
  name,
  email,
  image,
  size = 'md',
  className,
}: {
  name: string;
  email: string;
  image: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const letter = (name.trim() || email).charAt(0).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full bg-muted font-medium text-muted-fg',
        'after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:shadow-(--shadow-edge)',
        sizes[size],
        className,
      )}
    >
      {letter}
      {image ? (
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
    </span>
  );
}
