import { beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Setup fake IndexedDB for testing
// This automatically polyfills the global IndexedDB objects
// so that our tests can run in a Node.js environment

// Additional test setup can be added here
beforeEach(() => {
  // Clear any existing databases before each test
  // This ensures test isolation
  if (typeof indexedDB !== 'undefined') {
    // Reset the fake IndexedDB state
    (indexedDB as any)._databases?.clear?.();
  }
});

