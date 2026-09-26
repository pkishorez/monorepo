import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from 'kui-toolkit/components/ui/card';
import type { ReactNode } from 'react';

/** One scenario: what it shows, how to try it, then live readouts and actions. */
export function ScenarioPage(props: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly explanation: ReactNode;
}) {
  return (
    <main
      data-testid={`scenario-${props.id}`}
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{props.title}</h1>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          {props.explanation}
        </div>
      </header>
      {props.children}
    </main>
  );
}

export function Panel(props: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        {props.description === undefined ? null : (
          <CardDescription>{props.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {props.children}
      </CardContent>
    </Card>
  );
}

/** A labelled live value; `testId` is what browser automation reads. */
export function Readout(props: {
  readonly label: string;
  readonly testId: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[10rem_1fr] items-baseline gap-3 text-sm">
      <dt className="text-muted-foreground">{props.label}</dt>
      <dd data-testid={props.testId} className="font-mono break-all">
        {props.value}
      </dd>
    </div>
  );
}

export function Readouts(props: { readonly children: ReactNode }) {
  return <dl className="flex flex-col gap-2">{props.children}</dl>;
}

export function Actions(props: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap gap-2">{props.children}</div>;
}
