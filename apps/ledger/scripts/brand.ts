// Draws Ledger's icons and Splash into public/ with sharp.
// Run with `pnpm brand` after changing the art; the files are committed.
import { writeBrand } from './brand/index.ts';

await writeBrand(new URL('../public/', import.meta.url));
