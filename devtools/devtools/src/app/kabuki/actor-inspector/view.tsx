import { View } from '@kestack/kabuki/react';
import { InspectorView } from '@kestack/devtools-kabuki/inspector';
import { RemoteInspectorLive } from './actor.js';

/* The Inspector filling what holds it, laid out by its own width. */

export const RemoteInspectorView = View.make(
  RemoteInspectorLive,
  ({ children }) => (
    <div className="@container relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <InspectorView instance={children.inspector} />
    </div>
  ),
);
