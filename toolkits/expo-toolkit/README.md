# @kstackz/expo-toolkit

UI, theme, haptics and sound for native apps built with Expo: owned Panel UI components on Uniwind, styled with ui-toolkit's tokens.

## Big picture

The one Toolkit for native apps built with Expo (the **Expo Toolkit** in the root [`CONTEXT.md`](../../CONTEXT.md)). Ledger's native app (`ledger/expo`) is its first user; it carries Ledger's look to the phone so the web and native apps read as one product.

It is laid out in [Laymos](laymos.config.json) layers, bottom to top: `theme` (Uniwind tokens and Inter), `feedback` (haptics and sound), `input` (touches for `@kstackz/use-gesture`'s core), `components` (Panel UI copies, on `theme`, and on `input` for a row that scrolls sideways) and `patterns` (whole interactions such as the Thumb Lock's Place Picker, on `components`, `input` and `feedback`). Each layer is a subpath. A later `web-toolkit` (ui-toolkit, pwa-toolkit, use-gesture's web part and use-keys) is meant to copy this shape.

The components are copies of [Panel UI](https://panelui.dev) (MIT, see [`src/components/LICENSE-panelui`](src/components/LICENSE-panelui)), made with its CLI and owned here from then on, as ui-toolkit owns its shadcn copies. `pnpm add-panelui <name...>` copies more: it runs `panelui-cli` in a scratch folder, puts the named components in `src/components` and what they pull in under `src/components/parts` (private), and rewrites their imports. `src/components` is left out of `vp check` and `vp fmt` so copies stay close to upstream.

The package ships TypeScript source; Metro compiles it.

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
- `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets` (optional): needed by `./input`, which also depends on `@kstackz/use-gesture`'s core.
- `expo-blur` (optional): the Thumb Picker blurs what is behind it.

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
| `setTheme`      | Uses a theme from now on, outside React too, as to restore a saved one.      |
| `useThemeFonts` | Loads the Inter faces the theme names; `true` once text can draw in them.    |
| `cn`            | Merges class names, the later class winning a Tailwind conflict.             |

### `./theme.css`

| Export      | What it does                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `theme.css` | ui-toolkit's colour, radius and font tokens in light and dark, and the `@source` for the components. |

### `./feedback`

| Export         | What it does                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `haptic`       | Plays one haptic: `selection`, `light`, `medium`, `heavy`, `success`, `warning` or `error`.           |
| `createSounds` | Loads short sounds into a pool of players each, so `play(name)` starts at once; `release` frees them. |

### `./input`

| Export              | What it does                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GestureSurface`    | Tracks every finger on its children through one Gesture Handler manual gesture and feeds use-gesture's core.             |
| `GestureZone`       | A Gesture Zone inside a surface: its listener gets first claim on a swipe that starts there, before the zones around it. |
| `NativeScroll`      | A ScrollView in a zone of its own that keeps the swipes it can still scroll and leaves the rest to the zones around it.  |
| `useGesture`        | Hears the nearest surface's touches with a core listener, and returns `claim` to take the touch from the views.          |
| `useWorkletGesture` | Hears the surface's touches on the UI thread, in the frame a finger moves, with a core listener a worklet makes there.   |

### `./components/*`

| Export                                                 | What it does                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `panel-ui-provider`: `PanelUIProvider`                 | The root: gesture root, page background, portal host and toasts.            |
| `button`: `Button`                                     | Pressable action with variants, sizes, loading state and icon slots.        |
| `button`: `ButtonGroupProvider`, `useButtonGroup`      | Several buttons drawn as one control.                                       |
| `bottom-sheet`: `BottomSheet`                          | Draggable sheet anchored to the bottom of the screen.                       |
| `bottom-sheet`: `bottomSheetDetentHeight`              | The height a detent resolves to.                                            |
| `card`: `Card`                                         | Content surface with header, body and footer.                               |
| `choice`: `Choice`                                     | One of a few things as a row of pills that scrolls sideways.                |
| `dialog`: `Dialog`                                     | Modal dialog with a backdrop and footer actions.                            |
| `drawer`: `Drawer`                                     | A panel from an edge of the screen that covers the app until dismissed.     |
| `empty-state`: `EmptyState`                            | Placeholder for a list or screen with no content.                           |
| `field`: `Field`, `useFieldLabelledBy`                 | Layout and validation state a form control composes into.                   |
| `glyph`: `Glyph`                                       | Any Hugeicons drawing the app imports, coloured from context or the theme.  |
| `icons`: `IconColorProvider`, `useIconColor`, `*Icon`  | The Hugeicons set Panel UI uses, tinted from context.                       |
| `input`: `Input`                                       | Text field with label, description and error message.                       |
| `item`: `Item`                                         | Row of media, text and actions, for lists and settings.                     |
| `label`: `Label`                                       | Form label with required, invalid and disabled states.                      |
| `meter`: `Meter`                                       | A thin bar of how full something is, with an optional limit mark.           |
| `portal-scope`: `PortalScope`                          | A portal host inside the app's providers, so overlays keep their context.   |
| `separator`: `Separator`                               | Horizontal or vertical rule, optionally labelled.                           |
| `spinner`: `Spinner`                                   | Indeterminate loading indicator.                                            |
| `swipe`: `Swipe`, `useSwipeGroup`                      | A row that slides aside to reveal its actions (swipe to delete).            |
| `switch`: `Switch`                                     | Animated on/off toggle.                                                     |
| `tabs`: `Tabs`                                         | Segmented, underline or pill tabs with an animated indicator.               |
| `text`: `Text`, `textChildren`                         | Themed text with size, weight and muted; wraps bare strings among children. |
| `toast`: `Toast`, `ToastViewport`, `useToast`, `toast` | Transient notification queue with swipe to dismiss.                         |
| `typography`: `Typography`                             | Semantic text presets: headings, paragraphs, code, lists.                   |

`./components/parts/*` is private and not exported.

### `./patterns/*`

| Export                                     | What it does                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `sidebar`: `SidebarProvider`, `useSidebar` | The page with a Sidebar under it that pushes it aside; whether it is open, and the ways to open, shut and toggle it.  |
| `sidebar`: `Sidebar`                       | What the Sidebar shows: a header, a scrolling body, a foot.                                                           |
| `sidebar`: `SidebarSwipe`                  | Inside a surface, a swipe right of one finger from anywhere opens it under the finger, unless a zone inside wants it. |
| `pages`: `Pages`                           | Pages side by side in a zone of their own, turned by a one-finger sideways swipe that follows the finger.             |
| `thumb-picker`: `ThumbPicker`              | A Thumb Lock that picks from a tree of choices on the UI thread: Steps, Sections, Wrong Way shake.                    |
| `local-sign-in`: `LocalSignIn`             | Asks who to sign in as when sign-in is local: a preset, or an email and name.                                         |
| `sheet`: `Sheet`                           | A sheet from the bottom for a short form, kept above the keyboard.                                                    |
| `swipe-row`: `SwipeRow`                    | A row swiped left to delete: arms past a line, slides away, or springs home.                                          |
| `key-bar`: `KeyBar`                        | A bar at the foot that shows a message for a moment, replaced in place.                                               |

## Usage

### A themed screen with feedback

The root layout waits for the fonts and mounts the provider; a screen uses the components and plays a haptic and a sound on a tap. Lifted from the first `ledger/expo` shell.

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

### A Sidebar beside a signed-in app

`SidebarProvider` wraps the page and draws the Sidebar under it, inside the app's own providers, so its rows can read the signed-in User. Lifted from `ledger/expo/src/screens/shell`.

```tsx
import { PortalScope } from '@kstackz/expo-toolkit/components/portal-scope';
import {
  Sidebar,
  SidebarProvider,
  useSidebar,
} from '@kstackz/expo-toolkit/patterns/sidebar';

function Frame(props: { children: ReactNode }) {
  return (
    <SessionProvider session={session}>
      <PortalScope>
        <SidebarProvider>
          <Header />
          {props.children}
          <Sidebar header={<UserSwitcher />} footer={<SettingsRow />}>
            <PlaceRows />
          </Sidebar>
        </SidebarProvider>
      </PortalScope>
    </SessionProvider>
  );
}

function Header() {
  const { toggle } = useSidebar();
  return <Pressable accessibilityLabel="Open the sidebar" onPress={toggle} />;
}
```

- `Sidebar` renders nothing where it is written; it hands what it shows to `SidebarProvider`, which draws it under the page. As it opens the page moves aside, shrinks, rounds and dims, as on the web's phone layout; a tap on the page or a drag left shuts it.
- Inside a `GestureSurface`, `<SidebarSwipe />` opens it from a one-finger swipe right anywhere, following the finger. A `GestureZone` inside (such as `Pages`) or a `NativeScroll` gets first claim on the swipes it wants; a swipe from the left edge is always the Sidebar's.
- Overlays render into the nearest portal host; `PanelUIProvider`'s sits above every app provider, so a `PortalScope` inside them keeps their context.
