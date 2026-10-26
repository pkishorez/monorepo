// A Plugin's one file, as Node runs it: the TypeScript is read through tsx.
import { register } from 'tsx/esm/api';

register();
const { runFakeCode } = await import('./fake-code.ts');
runFakeCode();
