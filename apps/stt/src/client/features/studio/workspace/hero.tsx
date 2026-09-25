import { cn } from 'kui-toolkit/utils';

/** The title block: roomy on the first screen, slim once the studio opens. */
export function Hero({ compact }: { readonly compact: boolean }) {
  return (
    <header
      className={cn(
        'flex flex-col',
        compact ? 'items-start gap-1' : 'items-center gap-4 pt-6 text-center',
      )}
    >
      <h1
        className={cn(
          'font-semibold tracking-tight',
          compact ? 'text-2xl' : 'text-6xl sm:text-7xl',
        )}
      >
        stt<span className="text-primary">.</span>
      </h1>
      <p
        className={cn(
          'max-w-xl text-muted-foreground text-pretty',
          compact ? 'text-sm' : 'text-base sm:text-lg',
        )}
      >
        Speak, press a context button mid-sentence, and it lands exactly where
        you said it.{compact ? null : ' Everything runs in this tab on WebGPU.'}
      </p>
    </header>
  );
}
