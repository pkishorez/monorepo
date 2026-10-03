import { createFileRoute } from '@tanstack/react-router';
import { Workspace } from '../client/features/studio/workspace/index.ts';

/** The studio needs WebGPU, a microphone and a worker: browser only. */
export const Route = createFileRoute('/')({
  ssr: false,
  component: Workspace,
});
