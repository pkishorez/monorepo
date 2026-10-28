// `ke-connect` from tsc's build, not the bundle, so that in development
// Node's `--conditions` still pick auth-toolkit's Fake. Users run bin/.
import { main } from '../dist/connection/index.js';

main();
