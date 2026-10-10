import type { ReactNode } from 'react';
import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@kstackz/web-platform/components/card';
import { CalculatorView } from './calculator/index.js';
import { EnginePanel } from './managed-resource-layer.js';

const Panel = ({
  status,
  tone,
  children,
}: {
  readonly status: string;
  readonly tone: string;
  readonly children: ReactNode;
}) => (
  <div className="flex size-full items-center justify-center p-6">
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Layer-backed engine</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p role="status" className={tone}>
          {status}
        </p>
        {children}
      </CardContent>
    </Card>
  </div>
);

export const EnginePanelView = View.make(EnginePanel, {
  Off: ({ send }) => (
    <Panel status="Engine is off." tone="text-muted-foreground">
      <Button onClick={() => send({ _tag: 'ClickedStartEngine' })}>
        Start engine
      </Button>
    </Panel>
  ),
  On: ({ state, children, frame, send }) => (
    <Panel
      status={
        state.engineId === null
          ? 'Booting engine…'
          : `Engine ready: ${state.engineId}`
      }
      tone={state.engineId === null ? 'text-amber-600' : 'text-green-600'}
    >
      <Button
        variant="destructive"
        onClick={() => send({ _tag: 'ClickedStopEngine' })}
      >
        Stop engine
      </Button>
      {state.engineId !== null && (
        <CalculatorView node={children.calculator} frame={frame} />
      )}
    </Panel>
  ),
  Failed: ({ state, send }) => (
    <Panel status={`Engine failed: ${state.reason}`} tone="text-destructive">
      <Button onClick={() => send({ _tag: 'ClickedStartEngine' })}>
        Start engine
      </Button>
    </Panel>
  ),
});
