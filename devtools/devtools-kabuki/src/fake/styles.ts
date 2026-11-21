/*
 * The bubble's own styles, shipped in its code. It is drawn in a Shadow
 * DOM, so these reach nothing of the app's, and `all: initial` on the host
 * keeps the app's inherited styles out. Colors are the Web Platform
 * theme's neutrals, each `light-dark()`: the bubble follows the page's
 * `color-scheme`, as the theme sets it, and is light without one.
 */

export const css = `
:host {
  all: initial;
  color-scheme: inherit;
  --bg: light-dark(oklch(1 0 0), oklch(0.205 0 0));
  --fg: light-dark(oklch(0.145 0 0), oklch(0.985 0 0));
  --muted: light-dark(oklch(0.97 0 0), oklch(0.269 0 0));
  --muted-fg: light-dark(oklch(0.556 0 0), oklch(0.708 0 0));
  --border: light-dark(oklch(0.922 0 0), oklch(1 0 0 / 12%));
  --accent: light-dark(oklch(0.55 0.2 290), oklch(0.72 0.16 290));
  --on-accent: light-dark(oklch(1 0 0), oklch(0.145 0 0));
  --good: light-dark(oklch(0.52 0.14 150), oklch(0.75 0.15 150));
  --bad: light-dark(oklch(0.55 0.2 27), oklch(0.7 0.19 22));
  --mid: light-dark(oklch(0.6 0.13 70), oklch(0.8 0.14 80));
  --radius: 10px;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
.root {
  font: 12px/1.45 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--fg);
}
button, input, select, textarea { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.bubble {
  position: fixed;
  z-index: 2;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 4px 16px oklch(0 0 0 / 25%);
  cursor: grab;
  touch-action: none;
  user-select: none;
  display: grid;
  place-items: center;
  font-weight: 700;
  letter-spacing: 0.02em;
  padding: 0;
}
.bubble:active { cursor: grabbing; }
.bubble[aria-expanded='true'] { box-shadow: 0 0 0 3px var(--bg), 0 0 0 5px var(--accent); }

.panel {
  position: fixed;
  z-index: 1;
  top: 12px;
  bottom: 12px;
  width: min(460px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 12px 40px oklch(0 0 0 / 30%);
  overflow: hidden;
}
.panel[data-side='right'] { right: 12px; }
.panel[data-side='left'] { left: 12px; }
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.head h2 { margin: 0; font-size: 13px; flex: 1; }
.body { overflow: auto; padding: 8px 12px 16px; flex: 1; }

.button {
  border: 1px solid var(--border);
  background: var(--muted);
  border-radius: 6px;
  padding: 3px 9px;
  cursor: pointer;
}
.button:hover { border-color: var(--muted-fg); }
.button.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.button.danger { color: var(--bad); }

section.fake { margin: 8px 0 14px; }
section.fake > h3 { margin: 0 0 4px; font-size: 13px; }
details { margin: 2px 0; }
summary { cursor: pointer; padding: 2px 0; }
summary::marker { color: var(--muted-fg); }
.instance { border-left: 1px solid var(--border); padding-left: 10px; margin-left: 2px; }
.instance > summary { font-weight: 600; }
.key { color: var(--accent); font-weight: 600; }
.slot, .note { color: var(--muted-fg); font-weight: 400; }
.tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--muted);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 500;
}
.label { margin: 6px 0 2px; color: var(--muted-fg); font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }

.json { font-family: var(--mono); font-size: 11px; }
.json ul { list-style: none; margin: 0; padding-left: 14px; }
.json li > details { display: inline-block; vertical-align: baseline; }
.json .k { color: var(--muted-fg); }
.json .string { color: var(--good); }
.json .number, .json .boolean { color: var(--accent); }
.json .null { color: var(--muted-fg); }

.control > summary { color: var(--fg); }
form { display: grid; gap: 6px; margin: 4px 0 8px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; background: var(--muted); }
.field { display: grid; gap: 2px; }
.field.check { display: flex; align-items: center; gap: 6px; }
.field label { font-weight: 500; }
.field input:not([type='checkbox']), .field select, .field textarea {
  width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
}
.field textarea { font-family: var(--mono); min-height: 3.5em; resize: vertical; }
.actions { display: flex; align-items: center; gap: 8px; }

.result { font-size: 11px; font-weight: 600; }
.result.handled { color: var(--good); }
.result.ignored, .result.queued { color: var(--mid); }
.result.refused, .result.error { color: var(--bad); }

.log { list-style: none; margin: 0; padding: 0; }
.log li { padding: 4px 0; border-bottom: 1px solid var(--border); display: grid; gap: 2px; }
.log .when { color: var(--muted-fg); font-family: var(--mono); font-size: 11px; }
.log code { font-family: var(--mono); font-size: 11px; word-break: break-all; }
.empty { color: var(--muted-fg); font-style: italic; }
`;
