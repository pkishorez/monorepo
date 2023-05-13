import { tailwindPreset } from "@pkg/tailwind";
import type {Config} from 'tailwindcss'

const config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",

    // For all components.
    "./node_modules/@pkg/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      textColor: {
        base: "#000",
        inverse: "#fff",
        mute: "#999",
        highlight: "yellow",
      },
      backgroundColor: {
        base: "#fff",
        inverse: "#000",
        transparent: "transparent",
      },
    },
  },
  presets: [tailwindPreset],
} satisfies Config;

export default config;
