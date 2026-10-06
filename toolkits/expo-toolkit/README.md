# @kstackz/expo-toolkit

UI, theme, haptics and sound for native apps built with Expo: owned Panel UI components on Uniwind, styled with Ledger's tokens.

## Big picture

The one Toolkit for native apps built with Expo (the **Expo Toolkit** in the root [`CONTEXT.md`](../../CONTEXT.md)). Ledger's native app (`ledger/expo`) is its first user; it carries Ledger's look to the phone so the web and native apps read as one product.

It is laid out in [Laymos](laymos.config.json) layers, bottom to top: `theme` (Uniwind tokens and Inter), `feedback` (haptics and sound), `input` (touches for `@kstackz/use-gesture`'s core), `components` (Panel UI copies, on `theme`) and `patterns` (whole interactions such as the Thumb Lock's Place Picker, on `components`, `input` and `feedback`). Each layer is a subpath. A later `web-toolkit` (ui-toolkit, pwa-toolkit, use-gesture's web part and use-keys) is meant to copy this shape.

The components are copies of [Panel UI](https://panelui.dev) (MIT, see [`src/components/LICENSE-panelui`](src/components/LICENSE-panelui)), made with its CLI and owned here from then on, as ui-toolkit owns its shadcn copies. `pnpm add-panelui <name...>` copies more: it runs `panelui-cli` in a scratch folder, puts the named components in `src/components` and what they pull in under `src/components/parts` (private), and rewrites their imports. `src/components` is left out of `vp check` and `vp fmt` so copies stay close to upstream.

The package ships TypeScript source; Metro compiles it. `input` and `patterns/*` export nothing yet: they wait on use-gesture's platform-free core and Ledger's native Thumb Lock.

## Install

```sh
pnpm add @kstackz/expo-toolkit
```

Peer dependencies, at Expo SDK 57's versions:

- `react`, `react-native`: the app's React and React Native.
- `uniwind`, `tailwindcss`: every class name resolves through Uniwind's Tailwind 4 pass over the theme.
- `expo-font`: `useThemeFonts` loads Inter with it.
- `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-svg` (optional): needed by `./components/*`.
- `expo-haptics`, `expo-audio` (optional): needed by `./feedback`.

Components also reach `@expo/ui`, `expo-blur` and `react-native-keyboard-controller` when installed (the `native` prop, blurred scrims, keyboard avoidance) and skip them otherwise.

The app's `global.css`, named as Uniwind's `cssEntryFile` in `metro.config.js`:

```css
@import 'tailwindcss';
@import 'uniwind';
@import '@kstackz/expo-toolkit/theme.css';
```

## Exports

### `./theme`

| Export          | What it does                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `useTheme`      | The scheme in use (`light` or `dark`) and a setter that also takes `system`. |
| `useThemeFonts` | Loads the Inter faces the theme names; `true` once text can draw in them.    |
| `cn`            | Merges class names, the later class winning a Tailwind conflict.             |

### `./theme.css`

| Export      | What it does                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------ |
| `theme.css` | Ledger's colour, radius and font tokens in light and dark, and the `@source` for the components. |

### `./feedback`

| Export         | What it does                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `haptic`       | Plays one haptic: `selection`, `light`, `medium`, `heavy`, `success`, `warning` or `error`.           |
| `createSounds` | Loads short sounds into a pool of players each, so `play(name)` starts at once; `release` frees them. |

### `./input`

Nothing yet.

### `./components/*`

| Export                                                | What it does                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `panel-ui-provider`: `PanelUIProvider`                | The root: gesture root, page background, portal host and toasts.            |
| `button`: `Button`                                    | Pressable action with variants, sizes, loading state and icon slots.        |
| `button`: `ButtonGroupProvider`, `useButtonGroup`     | Several buttons drawn as one control.                                       |
| `bottom-sheet`: `BottomSheet`                         | Draggable sheet anchored to the bottom of the screen.                       |
| `bottom-sheet`: `bottomSheetDetentHeight`             | The height a detent resolves to.                                            |
| `card`: `Card`                                        | Content surface with header, body and footer.                               |
| `dialog`: `Dialog`                                    | Modal dialog with a backdrop and footer actions.                            |
| `drawer`: `Drawer`                                    | A panel from an edge of the screen that covers the app until dismissed.     |
| `empty-state`: `EmptyState`                           | Placeholder for a list or screen with no content.                           |
| `field`: `Field`, `useFieldLabelledBy`                | Layout and validation state a form control composes into.                   |
| `icons`: `IconColorProvider`, `useIconColor`, `*Icon` | The Hugeicons set Panel UI uses, tinted from context.                       |
| `input`: `Input`                                      | Text field with label, description and error message.                       |
| `item`: `Item`                                        | Row of media, text and actions, for lists and settings.                     |
| `label`: `Label`                                      | Form label with required, invalid and disabled states.                      |
| `separator`: `Separator`                              | Horizontal or vertical rule, optionally labelled.                           |
| `spinner`: `Spinner`                                  | Indeterminate loading indicator.                                            |
| `swipe`: `Swipe`, `useSwipeGroup`                     | A row that slides aside to reveal its actions (swipe to delete).            |
| `switch`: `Switch`                                    | Animated on/off toggle.                                                     |
| `tabs`: `Tabs`                                        | Segmented, underline or pill tabs with an animated indicator.               |
| `text`: `Text`, `textChildren`                        | Themed text with size, weight and muted; wraps bare strings among children. |
| `toast`: `Toast`, `ToastViewport`, `useToast`         | Transient notification queue with swipe to dismiss.                         |
| `typography`: `Typography`                            | Semantic text presets: headings, paragraphs, code, lists.                   |

`./components/parts/*` is private and not exported.

### `./patterns/*`

`thumb-picker`, `sidebar`, `sheet` and `key-bar` export nothing yet.

## Usage

### A themed screen with feedback

The root layout waits for the fonts and mounts the provider; a screen uses the components and plays a haptic and a sound on a tap. Lifted from `ledger/expo/app`.

```tsx
import { PanelUIProvider } from '@kstackz/expo-toolkit/components/panel-ui-provider';
import { Button } from '@kstackz/expo-toolkit/components/button';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { createSounds, haptic } from '@kstackz/expo-toolkit/feedback';
import { useThemeFonts } from '@kstackz/expo-toolkit/theme';
import { Slot } from 'expo-router';

const sounds = createSounds({ tick: require('../assets/sounds/tick.wav') });

export function Layout() {
  if (!useThemeFonts()) return null;
  return (
    <PanelUIProvider>
      <Slot />
    </PanelUIProvider>
  );
}

export function Home() {
  return (
    <>
      <Text size="3xl" weight="bold">
        Ledger
      </Text>
      <Button
        onPress={() => {
          haptic('light');
          sounds.play('tick');
        }}
      >
        Tap
      </Button>
    </>
  );
}
```

- `theme.css` sets `font-normal` … `font-bold` to Inter faces; `useThemeFonts` registers them under those names.
- `createSounds` loads three players per sound up front and takes them in turn, so a quick repeat overlaps instead of waiting; sounds mix with other apps and stay quiet on silent.
- `haptic` never throws: a device without haptics feels nothing.
