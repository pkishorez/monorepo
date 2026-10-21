import { View } from '@kestack/kabuki/react';
import { Button } from '@kestack/web-platform/components/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@kestack/web-platform/components/input-group';
import {
  CircleAlertIcon,
  WifiOffIcon,
} from '@kestack/web-platform/components/lucide';
import { Skeleton } from '@kestack/web-platform/components/skeleton';
import { Spinner } from '@kestack/web-platform/components/spinner';
import {
  Pages,
  pickedHarness,
  pickedModel,
  pickedSettings,
} from '../../../../shared/pages/index.ts';
import { useOffline } from '../../settled/index.ts';
import { Choice, ModelPicker } from '../picker/index.ts';

/*
 * A new session: the first message, and under it the agent, its model and
 * its own settings, each at its default until picked. Enter starts it,
 * once the server is in reach.
 */

export const NewSessionView = View.make(
  Pages.NewSessionLive,
  ({ root, model, send }) => {
    const harness = pickedHarness(model);
    const chosen = pickedModel(model);
    const settings = pickedSettings(model);
    const models = model.models.find((each) => each.harness === model.harness);
    const problem =
      model.problem ?? model.harnessProblem ?? models?.problem ?? null;
    const offline = useOffline();
    const start = () => {
      if (offline === null) send({ _tag: 'Start' });
    };
    return (
      <form
        {...root}
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <InputGroup className="rounded-xl bg-card shadow-xs dark:bg-card">
          <InputGroupTextarea
            aria-label="First message"
            placeholder="What should the agent do?"
            rows={3}
            value={model.text}
            disabled={model.starting}
            className="max-h-64 min-h-20 px-3.5 pt-3 text-base leading-relaxed"
            onChange={(event) =>
              send({ _tag: 'Typed', text: event.currentTarget.value })
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                start();
              }
            }}
          />
          <InputGroupAddon
            align="block-end"
            className="cursor-default gap-1 px-2 pb-2"
          >
            {model.harnesses === null || harness === null || chosen === null ? (
              <div className="flex gap-2 px-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-28" />
              </div>
            ) : (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5">
                <Choice
                  label="Agent"
                  value={harness.name}
                  choices={model.harnesses.map(({ name, label }) => ({
                    value: name,
                    label,
                  }))}
                  onPick={(name) =>
                    send({
                      _tag: 'PickHarness',
                      harness: name as typeof harness.name,
                    })
                  }
                />
                <ModelPicker
                  value={chosen}
                  models={models?.list ?? []}
                  loading={models === undefined}
                  onPick={(id) => send({ _tag: 'PickModel', model: id })}
                />
                {harness.settings.map((setting) => (
                  <Choice
                    key={setting.key}
                    named
                    label={setting.label}
                    value={settings[setting.key] ?? setting.default}
                    choices={setting.choices}
                    onPick={(value) =>
                      send({ _tag: 'PickSetting', key: setting.key, value })
                    }
                  />
                ))}
              </div>
            )}
            <Button
              type="submit"
              size="sm"
              className="ml-auto shrink-0 self-end"
              disabled={
                offline !== null ||
                model.starting ||
                chosen === null ||
                model.text.trim() === ''
              }
            >
              {model.starting && <Spinner />}
              Start session
            </Button>
          </InputGroupAddon>
        </InputGroup>
        {offline !== null && (
          <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <WifiOffIcon
              aria-hidden
              className="size-3.5 shrink-0 text-warning"
            />
            {offline} to the server. You can start once it is back.
          </p>
        )}
        {problem !== null && (
          <p
            role="alert"
            className="flex items-center gap-2 px-1 text-sm text-destructive"
          >
            <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            {problem}
            {(model.harnessProblem || models?.status === 'failed') && (
              <Button
                variant="link"
                size="xs"
                type="button"
                onClick={() => send({ _tag: 'Retry' })}
              >
                Try again
              </Button>
            )}
          </p>
        )}
      </form>
    );
  },
);
