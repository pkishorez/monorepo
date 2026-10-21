import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
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
  pickedSkills,
  router,
} from '../../../../shared/pages/index.ts';
import { Composer } from '../../../composer/index.ts';
import { useOffline } from '../../settled/index.ts';
import { Choice, ModelPicker } from '../picker/index.ts';

/*
 * A new session: the first message and its files, and under it the agent,
 * its model and its own settings, each at its default until picked. An
 * agent whose binary does not run is greyed out, saying why. Enter starts
 * it, once the server is in reach.
 */

export const NewSessionView = View.make(
  Pages.NewSessionLive,
  ({ root, model, send }) => {
    const harness = pickedHarness(model);
    const chosen = pickedModel(model);
    const settings = pickedSettings(model);
    const models = model.models.find((each) => each.harness === model.harness);
    const unavailable =
      harness?.available === false
        ? (harness.unavailableReason ?? 'This agent cannot run on this machine')
        : null;
    const problem =
      model.problem ??
      model.harnessProblem ??
      models?.problem ??
      unavailable ??
      null;
    const offline = useOffline();
    return (
      <div {...root} className="flex flex-col gap-2">
        <Composer
          label="First message"
          placeholder="What should the agent do? Type / for skills"
          text={model.text}
          onTextChange={(text) => send({ _tag: 'Typed', text })}
          attachments={model.attachments}
          onAttachmentsChange={(attachments) =>
            send({ _tag: 'Attach', attachments })
          }
          onSubmit={() => {
            if (offline === null) send({ _tag: 'Start' });
          }}
          skills={pickedSkills(model)}
          disabled={model.starting}
          describedBy={offline === null ? undefined : 'new-session-offline'}
          toolbar={
            model.harnesses === null || harness === null || chosen === null ? (
              <div className="flex gap-2 px-1">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-28" />
              </div>
            ) : (
              <>
                <Choice
                  label="Agent"
                  value={harness.name}
                  choices={model.harnesses.map(
                    ({ name, label, available, unavailableReason }) => ({
                      value: name,
                      label,
                      unavailable: available
                        ? null
                        : (unavailableReason ??
                          'It cannot run on this machine'),
                    }),
                  )}
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
              </>
            )
          }
          actions={
            <Button
              type="submit"
              size="sm"
              disabled={
                offline !== null ||
                model.starting ||
                chosen === null ||
                unavailable !== null ||
                (model.text.trim() === '' && model.attachments.length === 0)
              }
            >
              {model.starting && <Spinner />}
              Start session
            </Button>
          }
        />
        {offline !== null && (
          <p
            id="new-session-offline"
            className="flex items-center gap-2 px-1 text-sm text-muted-foreground"
          >
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
            {problem === unavailable && (
              <Router.Link
                to={router.Settings()}
                className="focus-ring shrink-0 rounded-sm text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
              >
                Open Settings
              </Router.Link>
            )}
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
      </div>
    );
  },
);
