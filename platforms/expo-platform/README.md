# @kstackz/expo-platform

The Expo Platform: a native app from one config, its APIs on a cloud or a device Backend, several Accounts with one Session each and the screens before sign-in; plus owned Panel UI components on Uniwind, styled with web-platform's tokens, gestures, haptics and Recipes.

## Big picture

The Platform for native apps built with Expo (the **Expo Platform** in the root [`CONTEXT.md`](../../CONTEXT.md)). Ledger's native app (`ledger/expo`) is its first user; it carries Ledger's look to the phone so the web and native apps read as one product. It replaces `@kstackz/expo-toolkit`.

The root door is `createApp`. It hands one config to [`@kstackz/platform-toolkit`](../../toolkits/platform-toolkit)'s `createApp` with `expoHost` (expo-sqlite for tables and Std Sync, sign-in as the app's First-Party OAuth client in the system sign-in sheet, expo-network and AppState) and gives back `Root`, which goes around the whole app and asks who signs in to the device Backend, and `SignedIn`, which shows the screens before an Account is open (the Gate Screens and Account Lost recipes). It is the same app the Web Platform's `createApp` gives, on a phone. Why the Platforms may break while the Toolkits keep what persists is [ADR 0006](../../docs/adr/0006-platforms-may-break-toolkits-keep-what-persists.md).

Underneath, it is laid out in [Laymos](laymos.config.json) layers, bottom to top: `theme` (Uniwind tokens and Inter), `feedback` (haptics), `input` (touches for `@kstackz/use-gesture`'s core), `components` (Panel UI copies, on `theme`, and on `input` for a row that scrolls sideways) and `recipes` (whole interactions such as the Thumb Lock's Place Picker, on `components`, `input` and `feedback`). Each layer is a subpath. `@kstackz/web-platform` has the same shape for the web.

