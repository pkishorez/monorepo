/// <reference types="vite/client" />

/* Where the ai-toolkit server is; Vite inlines it. */
interface ImportMetaEnv {
  readonly VITE_AI_URL?: string;
}
