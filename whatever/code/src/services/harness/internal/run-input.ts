import type { UIMessage } from '@tanstack/ai';
import type { RunConfigurationInput } from '../../../domain/run/index.js';

export interface StartHarnessRunInput {
  threadId: string;
  runId: string;
  workingDirectory: string;
  sessionId: string | null;
  configuration: RunConfigurationInput;
  message: UIMessage;
}

export type HarnessRunInputFor<Tag extends RunConfigurationInput['_tag']> =
  Omit<StartHarnessRunInput, 'configuration'> & {
    configuration: Extract<RunConfigurationInput, { _tag: Tag }>;
  };