The components are copies of [Panel UI](https://panelui.dev) (MIT, see [`src/components/LICENSE-panelui`](src/components/LICENSE-panelui)), made with its CLI and owned here from then on, as web-platform owns its shadcn copies. `pnpm add-panelui <name...>` copies more: it runs `panelui-cli` in a scratch folder, puts the named components in `src/components` and what they pull in under `src/components/parts` (private), and rewrites their imports. `src/components` is left out of `vp check` and `vp fmt` so copies stay close to upstream.

The package ships TypeScript source; Metro compiles it.

## Install

```sh
pnpm add @kstackz/expo-platform
```

Peer dependencies, at Expo SDK 57's versions:

- `@kstackz/platform-toolkit`: `createApp` runs on its `createApp`, the Gate and the Session; the root door re-exports its `Api`, `defineSession` and `SessionClosed`.
- `@kstackz/auth-toolkit`: `expoHost` signs in with its `oauth` and `manageAccounts` from `client/expo`, which need `expo-auth-session`, `expo-secure-store` and `expo-web-browser`.
- `@kstackz/std-toolkit`: `expoHost` keeps tables and Std Sync in its SQLite adapters.
- `effect`: the Host's Storage and Sign-in are Effect Layers.
- `expo-sqlite`: each table and every Std Sync is a SQLite file on the phone.
- `expo-linking`: the OAuth redirect address, and `?backend=` in the launch link.
- `expo-network`: whether the phone is online.
- `react`, `react-native`: the app's React and React Native.
- `uniwind`, `tailwindcss`: every class name resolves through Uniwind's Tailwind 4 pass over the theme.
- `expo-font`: `useThemeFonts` loads Inter with it.
- `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-svg` (optional): needed by `./components/*`.
- `expo-haptics` (optional): needed by `./feedback`.
- `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets` (optional): needed by `./input`, which also depends on `@kstackz/use-gesture`'s core.
- `expo-blur` (optional): the Thumb Picker blurs what is behind it.

Components also reach `@expo/ui`, `expo-blur` and `react-native-keyboard-controller` when installed (the `native` prop, blurred scrims, keyboard avoidance) and skip them otherwise.

The app's `global.css`, named as Uniwind's `cssEntryFile` in `metro.config.js`:

```css
@import 'tailwindcss';
@import 'uniwind';
@import '@kstackz/expo-platform/theme.css';
```

## Exports

### `.`

| Export          | What it does                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `createApp`     | A native app from one config: its APIs, device Backend and Cache, and with `auth` its Accounts; returns `Root`, `SignedIn` and hooks. |
| `expoHost`      | A phone as an app's Host: SQLite tables and Std Sync, OAuth sign-in in the system sheet, the network and the foreground.              |
| `Api.http`      | Declares an API reached over HTTP, from platform-toolkit.                                                                             |
| `Api.websocket` | Declares an API reached over a WebSocket, from platform-toolkit.                                                                      |
| `defineSession` | Writes an app's Session once over its APIs, from platform-toolkit.                                                                    |
| `SessionClosed` | Error a run rejects with when its Session closed first, from platform-toolkit.                                                        |

### `./theme`

| Export          | What it does                                                                 |
| --------------- | ---------------------------------------------------------------------------- |
| `useTheme`      | The scheme in use (`light` or `dark`) and a setter that also takes `system`. |
| `setTheme`      | Uses a theme from now on, outside React too, as to restore a saved one.      |
| `useThemeFonts` | Loads the Inter faces the theme names; `true` once text can draw in them.    |
| `cn`            | Merges class names, the later class winning a Tailwind conflict.             |

### `./theme.css`

| Export      | What it does                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `theme.css` | The web theme's colour, radius and font tokens in light and dark, and the `@source` for the components. |

### `./feedback`

| Export   | What it does                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `haptic` | Plays one haptic: `selection`, `soft`, `light`, `rigid`, `medium`, `heavy`, `success`, `warning` or `error`, never throws. |

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

### `./recipes/*`

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
| `gate-screens`: `GateScreens`              | Every screen before an Account is open, in one card: checking, opening, signing out, signed out, unopenable.          |
| `account-lost`: `AccountLost`              | Holds the app on an Account Lost until the User signs in to it again or opens another Account.                        |

## Usage

### A native app from one config

`app.ts` makes the app once; the root layout wraps everything in `Root`, and the Shell puts what needs an Account under `SignedIn`. From `ledger/expo`'s `src/ledger/app.ts`, `app/_layout.tsx` and `src/screens/shell/shell.tsx`.

```tsx
// src/ledger/app.ts
import { createApp } from '@kstackz/expo-platform';
export const app = createApp({
  name: 'ledger',
  title: 'Ledger',
  description: 'Write down what you spend and earn, and see where it goes.',
  mark: createElement(LedgerMark),
  apiUrl, // where the cloud Backend's APIs answer: a phone has no origin
  apis,
  device,
  cache: ledgerCache,
  auth: { url: authUrl, clientId: 'ledger', resource, session: ledgerSession },
});
export const { Root, SignedIn, useAccounts, useGate } = app;

// app/_layout.tsx
export default function Layout() {
  if (!useThemeFonts()) return null;
  return (
    <GestureHandlerRootView className="flex-1">
      <PanelUIProvider>
        <Root>
          <Shell>
            <Slot />
          </Shell>
        </Root>
      </PanelUIProvider>
    </GestureHandlerRootView>
  );
}

// src/screens/shell/shell.tsx
export function Shell(props: { readonly children: ReactNode }) {
  return (
    <SignedIn>
      <PortalScope>
        <Frame>{props.children}</Frame>
      </PortalScope>
    </SignedIn>
  );
}
```

- On the cloud Backend a User signs in through the system sign-in sheet as the app's First-Party Client (`clientId`), with tokens in secure storage; each call carries an Access Token for `resource`.
- `Root` shows the named sign-in sheet when someone adds an Account on the device Backend. `exp://.../--/?backend=device` starts on it.
- `SignedIn` renders its children while an Account is open, and otherwise the Gate Screens or Account Lost. Everything inside remounts on an Account Switch.

### A Sidebar beside a signed-in app

`SidebarProvider` wraps the page and draws the Sidebar under it, inside `SignedIn`, so its rows can read the signed-in User. Lifted from `ledger/expo/src/screens/shell`.

```tsx
import { PortalScope } from '@kstackz/expo-platform/components/portal-scope';
import {
  Sidebar,
  SidebarProvider,
  useSidebar,
} from '@kstackz/expo-platform/recipes/sidebar';

function Shell(props: { children: ReactNode }) {
  return (
    <SignedIn>
      <PortalScope>
        <SidebarProvider>
          <Header />
          {props.children}
          <Sidebar header={<UserSwitcher />} footer={<SettingsRow />}>
            <PlaceRows />
          </Sidebar>
        </SidebarProvider>
      </PortalScope>
    </SignedIn>
  );
}

function Header() {
  const { toggle } = useSidebar();
  return <Pressable accessibilityLabel="Open the sidebar" onPress={toggle} />;
}
```

- `Sidebar` renders nothing where it is written; it hands what it shows to `SidebarProvider`, which draws it under the page. As it opens the page moves aside, shrinks, rounds and dims, as on the web's phone layout; a tap on the page or a drag left shuts it.
- Inside a `GestureSurface`, `<SidebarSwipe />` opens it from a one-finger swipe right anywhere, following the finger on the UI thread; `onSwiped` hears whether it let go open. A `GestureZone` inside (such as `Pages`) or a `NativeScroll` gets first claim on the swipes it wants; a swipe from the left edge is always the Sidebar's.
- Overlays render into the nearest portal host; `PanelUIProvider`'s sits above every app provider, so a `PortalScope` inside them keeps their context.
