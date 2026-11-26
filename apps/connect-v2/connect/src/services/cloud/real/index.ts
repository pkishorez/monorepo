import { Context, Effect, Layer } from 'effect';
import { SignIn } from '../../sign-in/contract/index.js';
import {
  Cloud,
  CloudUnreachable,
  type ReportAnswer,
} from '../contract/index.js';
import { HeartbeatClient } from './client.js';

const ANSWER = '10 seconds';

const tagOf = (error: unknown) =>
  (error as { readonly _tag?: string } | null)?._tag;

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(tagOf(error) ?? error);

export const answerOf = (error: unknown): ReportAnswer => {
  switch (tagOf(error)) {
    case 'Outdated':
      return {
        _tag: 'Outdated',
        line: (error as { readonly line: string }).line,
      };
    case 'ConnectionRemoved':
      return { _tag: 'Removed' };
    case 'Unauthenticated':
      return { _tag: 'SignedOut' };
    case 'ConnectionTaken':
      return {
        _tag: 'Unsent',
        problem:
          'Another User holds this Connection id. Run `ke-connect remove <name>` to start it again as a new Connection.',
      };
    default:
      return { _tag: 'Unsent', problem: messageOf(error) };
  }
};

const crashOf = (defect: unknown): ReportAnswer => ({
  _tag: 'Unsent',
  problem: `the Report crashed (${
    defect instanceof Error
      ? [defect.name, defect.message].filter(Boolean).join(': ')
      : String(defect)
  })`,
});

export interface CloudOptions {
  readonly cloud: string;
  readonly version: string;
}

export const layer = (options: CloudOptions) =>
  Layer.effect(
    Cloud,
    Effect.gen(function* () {
      const { signing } = yield* SignIn;
      const context = yield* Layer.build(
        HeartbeatClient.layer(options.cloud, options.version).pipe(
          Layer.provide(signing),
        ),
      );
      const heartbeat = Context.get(context, HeartbeatClient);
      return Cloud.of({
        report: (report) =>
          heartbeat.Report(report).pipe(
            Effect.map((answer): ReportAnswer => ({
              _tag: 'Enabled',
              plugins: answer.plugins,
            })),
            Effect.catch((error) => Effect.succeed(answerOf(error))),
            Effect.catchDefect((defect) => Effect.succeed(crashOf(defect))),
            Effect.timeoutOrElse({
              duration: ANSWER,
              orElse: () =>
                Effect.succeed<ReportAnswer>({
                  _tag: 'Unsent',
                  problem: `Connect Cloud did not answer in ${ANSWER}`,
                }),
            }),
          ),
        remove: (id) =>
          heartbeat
            .Remove({ id })
            .pipe(
              Effect.mapError(
                (error) => new CloudUnreachable({ message: messageOf(error) }),
              ),
            ),
      });
    }),
  );
