import { View } from '@kestack/kabuki/react';
import { Router } from '@kestack/kabuki/routing';
import { Button } from '@kestack/web-platform/components/button';
import {
  ArrowUpIcon,
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
  skillsLoading,
  skillsProblem,
} from '../../../../shared/pages/index.ts';
import { Composer } from '../../../composer/index.ts';
import { useOffline } from '../../settled/index.ts';
import { ModelPicker, SettingsPicker } from '../picker/index.ts';

/*
 * A new session: the first message and its files, and under it the agent
 * and its model in one picker, and the agent's own settings in another,
 * each at its default until picked. An agent whose binary does not run is
 * greyed out, saying why. Enter starts it, once the server is in reach.
 * What went wrong shows over the composer.
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
          skillsLoading={skillsLoading(model)}
          skillsProblem={skillsProblem(model)}
          onPaletteOpen={() => send({ _tag: 'RetrySkills' })}
          disabled={model.starting}
          describedBy={offline === null ? undefined : 'new-session-offline'}
          toolbar={
            model.harnesses === null || harness === null || chosen === null ? (
              <div className="flex gap-2 px-1">
                <Skeleton className="h-5 w-28" />
                <Skeleton className="h-5 w-10" />
              </div>
            ) : (
              <>
                <ModelPicker
                  agents={model.harnesses.map(
                    ({ name, label, available, unavailableReason }) => ({
                      name,
                      label,
                      unavailable: available
                        ? null
                        : (unavailableReason ??
                          'It cannot run on this machine'),
                    }),
                  )}
                  agent={{
                    name: harness.name,
                    label: harness.label,
                    unavailable,
                  }}
                  onPickAgent={(name) =>
                    send({
                      _tag: 'PickHarness',
                      harness: name as typeof harness.name,
                    })
                  }
                  value={chosen}
                  models={models?.list ?? []}
                  loading={models === undefined}
                  onPick={(id) => send({ _tag: 'PickModel', model: id })}
                />
                <SettingsPicker
                  settings={harness.settings}
                  values={settings}
                  onPick={(key, value) =>
                    send({ _tag: 'PickSetting', key, value })
                  }
                />
              </>
            )
          }
          actions={
            <Button
              type="submit"
              size="sm"
              aria-label="Start session"
              disabled={
                offline !== null ||
                model.starting ||
                chosen === null ||
                unavailable !== null ||
                (model.text.trim() === '' && model.attachments.length === 0)
              }
            >
              {model.starting ? <Spinner /> : <ArrowUpIcon aria-hidden />}
              <span className="hidden @sm/composer:inline">Start session</span>
            </Button>
          }
        />
      </div>
    );
  },
);
