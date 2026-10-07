# Native feel is a kui block tied to TanStack Router and kui styling

> **Status:** withdrawn. The Native block was never finished and was removed from ui-toolkit.

Making a web app feel like an installed mobile app lives in ui-toolkit as the Native block, styled with kui and wired directly to TanStack Router/Start, instead of a separate headless, router-agnostic toolkit. This is our stack, and the value is repeatable results inside it, not portability. Anything PWA-specific (such as making pwa-toolkit's update reload seamless) is a thin enhancement inside pwa-toolkit that depends on the block, never the other way, so there is no cycle.

## Considered Options

- **A new `native-toolkit`** — headless with adapters; rejected as abstraction for portability we don't need.
- **Inside pwa-toolkit** — rejected because a plain browser-tab app benefits too; native feel is UI, not service-worker infrastructure.
