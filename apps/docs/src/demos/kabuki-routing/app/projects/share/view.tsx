import { View } from '@kestack/kabuki/react';
import { Button, DialogPanel } from '../../../parts/index.ts';
import { ShareActor } from './share.ts';

export const ShareView = View.make(ShareActor, ({ model, send, root }) => (
  <div {...root} className="contents">
    <DialogPanel title="Share project" onClose={() => send({ _tag: 'Closed' })}>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        This dialog has its own URL: reload, or open it in a new tab, and it
        opens again over its project. Escape or Close goes Back if the app came
        from the project.
      </p>
      <div>
        <Button tone="primary" onClick={() => send({ _tag: 'Copied' })}>
          {model.copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </DialogPanel>
  </div>
));
