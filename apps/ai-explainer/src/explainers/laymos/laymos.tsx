import { AbsoluteFill } from 'remotion';
import { defineExplainer } from '../../foundation/explainer/index.ts';
import { script } from './script.ts';
import { voiceover } from './voiceover.ts';

// Draft Scenes: each shows only its narration until the Foundation has Scenes
// of its own to fill.
function draftScene(id: string) {
  const line = script.find((entry) => entry.id === id)!;
  return function DraftScene() {
    return (
      <AbsoluteFill className="items-center justify-center p-40">
        <p className="text-muted-foreground text-2xl uppercase">{id}</p>
        <p className="mt-6 text-center text-5xl leading-tight">{line.say}</p>
      </AbsoluteFill>
    );
  };
}

export const laymos = defineExplainer({
  id: 'laymos',
  voiceover,
  scenes: Object.fromEntries(script.map(({ id }) => [id, draftScene(id)])),
});
