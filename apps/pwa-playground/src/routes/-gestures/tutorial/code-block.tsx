import { SourceViewer } from 'kui-toolkit/components/blocks/source-viewer';

/** Source as it is on disk, highlighted by KUI's shared Shiki viewer. */
export function CodeBlock(props: { readonly code: string }) {
  return (
    <div data-testid="lab-tutorial-code">
      <SourceViewer
        filePath="gestures.tsx"
        content={props.code.trimEnd()}
        showHeader={false}
        showLineNumbers={false}
        className="h-[50dvh] max-h-[28rem] overflow-hidden rounded-lg border"
      />
    </div>
  );
}
