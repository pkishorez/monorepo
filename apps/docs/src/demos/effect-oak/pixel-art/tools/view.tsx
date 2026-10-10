// oxlint-disable-next-line no-restricted-imports -- tool keys anywhere on the page are a window listener, kept in the View so a View of the past sends nothing.
import { useEffect } from 'react';
import { View } from 'effect-oak/react';
import type { ViewProps } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { Kbd } from '@kstackz/web-platform/components/kbd';
import { Tools } from './tools.js';
import type { Tool } from './tools.js';

const TOOLS: ReadonlyArray<{ readonly tool: Tool; readonly key: string }> = [
  { tool: 'Brush', key: 'b' },
  { tool: 'Fill', key: 'f' },
  { tool: 'Eraser', key: 'e' },
];

/** B, F and E pick a tool, as in Foldkit. */
const useToolKeys = (send: ViewProps<typeof Tools>['send']) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      const found = TOOLS.find(({ key }) => key === event.key.toLowerCase());
      if (found) send({ _tag: 'SelectedTool', tool: found.tool });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [send]);
};

export const ToolsView = View.make(Tools, ({ model, send }) => {
  useToolKeys(send);
  const horizontal = model.mirror === 'Horizontal' || model.mirror === 'Both';
  const vertical = model.mirror === 'Vertical' || model.mirror === 'Both';
  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Tool" className="flex flex-col gap-1">
        {TOOLS.map(({ tool, key }) => (
          <Button
            key={tool}
            role="radio"
            aria-checked={model.tool === tool}
            size="sm"
            variant={model.tool === tool ? 'default' : 'outline'}
            className="justify-between"
            onClick={() => send({ _tag: 'SelectedTool', tool })}
          >
            {tool}
            <Kbd>{key.toUpperCase()}</Kbd>
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Mirror</p>
        <div className="flex gap-1">
          <Button
            size="sm"
            aria-label="Mirror left and right"
            aria-pressed={horizontal}
            variant={horizontal ? 'default' : 'outline'}
            onClick={() => send({ _tag: 'ToggledMirror', axis: 'Horizontal' })}
          >
            ↔
          </Button>
          <Button
            size="sm"
            aria-label="Mirror top and bottom"
            aria-pressed={vertical}
            variant={vertical ? 'default' : 'outline'}
            onClick={() => send({ _tag: 'ToggledMirror', axis: 'Vertical' })}
          >
            ↕
          </Button>
        </div>
      </div>
    </div>
  );
});
