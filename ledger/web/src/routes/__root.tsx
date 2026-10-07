import { createRootRoute } from '@tanstack/react-router';
import { app } from '../app.ts';
import appCss from '../styles.css?url';

// Ledger's document, in its Theme, as a PWA: everything the Web Platform
// gives every app.
export const Route = createRootRoute(app.root({ stylesheet: appCss }));
