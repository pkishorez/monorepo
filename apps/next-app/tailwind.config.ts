import { tailwindPreset } from "@pkg/tailwind";

const config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",

    // For all components.
    "./node_modules/@pkg/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  presets: [tailwindPreset],
};

export default config;
