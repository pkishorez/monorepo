// A Plugin's one file, as Node runs it: the TypeScript is read through tsx.
// It takes two seconds to stop.
import { register } from 'tsx/esm/api';

register();
const { runPing } = await import('./ping.ts');
runPing('slow', 2_000);
