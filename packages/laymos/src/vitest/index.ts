import type { StoryArtifact } from '../story/artifact/index.js';

export function story(name: string, body: () => void): void {
  void name;
  void body;
  throw new Error('not implemented');
}

export function path(name: string, body: () => void | Promise<void>): void {
  void name;
  void body;
  throw new Error('not implemented');
}

export function storyPreset(): Record<string, unknown> {
  throw new Error('not implemented');
}

export class StoryReporter {
  onTestRunEnd(): void {
    throw new Error('not implemented');
  }
}

export function runStory(
  name: string,
): Promise<{ passed: boolean; artifact: StoryArtifact }> {
  void name;
  return Promise.reject(new Error('not implemented'));
}
