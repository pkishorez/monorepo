import { CodeBlockPlayground } from '@/components/code-block/playground';
import { ReactNode } from 'react';
import { snippetMap } from './snippets';
import { GlobalConfig } from '@monorepo/trace-viewer';

export function CodeBlock({
  id,
  children,
  config,
  ...rest
}: {
  id?: string;
  children?: ReactNode;
  config: Partial<GlobalConfig>;
}) {
  if (!id) return children;

  const snippet = snippetMap[id];
  if (!snippet) {
    return (
      <div className="bg-destructive text-destructive-foreground p-4 border-destructive-foreground">
        Snippet not found: {id}. This should be fixed.
      </div>
    );
  }
  const { code, effect } = snippet;

  return (
    <CodeBlockPlayground
      {...rest}
      code={code}
      effect={effect}
      config={{
        secondInPxs: 150,
        ...config,
      }}
    />
  );
}
