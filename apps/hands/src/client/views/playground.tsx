import { View } from '@kestack/kabuki/react';
import { Badge } from '@kestack/web-platform/components/badge';
import { Button } from '@kestack/web-platform/components/button';
import {
  CameraIcon,
  CameraOffIcon,
} from '@kestack/web-platform/components/lucide';
import { Label } from '@kestack/web-platform/components/label';
import { Spinner } from '@kestack/web-platform/components/spinner';
import { Switch } from '@kestack/web-platform/components/switch';
import { Pages } from '../../shared/pages/index.ts';
import { Readouts, Stage } from '../stage/index.ts';
import { Checklist, Log } from './checklist.tsx';

/*
 * The Playground: the stage on the left, with its controls and the numbers
 * behind it; the checklist and the latest gestures on the right. While
 * the camera is off, loading or broken, the stage says so and offers the
 * way on.
 */

function Over({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">{children}</div>
    </div>
  );
}

export const PlaygroundView = View.make(
  Pages.PlaygroundLive,
  ({ root, _tag, state, model, send }) => {
    const on = _tag === 'On';
    const running = on && state.delegate !== null;
    const start = () => send({ _tag: 'Start' });
    return (
      <div {...root} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Stage skeleton={model.skeleton}>
            {_tag === 'Off' && (
              <Over>
                <p className="text-sm text-pretty text-muted-foreground">
                  Your camera is read here, in your browser. Nothing is sent
                  anywhere.
                </p>
                <Button size="lg" onClick={start}>
                  <CameraIcon /> Start the camera
                </Button>
              </Over>
            )}
            {on && !running && (
              <Over>
                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  {state.loading
                    ? 'Loading the hand model…'
                    : 'Waiting for the camera. Allow it if your browser asks.'}
                </p>
              </Over>
            )}
            {_tag === 'Failed' && (
              <Over>
                <p className="text-sm text-pretty">{state.reason}</p>
                <Button variant="outline" onClick={start}>
                  Try again
                </Button>
              </Over>
            )}
          </Stage>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {on ? (
              <Button variant="outline" onClick={() => send({ _tag: 'Stop' })}>
                <CameraOffIcon /> Stop the camera
              </Button>
            ) : (
              <Button variant="outline" onClick={start}>
                <CameraIcon /> Start the camera
              </Button>
            )}
            <Label className="gap-2 font-normal">
              <Switch
                checked={model.smoothing}
                onCheckedChange={() =>
                  send({ _tag: 'Toggled', setting: 'smoothing' })
                }
              />
              Smoothing
            </Label>
            <Label className="gap-2 font-normal">
              <Switch
                checked={model.skeleton}
                onCheckedChange={() =>
                  send({ _tag: 'Toggled', setting: 'skeleton' })
                }
              />
              Skeleton
            </Label>
            {running && (
              <Badge
                variant={state.delegate === 'GPU' ? 'default' : 'secondary'}
              >
                Model on the {state.delegate}
              </Badge>
            )}
          </div>

          <Readouts />
        </div>

        <aside className="space-y-8 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:pr-1">
          <Checklist
            counts={model.counts}
            digits={model.digits}
            reset={() => send({ _tag: 'Reset' })}
          />
          <Log log={model.log} />
        </aside>
      </div>
    );
  },
);
