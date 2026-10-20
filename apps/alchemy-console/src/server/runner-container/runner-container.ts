import { DurableObject } from 'cloudflare:workers';

/*
 * One run's container: a Durable Object per run, named by the run's ID,
 * backed by the runner image (`Dockerfile`), as `alchemy.run.ts` binds it
 * (`RUNNER`). The User Space starts it with the run's three variables and
 * nothing else, `RUN_ID`, `RUN_TOKEN` and `CONSOLE_URL`, and stops it when
 * the run ends, is lost, or times out. Whatever happens to the User Space,
 * the container never outlives `HARD_LIMIT_MS`: an alarm destroys it.
 */

/** The run's 30 minutes, and a little more for the runner to say how it ended. */
const HARD_LIMIT_MS = 35 * 60 * 1000;

/** The only variables a run's container is given. */
export interface RunnerVariables {
  readonly RUN_ID: string;
  readonly RUN_TOKEN: string;
  readonly CONSOLE_URL: string;
}

export class RunnerContainer extends DurableObject {
  /** Starts the run's container, unless it is running already. */
  async start(variables: RunnerVariables): Promise<void> {
    const container = this.ctx.container;
    if (container === undefined)
      throw new Error('This Worker has no container bound to RunnerContainer.');
    if (!container.running)
      container.start({
        enableInternet: true,
        env: {
          RUN_ID: variables.RUN_ID,
          RUN_TOKEN: variables.RUN_TOKEN,
          CONSOLE_URL: variables.CONSOLE_URL,
        },
      });
    // The runner talks to the User Space, not to this object: keep the
    // container up though no request reaches it here.
    await container.setInactivityTimeout(HARD_LIMIT_MS);
    await this.ctx.storage.setAlarm(Date.now() + HARD_LIMIT_MS);
  }

  /** Stops the run's container; nothing happens when it is not running. */
  async stop(): Promise<void> {
    const container = this.ctx.container;
    if (container?.running) await container.destroy();
    await this.ctx.storage.deleteAlarm();
  }

  override async alarm(): Promise<void> {
    await this.stop();
  }
}
