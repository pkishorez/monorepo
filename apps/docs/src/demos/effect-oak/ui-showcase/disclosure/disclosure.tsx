import { Schema } from 'effect';
import { Node } from 'effect-oak';
import { View } from 'effect-oak/react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@kstackz/web-platform/components/utils';

/*
 * A disclosure as a Node: open or closed, and nothing else. It reports
 * nothing up; whether it is open matters only to itself.
 *
 * The panel stays drawn while closed, `inert` and folded to no height, so
 * opening and closing animate with a CSS grid-rows transition. A `preview`
 * disclosure folds to a few lines instead, and its button sits below the
 * text, saying Read more or Show less.
 */

type Options = {
  readonly id: string;
  readonly title: string;
  readonly body: ReactNode;
  readonly preview?: boolean;
};

const make = (options: Options) => {
  const panel = `${options.id}-panel`;

  const Disclosure = Node.make(`Disclosure(${options.id})`, {
    model: Schema.Struct({ open: Schema.Boolean }),
    message: Schema.TaggedUnion({ Toggled: {} }),
  }).build({
    init: () => ({ model: { open: false } }),
    update: { Toggled: (_, { model }) => ({ model: { open: !model.open } }) },
  });

  const DisclosureView = View.make(Disclosure, ({ model, send }) => {
    const button = (label: ReactNode) => (
      <button
        type="button"
        aria-expanded={model.open}
        aria-controls={panel}
        className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-medium"
        onClick={() => send({ _tag: 'Toggled' })}
      >
        {label}
      </button>
    );
    const body = (
      <div
        id={panel}
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          model.open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div
          className={cn(
            'overflow-hidden text-sm text-muted-foreground',
            options.preview && 'min-h-15',
          )}
          inert={!options.preview && !model.open}
        >
          {options.body}
        </div>
      </div>
    );
    return (
      <div className="max-w-lg rounded-lg border px-4 py-2">
        {options.preview ? (
          <>
            <h4 className="py-2 text-sm font-medium">{options.title}</h4>
            {body}
            {button(model.open ? 'Show less' : 'Read more')}
          </>
        ) : (
          <>
            {button(
              <>
                {options.title}
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform',
                    model.open && 'rotate-180',
                  )}
                />
              </>,
            )}
            {body}
          </>
        )}
      </div>
    );
  });

  return { Disclosure, DisclosureView };
};

export { make as makeDisclosure };
