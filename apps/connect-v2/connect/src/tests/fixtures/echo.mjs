import { register } from 'tsx/esm/api';

register();
const { runEcho } = await import('./echo.ts');
runEcho();
