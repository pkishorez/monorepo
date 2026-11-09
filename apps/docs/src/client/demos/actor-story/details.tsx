import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@kestack/web-platform/ui/components/dialog';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { whenOf } from './card.tsx';
import { asText, existsIn, LIMIT, pathOf, sourceOf } from './tree.ts';
import type { Node } from './tree.ts';

/*
 * Everything about one Actor, read over the map: what it does, its States,
 * what it gives and needs, its Children and its folder. Closing it, or
 * following a link in it, goes back to the map.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-xs text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Goes({ to, onGo }: { to: Node; onGo: (node: Node) => void }) {
  return (
    <button
      type="button"
      onClick={() => onGo(to)}
      className="cursor-pointer font-medium underline decoration-foreground/30 underline-offset-2 transition-colors duration-150 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50"
    >
      {to.name}
    </button>
  );
}

function CopyText({ node }: { node: Node }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(asText(node)).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex min-h-8 cursor-pointer touch-manipulation items-center gap-1.5 self-start rounded-md text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50 pointer-coarse:min-h-11"
    >
      {done ? (
        <CheckIcon aria-hidden="true" className="size-3.5" />
      ) : (
        <CopyIcon aria-hidden="true" className="size-3.5" />
      )}
      {done ? 'Copied' : 'Copy for an agent'}
    </button>
  );
}

export function Details({
  node,
  open,
  onClose,
  onGo,
}: {
  node: Node;
  open: boolean;
  onClose: () => void;
  onGo: (node: Node) => void;
}) {
  const over = [
    node.states.length > LIMIT ? `${node.states.length} States` : null,
    node.gives.length > LIMIT ? `gives ${node.gives.length}` : null,
    node.children.length > LIMIT ? `${node.children.length} Children` : null,
  ].filter(Boolean);
  const when = whenOf(node);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] gap-5 overflow-y-auto sm:max-w-xl">
        <header className="flex flex-col gap-1.5 pr-8">
          <p className="text-xs break-words text-muted-foreground">
            {pathOf(node)
              .map((at) => at.name)
              .join(' › ')}
          </p>
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            {node.name}
          </DialogTitle>
          {when && <p className="text-xs text-muted-foreground">{when}</p>}
          <DialogDescription className="text-base leading-relaxed text-pretty text-foreground">
            {node.says}
          </DialogDescription>
          {node.story && (
            <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
              {node.story}
            </p>
          )}
        </header>

        {node.states.length > 0 && (
          <Section title="States">
            <ul className="grid gap-2 text-sm">
              {node.states.map((state) => {
                const gone = node.children.filter(
                  (child) => !existsIn(child, state.name),
                );
                return (
                  <li key={state.name} className="text-pretty">
                    <span className="font-medium">{state.name}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      {state.says}
                      {gone.length > 0 &&
                        ` ${gone.map((child) => child.name).join(' and ')} ${
                          gone.length === 1 ? 'does' : 'do'
                        } not exist here.`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {node.gives.length > 0 && (
          <Section title="Gives to everything below">
            <ul className="grid gap-1 text-sm">
              {node.gives.map((given) => (
                <li key={given.name}>
                  <span className="font-medium">{given.name}</span>
                  <span className="text-muted-foreground"> {given.says}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {node.needs.length > 0 && (
          <Section title="Needs from above">
            <ul className="grid gap-1 text-sm">
              {node.needs.map((need) => {
                const source = sourceOf(node, need);
                return (
                  <li key={need}>
                    <span className="font-medium">{need}</span>
                    <span className="text-muted-foreground"> from </span>
                    {'node' in source ? (
                      <Goes to={source.node} onGo={onGo} />
                    ) : (
                      <span className="text-muted-foreground">
                        {source.text}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {node.children.length > 0 && (
          <Section title="Its parts">
            <ul className="grid gap-1 text-sm">
              {node.children.map((child) => (
                <li key={child.id} className="text-pretty">
                  <Goes to={child} onGo={onGo} />
                  <span className="text-muted-foreground">
                    {' '}
                    {child.question}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {node.folder && (
          <Section title="In the code">
            <code className="text-[13px] break-all">
              src/app/{node.folder === '.' ? '' : `${node.folder}/`}
            </code>
            {node.parts.map((part) => (
              <p key={part.name} className="text-sm text-pretty">
                <code className="text-[13px]">{part.name}</code>
                <span className="text-muted-foreground"> {part.says}</span>
              </p>
            ))}
          </Section>
        )}

        {over.length > 0 && (
          <Section title="Load">
            <p className="text-sm text-pretty">
              <span className="font-medium text-[var(--field-accent)]">
                {over.join(', ')}.
              </span>{' '}
              <span className="text-muted-foreground">
                Above the limit of {LIMIT}, and no reason is written yet.
              </span>
            </p>
          </Section>
        )}

        <CopyText node={node} />
      </DialogContent>
    </Dialog>
  );
}
