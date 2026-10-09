import { View } from 'effect-oak/react';
import { ColorField, ContentField, Preview } from './fields/index.js';
import { WebComponents } from './web-components.js';

export const WebComponentsView = View.make(WebComponents, ({ model, send }) => (
  <div className="size-full overflow-y-auto p-6">
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Pattern Designer</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Two custom elements written by hand for this demo.{' '}
          <code>&lt;oak-color-picker&gt;</code> fires <code>color-changed</code>{' '}
          events that the View Sends as Messages;{' '}
          <code>&lt;oak-pixel-badge&gt;</code> takes properties (
          <code>value</code>, <code>fill</code>, <code>background</code>,{' '}
          <code>size</code>) that React sets from the Model.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 rounded-xl border p-6 md:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-5">
          <ContentField
            value={model.content}
            onChange={(value) => send({ _tag: 'UpdatedContent', value })}
          />
          <ColorField
            id="fill-color"
            label="Fill color"
            value={model.fill}
            onChange={(value) => send({ _tag: 'ChangedFillColor', value })}
          />
          <ColorField
            id="background-color"
            label="Background color"
            value={model.background}
            onChange={(value) =>
              send({ _tag: 'ChangedBackgroundColor', value })
            }
          />
        </div>
        <Preview
          value={model.content}
          fill={model.fill}
          background={model.background}
        />
      </div>
    </div>
  </div>
));
