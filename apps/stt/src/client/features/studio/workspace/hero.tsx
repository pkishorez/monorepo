import { cn } from 'kui-toolkit/utils';

/** The title block: roomy on the first screen, slim once the studio opens. */
export function Hero({ compact }: { readonly compact: boolean }) {
  return (
    <header
      className={cn(
        'flex flex-col',
        compact ? 'items-start gap-1' : 'items-center gap-3 pt-10 text-center',
      )}
    >
      <h1
        className={cn(
          'font-semibold tracking-tight',
          compact ? 'text-2xl' : 'text-5xl sm:text-6xl',
        )}
      >
        stt<span className="text-primary">.</span>
      </h1>
      <p
        className={cn(
          'max-w-xl text-muted-foreground text-pretty',
          compact ? 'text-sm' : 'text-base',
        )}
      >
        Speak, press a button mid-sentence, and it lands where you said it.
      </p>
    </header>
  );
}
