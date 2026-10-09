import { Button } from '@kstackz/web-platform/components/button';

type Scenario = {
  readonly title: string;
  readonly body: string;
  readonly thresholdMs: number;
  readonly button: string;
  readonly accent: string;
  readonly run: () => void;
};

/** One card per kind of slow work, with a button to run it. */
export const Scenarios = ({
  scenarios,
}: {
  readonly scenarios: ReadonlyArray<Scenario>;
}) => (
  <section className="grid gap-4 md:grid-cols-3">
    {scenarios.map((scenario) => (
      <article
        key={scenario.title}
        className={`flex flex-col gap-3 rounded-lg border p-4 ${scenario.accent}`}
      >
        <div>
          <h2 className="font-semibold">{scenario.title}</h2>
          <p className="text-sm opacity-80">
            Threshold: {scenario.thresholdMs}ms
          </p>
        </div>
        <p className="flex-1 text-sm">{scenario.body}</p>
        <Button size="sm" className="self-start" onClick={scenario.run}>
          {scenario.button}
        </Button>
      </article>
    ))}
  </section>
);
