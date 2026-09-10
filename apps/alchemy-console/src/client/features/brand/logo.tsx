// The same mark the docs use, served from public/ alongside the favicon files.
export function LogoMark({ className = 'size-5' }: { className?: string }) {
  return (
    <img
      src="/favicon.svg"
      alt=""
      width={20}
      height={20}
      className={`rounded ${className}`}
    />
  );
}

export function Logo({
  className = '',
  markClassName = 'size-5',
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark className={`${markClassName} shrink-0`} />
      <span className="text-sm font-medium tracking-tight">
        Alchemy Console
      </span>
    </span>
  );
}
