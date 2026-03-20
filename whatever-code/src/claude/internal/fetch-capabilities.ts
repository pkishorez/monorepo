import { Effect } from "effect";

export interface SessionCapabilities {
  models: {
    value: string;
    displayName: string;
    description: string;
  }[];
  commands: {
    name: string;
    description: string;
    argumentHint: string;
  }[];
}

const MODELS: SessionCapabilities["models"] = [
  {
    value: "claude-opus-4-6",
    displayName: "Opus 4.6",
    description: "Most capable model for complex tasks",
  },
  {
    value: "claude-sonnet-4-6",
    displayName: "Sonnet 4.6",
    description: "Best balance of speed and capability",
  },
  {
    value: "claude-haiku-4-5-20251001",
    displayName: "Haiku 4.5",
    description: "Fastest model for simple tasks",
  },
];

export const fetchSessionCapabilities = (_absolutePath: string) =>
  Effect.succeed<SessionCapabilities>({ models: MODELS, commands: [] });
