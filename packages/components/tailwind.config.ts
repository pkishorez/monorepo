import { tailwindPreset } from "@pkg/tailwind";
import type {Config} from 'tailwindcss'

export default {
  content: ["./**/*.{ts,tsx}"],
  presets: [tailwindPreset],
} satisfies Config;
