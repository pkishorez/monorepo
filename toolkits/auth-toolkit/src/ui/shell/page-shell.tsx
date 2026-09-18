import { Button } from 'kui-toolkit/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from 'kui-toolkit/components/ui/card';
import { cn } from 'kui-toolkit/lib/utils';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { brandLogo, brandName, type Branding } from './branding.js';

interface SignedInAs {
  email: string;
  signOut: () => void;
}

interface PageShellProps {
  branding: Branding;
  title: ReactNode;
  description?: ReactNode;
  /** `'pending'` keeps the line's space while the session loads. */
  signedInAs?: SignedInAs | 'pending' | undefined;
  /** Lays the content out but hides it, so the card has its size before it
   * has anything to say. */
  loading?: boolean | undefined;
  children: ReactNode;
  footer?: ReactNode;
}

function Logo({
  url,
  style,
}: {
  url: string;
  style?: CSSProperties | undefined;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);
  return (
    <img
      ref={ref}
      src={url}
      alt=""
      width={36}
      height={36}
      onLoad={() => setLoaded(true)}
      className={cn(
        'size-9 shrink-0 rounded-lg object-cover transition-opacity duration-300 motion-reduce:transition-none',
        loaded ? 'opacity-100' : 'opacity-0',
      )}
      style={style}
    />
  );
}

export function Brand(branding: Branding) {
  const logo = brandLogo(branding);
  const { appName } = branding;
  return (
    <div className="flex items-center gap-3">
      {logo ? <Logo url={logo.url} style={logo.style} /> : null}
      <span
        className="text-base font-semibold tracking-tight"
        style={typeof appName === 'string' ? undefined : appName.style}
      >
        {brandName(branding)}
      </span>
    </div>
  );
}

export function PageShell({
  branding,
  title,
  description,
  signedInAs,
  loading = false,
  children,
  footer,
}: PageShellProps) {
  const who = signedInAs === 'pending' ? undefined : signedInAs;
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card
        aria-busy={loading}
        className={cn(
          'w-full max-w-sm shadow-sm *:transition-[opacity,visibility] *:duration-150 motion-reduce:*:transition-none',
          loading && '*:invisible *:opacity-0',
        )}
      >
        <CardHeader className="gap-6">
          <Brand {...branding} />
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-xl text-balance">{title}</CardTitle>
            {description ? (
              <CardDescription className="text-pretty">
                {description}
              </CardDescription>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
        {footer || signedInAs ? (
          <CardFooter className="flex flex-col items-stretch gap-3 border-t pt-4">
            {footer}
            {signedInAs ? (
              <p
                className={cn(
                  'flex items-center justify-between gap-3 text-xs text-muted-foreground',
                  !who && 'invisible',
                )}
              >
                <span className="truncate">
                  Signed in as{' '}
                  <span className="text-foreground">{who?.email}</span>
                </span>
                <Button
                  variant="link"
                  size="xs"
                  className="relative h-auto shrink-0 p-0 text-xs before:absolute before:-inset-2"
                  onClick={who?.signOut}
                >
                  Sign out
                </Button>
              </p>
            ) : null}
          </CardFooter>
        ) : null}
      </Card>
    </main>
  );
}
