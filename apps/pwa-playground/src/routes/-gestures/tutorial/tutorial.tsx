import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from 'kui-toolkit/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from 'kui-toolkit/components/ui/dialog';
import type { ReactNode } from 'react';
import { CodeBlock } from './code-block.tsx';

/** One demo's guide: what to try, how it works, its real code, how it animates. */
export type Tutorial = {
  readonly title: string;
  /** What the screen is, in a sentence. */
  readonly summary: string;
  /** Each gesture on the screen and what it should do. */
  readonly tryThis: ReadonlyArray<{
    readonly gesture: string;
    readonly result: string;
  }>;
  /** Plain steps: which hook, which zone, bubbling, edges, scroll ends. */
  readonly howItWorks: ReadonlyArray<ReactNode>;
  /** The demo's gesture wiring, imported with `?raw` so it cannot drift. */
  readonly code: string;
  /** How the motion values flow from finger to spring. */
  readonly animation: ReadonlyArray<ReactNode>;
};

function Steps(props: { readonly steps: ReadonlyArray<ReactNode> }) {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-pretty">
      {props.steps.map((step, index) => (
        <li key={index}>{step}</li>
      ))}
    </ol>
  );
}

/**
 * The guide for the current demo in a dialog: four sections in an
 * accordion, the first open. Controlled, so the lab's `?` button opens it.
 */
export function TutorialDialog(props: {
  readonly tutorial: Tutorial;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { tutorial } = props;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        data-testid="lab-tutorial"
        className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle>{tutorial.title}</DialogTitle>
          <DialogDescription>{tutorial.summary}</DialogDescription>
        </DialogHeader>
        <Accordion
          defaultValue={['try']}
          className="min-h-0 overflow-y-auto overscroll-contain"
        >
          <AccordionItem value="try">
            <AccordionTrigger>Try this</AccordionTrigger>
            <AccordionContent>
              <ul className="flex flex-col gap-2">
                {tutorial.tryThis.map((step) => (
                  <li key={step.gesture} className="flex flex-col text-pretty">
                    <span className="font-medium">{step.gesture}</span>
                    <span className="text-muted-foreground">{step.result}</span>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="how">
            <AccordionTrigger>How it works</AccordionTrigger>
            <AccordionContent>
              <Steps steps={tutorial.howItWorks} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="code">
            <AccordionTrigger>The code</AccordionTrigger>
            <AccordionContent>
              <CodeBlock code={tutorial.code} />
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="animation">
            <AccordionTrigger>The animation</AccordionTrigger>
            <AccordionContent>
              <Steps steps={tutorial.animation} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </DialogContent>
    </Dialog>
  );
}
