import { Graph } from './graph.js';
import { Plot } from './plot.js';
import type { Datum } from './plot.js';

/*
 * The chart for a choice, drawn from the Telemetry. Foldkit hands echarts an
 * option object through a Command; here the View draws SVG from the Model,
 * so the chart is whatever the Model says at every moment, Replay included.
 * Each picked datum has an id: `<mode>:<series>:<week>`.
 */

type Telemetry = {
  readonly packages: ReadonlyArray<{
    readonly id: string;
    readonly npmName: string;
    readonly totalDownloads: number;
    readonly downloadsByWeek: ReadonlyArray<number>;
  }>;
  readonly edges: ReadonlyArray<{
    readonly source: string;
    readonly target: string;
    readonly kind: 'Dependency' | 'PeerDependency';
  }>;
  readonly weeks: ReadonlyArray<{
    readonly weekStart: string;
    readonly commits: number;
    readonly releases: number;
  }>;
};

type Choice = {
  readonly mode: 'Adoption' | 'Velocity' | 'Ecosystem';
  readonly packageId: string;
  readonly period: 'LastEightWeeks' | 'LastSixteenWeeks' | 'LastYear';
};

const WEEKS_IN = { LastEightWeeks: 8, LastSixteenWeeks: 16, LastYear: 52 };

const series = (
  telemetry: Telemetry,
  choice: Choice,
  name: string,
  value: (week: number) => number,
): ReadonlyArray<Datum> => {
  const from = telemetry.weeks.length - WEEKS_IN[choice.period];
  return telemetry.weeks.slice(Math.max(0, from)).map((week, i) => ({
    id: `${choice.mode}:${name}:${week.weekStart}`,
    label: week.weekStart,
    value: value(Math.max(0, from) + i),
  }));
};

const downloads = (telemetry: Telemetry, choice: Choice) => {
  const pkg = telemetry.packages.find((p) => p.id === choice.packageId);
  return series(
    telemetry,
    choice,
    choice.packageId,
    (i) => pkg?.downloadsByWeek[i] ?? 0,
  );
};

/** Words for a picked datum, if it is one of this Telemetry's. */
export const describeDatum = (
  telemetry: Telemetry,
  choice: Choice,
  id: string,
) => {
  const all = [
    ...downloads(telemetry, choice).map((d) => [d, 'downloads'] as const),
    ...series(
      telemetry,
      choice,
      'Commits',
      (i) => telemetry.weeks[i]!.commits,
    ).map((d) => [d, 'commits'] as const),
    ...series(
      telemetry,
      choice,
      'Releases',
      (i) => telemetry.weeks[i]!.releases,
    ).map((d) => [d, 'releases'] as const),
  ];
  const pkg = telemetry.packages.find(
    (p) => id === `Ecosystem:Package:${p.id}`,
  );
  if (pkg)
    return `${pkg.npmName}: ${pkg.totalDownloads.toLocaleString()} downloads this year`;
  const found = all.find(([d]) => d.id === id);
  return found
    ? `Week of ${found[0].label}: ${found[0].value.toLocaleString()} ${found[1]}`
    : null;
};

export const Chart = ({
  telemetry,
  choice,
  selectedId,
  onPick,
}: {
  readonly telemetry: Telemetry;
  readonly choice: Choice;
  readonly selectedId: string | null;
  readonly onPick: (id: string) => void;
}) => {
  switch (choice.mode) {
    case 'Adoption': {
      const name =
        telemetry.packages.find((p) => p.id === choice.packageId)?.npmName ??
        '';
      return (
        <Plot
          kind="line"
          title={`Weekly npm downloads of ${name}`}
          unit="downloads"
          data={downloads(telemetry, choice)}
          selectedId={selectedId}
          onPick={onPick}
        />
      );
    }
    case 'Velocity':
      // Two measures of different scale: two charts, never two y-axes.
      return (
        <div className="flex flex-col gap-4">
          <Plot
            kind="bar"
            title="Commits per week"
            unit="commits"
            data={series(
              telemetry,
              choice,
              'Commits',
              (i) => telemetry.weeks[i]!.commits,
            )}
            selectedId={selectedId}
            onPick={onPick}
          />
          <Plot
            kind="bar"
            title="Releases per week, all packages"
            unit="releases"
            data={series(
              telemetry,
              choice,
              'Releases',
              (i) => telemetry.weeks[i]!.releases,
            )}
            selectedId={selectedId}
            onPick={onPick}
          />
        </div>
      );
    case 'Ecosystem':
      return (
        <Graph
          packages={telemetry.packages}
          edges={telemetry.edges}
          highlightedId={choice.packageId}
          selectedId={selectedId}
          onPick={(id) => onPick(`Ecosystem:Package:${id}`)}
        />
      );
  }
};
