import {
  defineSandbox,
  SandboxCapability,
  withSandbox,
} from '@tanstack/ai-sandbox';
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process';

export const sandboxMiddlewareFor = (workingDirectory: string) => {
  const middleware = withSandbox(
    defineSandbox({
      id: 'local-process',
      provider: localProcessSandbox({ dir: workingDirectory }),
      fileEvents: false,
    }),
  );

  return {
    ...middleware,
    provides: [SandboxCapability],
  };
};
