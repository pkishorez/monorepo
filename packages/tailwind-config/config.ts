import type { Config } from "tailwindcss";

export const tailwindPreset: Config = {
	content: [],
	safelist: [],
	theme: {
		fontSize: {
			xs: pxToRem(12),
			sm: pxToRem(14),
			base: pxToRem(16),
			lg: pxToRem(20),
			h3: pxToRem(24),
			h2: pxToRem(28),
			h1: pxToRem(32),
		},
		fontFamily: {
			baseFont: [
				"system-ui",
				"-apple-system",
				"BlinkMacSystemFont",
				"Segoe UI",
				"Roboto",
				"Helvetica Neue",
				"Arial",
				"Noto Sans",
				"sans-serif",
				"Apple Color Emoji",
				"Segoe UI Emoji",
				"Segoe UI Symbol",
				"Noto Color Emoji",
			],
		},
		fontWeight: {
			normal: "400",
			semibold: "500",
			bold: "600",
		},
		textColor: {
			base: "#fff",
			inverse: "#000",
			mute: "#999",
			highlight: "yellow",
		},
		backgroundColor: {
			base: "#000",
			inverse: "#fff",
			transparent: "transparent",
		},
		borderColor: ({ theme }) => theme("backgroundColor"),
		screens: {
			mobile: "460px",
			tablet: "768px",
			desktop: "1024px",
		},
		dropShadow: ({ theme }) => theme("backgroundColor"),
		maxWidth: ({ theme, breakpoints }) => breakpoints(theme("screens")),
	},
};

function pxToRem(px: number): string {
	return `${px / 16}rem`;
}
