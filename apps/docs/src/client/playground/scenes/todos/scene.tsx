import { useMemo, useRef } from 'react';
import { lighting } from '@kestack/dune';
import { HtmlCanvas, type HtmlCanvasHandle } from '@kestack/dune/react';
import { Stage, useLighting } from '../../kit/index.ts';
import { TodosApp } from './app.tsx';
import { TimelineContext } from './timeline.tsx';

const CODE = `
// The whole app, real React, drawn under the lighting.
<HtmlCanvas effect={lighting({ ambient: 0.7 })}>
  <TodosApp />
</HtmlCanvas>

// The Add button gives off light while there is text to add.
<Lamp color="#f67f2f" intensity={text ? 1.4 : 0.3}>
  <button type="submit">Add</button>
</Lamp>

// Every change is a Message in Kabuki's History:
runtime.show(step);`;

export function TodosScene() {
  const canvas = useRef<HtmlCanvasHandle>(null);
  const light = useLighting();
  const runtime = TodosApp.useRuntime();
  const { shown, branch } = runtime;
  const timeline = useMemo(
    () => ({ runtime, shown, branch }),
    [runtime, shown, branch],
  );

  return (
    <Stage
      canvas={canvas}
      title="To-dos"
      blurb="A to-do list on a Kabuki Actor, drawn under the lighting: real inputs and buttons, lit by the pointer, with the Add button as a lamp. Every change is kept, so you can step back through them and carry on from any one."
      tryThis={[
        'Move the pointer around: cards cast shadows away from it.',
        'Type in the field: the Add button lights up what is around it.',
        'Click a to-do to complete it: the tick draws, then it leaves the tab.',
        'Step back with ‹ by the tabs, then Fork to carry on from there.',
      ]}
      code={CODE}
      controls={light.controls}
    >
      <HtmlCanvas
        ref={canvas}
        effect={lighting(light.values)}
        contentClassName="p-8"
      >
        <TimelineContext.Provider value={timeline}>
          <TodosApp />
        </TimelineContext.Provider>
      </HtmlCanvas>
    </Stage>
  );
}
