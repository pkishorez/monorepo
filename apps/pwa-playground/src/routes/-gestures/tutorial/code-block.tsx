/**
 * Source as it is on disk, in a monospace block that scrolls sideways on
 * its own rather than wrapping, so the indentation reads.
 */
export function CodeBlock(props: { readonly code: string }) {
  return (
    <pre
      data-testid="lab-tutorial-code"
      className="max-h-[50dvh] overflow-auto rounded-lg bg-muted p-3 font-mono text-[11px] leading-relaxed text-foreground"
    >
      <code>{props.code.trimEnd()}</code>
    </pre>
  );
}
