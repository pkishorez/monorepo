import { useState, type CSSProperties } from 'react';

import { cn } from '#lib/utils';

export interface Branding {
  appName: string | { name: string; style?: CSSProperties | undefined };
  logoUrl?:
    | string
    | { url: string; style?: CSSProperties | undefined }
    | undefined;
}

export const brandName = ({ appName }: Branding) =>
  typeof appName === 'string' ? appName : appName.name;

const brandLogo = ({ logoUrl }: Branding) =>
  typeof logoUrl === 'string' ? { url: logoUrl } : logoUrl;

function Logo({
  url,
  style,
  className,
}: {
  url: string;
  style: CSSProperties | undefined;
  className: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span
      className={cn(
        'shrink-0 overflow-hidden rounded-lg',
        !loaded && 'bg-muted',
        className,
      )}
    >
      <img
        src={url}
        alt=""
        onLoad={() => setLoaded(true)}
        className={cn('size-full object-cover', !loaded && 'invisible')}
        style={style}
      />
    </span>
  );
}

export function Brand({
  branding,
  size = 'default',
}: {
  branding: Branding;
  size?: 'default' | 'large';
}) {
  const logo = brandLogo(branding);
  const { appName } = branding;
  const large = size === 'large';
  return (
    <div className={cn('flex items-center', large ? 'gap-3.5' : 'gap-3')}>
      {logo ? (
        <Logo
          url={logo.url}
          style={logo.style}
          className={large ? 'size-11' : 'size-9'}
        />
      ) : null}
      <span
        className={cn(
          'font-semibold tracking-tight',
          large ? 'text-xl leading-11' : 'text-base leading-9',
        )}
        style={typeof appName === 'string' ? undefined : appName.style}
      >
        {brandName(branding)}
      </span>
    </div>
  );
}

export function BrandLink({ branding }: { branding: Branding }) {
  return (
    <a
      href="/"
      className="self-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
    >
      <Brand branding={branding} />
    </a>
  );
}
