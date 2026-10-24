# @kestack/web-platform

The way to build a kstack app on Kabuki Start in one go: its UI, its PWA, Recipes for whole features, and the app's Document and deploy.

## Big picture

Every kstack web app used to wire the same things by hand: the Document, the Theme, the PWA, the screens and the deploy. This Package holds them for apps on Kabuki Start, so a new app writes only its pages. Kabuki Start serves the app and knows none of this; the Web Platform is where the choices are made ([ADR 0010](../../docs/adr/0010-kabuki-start-serves-the-web-platform-decides.md)). It replaces `@kestack/ui-toolkit` and `@kestack/pwa-toolkit`.

It has four modules, each depending only on the ones before it:

- `ui`: what the user sees and touches: `ui/theme`, `ui/components/*`, `ui/viewers/*`, `ui/form` and `ui/input` (device, gestures, keys, sounds).
- `pwa`: the app installable, working offline and updated in place. `pwa/vite` builds the worker and manifest, `pwa/worker` runs in it, `pwa/rpc/*` talks to it, and `pwa` is the page's side: `PwaHead`, `Pwa`, the Update and Install Prompts and the extras.
- `recipes/*`: whole features built from `ui` and `pwa`: the Frame, the Account Switcher, the Vim status line, Local sign-in, Kabuki's Devtools, the Thumb Picker and swipe rows.
- `app`: putting it together: `app/vite` is the one Vite plugin an app lists, `app/document` the Document it passes to `Start.app`, and `app/alchemy` how it is deployed on its Stages.

Why the Web Platform may break while the Toolkits keep what persists is [ADR 0006](../../docs/adr/0006-platforms-may-break-toolkits-keep-what-persists.md). It ships built `dist/` (from `vp pack`). Terms are in [CONTEXT.md](./CONTEXT.md); the PWA's decisions are in [docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @kestack/web-platform @kestack/auth-toolkit react react-dom @kestack/use-gesture
pnpm add -D @tailwindcss/vite @vitejs/plugin-react
```

An app's stylesheet imports `@kestack/web-platform/ui/theme/global.css`, which also points Tailwind at the Package's own classes. `app/vite` bundles the Package for the server too; an app that lists `start()` and `pwa()` itself adds `@kestack/web-platform` to `ssr.noExternal`.

- `@kestack/auth-toolkit`: `./recipes/account-switcher` follows its `Accounts`, by the sign-in service's cookie or as Fake Accounts.
- `react`, `react-dom`: every component, Recipe and the Document render with React 19.
- `@kestack/use-gesture`: the platform-free gesture core that `./ui/input`'s web gestures and the Thumb Picker run on.
- `@kestack/use-keys` (optional): the Binding and Shortcut types `./ui/input` shows, and the `createKeys` keyboard `./recipes/keyboard` shows. `./ui/theme/global.css` draws every `keys.Surface` from its data attributes, so a `keys.Provider` needs no `appearance` (also alone as `./ui/theme/keys.css`).
- `effect` (optional): the PWA subpaths and the diff and source viewers are built on it.
- `vite` (optional): needed by `./pwa/vite` and `./app/vite`.
- `@tailwindcss/vite`, `@vitejs/plugin-react` (optional): the Tailwind and React plugins `./app/vite` adds.
- `alchemy` (optional): the Cloudflare Website and state `./app/alchemy` deploys with.
- `laymos` (optional): the file diff and change types the diff, git-changes and source-explorer viewers read.
- `use-effect-ts` (optional): runs `./ui/viewers/source-explorer`'s loaders inside React.
- `@kestack/kabuki` (optional): the running app `./recipes/devtools` inspects, the Start parts `./app/document`'s Document draws, the Start app `./pwa/vite` builds beside, and the Actor and View `./recipes/account-switcher` is.

## Exports

### `@kestack/web-platform/ui/theme`

| Export             | What it does                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `createTheme`      | Makes the app's Theme: `useTheme`, the head `Script` that sets it before paint, and the `StatusBar` strip.              |
| `FontPreload`      | Preloads Inter's Latin file from the head, the same file `font-inter.css` uses, so the first paint is already in Inter. |
| `themeFromCookies` | Reads the Theme from a `Cookie` header string; dark when it is missing or unknown.                                      |
| `THEME_COOKIE`     | The cookie's name, `kui-theme`.                                                                                         |

### `@kestack/web-platform/ui/theme/*.css`

| Export           | What it does                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `global.css`     | The one stylesheet to import: Tailwind, the tokens, the `dark`, `keyboard:` and `touch:` variants, and the rest.          |
| `theme.css`      | The design tokens as Tailwind theme variables; included by `global.css`.                                                  |
| `sources.css`    | Points Tailwind at the Package's built components, form, Recipes, client and PWA; included by `global.css`.               |
| `typography.css` | The Tailwind typography plugin; included by `global.css`.                                                                 |
| `shiki.css`      | Dark-theme colors and diff line marks for highlighted code; included by `global.css`.                                     |
| `font-inter.css` | Inter and JetBrains Mono as variable fonts, and `Inter Fallback` sized to Inter's metrics; import it beside `global.css`. |

### `@kestack/web-platform/ui/components/*`

Owned shadcn copies on Base UI, one subpath per file, such as `@kestack/web-platform/ui/components/button`.

| Export                                                                                                                                                                                                                                                                                                   | What it does                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `accordion`: `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`                                                                                                                                                                                                                        | Sections that expand and collapse.                                         |
| `alert-dialog`: `AlertDialog` and its `Trigger`, `Content`, `Header`, `Footer`, `Title`, `Description`, `Media`, `Action`, `Cancel`, `Overlay`, `Portal`                                                                                                                                                 | A modal that asks to confirm or cancel.                                    |
| `alert`: `Alert`, `AlertTitle`, `AlertDescription`, `AlertAction`                                                                                                                                                                                                                                        | An inline message box.                                                     |
| `aspect-ratio`: `AspectRatio`                                                                                                                                                                                                                                                                            | Keeps its content at one width-to-height ratio.                            |
| `attachment`: `Attachment`, `AttachmentGroup`, `AttachmentMedia`, `AttachmentContent`, `AttachmentTitle`, `AttachmentDescription`, `AttachmentActions`, `AttachmentAction`, `AttachmentTrigger`                                                                                                          | A file attachment card with its state and actions.                         |
| `avatar`: `Avatar`, `AvatarImage`, `AvatarFallback`, `AvatarGroup`, `AvatarGroupCount`, `AvatarBadge`                                                                                                                                                                                                    | A user's picture or initials, alone or stacked.                            |
| `badge`: `Badge`, `badgeVariants`                                                                                                                                                                                                                                                                        | A small label, and its classes for other elements.                         |
| `breadcrumb`: `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`                                                                                                                                                          | The path to the current page.                                              |
| `bubble`: `BubbleGroup`, `Bubble`, `BubbleContent`, `BubbleReactions`                                                                                                                                                                                                                                    | Chat bubbles with reactions.                                               |
| `button-group`: `ButtonGroup`, `ButtonGroupSeparator`, `ButtonGroupText`, `buttonGroupVariants`                                                                                                                                                                                                          | Buttons joined into one control.                                           |
| `button`: `Button`, `buttonVariants`                                                                                                                                                                                                                                                                     | A button, and its classes for links that look like one.                    |
| `calendar`: `Calendar`, `CalendarDayButton`                                                                                                                                                                                                                                                              | A month grid for picking dates, on react-day-picker.                       |
| `card`: `Card`, `CardHeader`, `CardFooter`, `CardTitle`, `CardAction`, `CardDescription`, `CardContent`                                                                                                                                                                                                  | A bordered surface with header, body and footer.                           |
| `carousel`: `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext`, `useCarousel`                                                                                                                                                                                             | Slides that scroll sideways, on Embla.                                     |
| `chart`: `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`, `ChartLegendContent`, `ChartStyle`                                                                                                                                                                                      | Recharts wrapped with the Theme's colors.                                  |
| `checkbox`: `Checkbox`                                                                                                                                                                                                                                                                                   | A checkbox.                                                                |
| `collapsible`: `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`                                                                                                                                                                                                                                 | One region that opens and closes.                                          |
| `combobox`: `Combobox`, `ComboboxInput`, `ComboboxContent`, `ComboboxList`, `ComboboxItem`, `ComboboxGroup`, `ComboboxLabel`, `ComboboxCollection`, `ComboboxEmpty`, `ComboboxSeparator`, `ComboboxChips`, `ComboboxChip`, `ComboboxChipsInput`, `ComboboxTrigger`, `ComboboxValue`, `useComboboxAnchor` | A text input that filters a list, with single or chip selection.           |
| `command`: `Command`, `CommandDialog`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandShortcut`, `CommandSeparator`                                                                                                                                               | A searchable command list, inline or in a dialog, on cmdk.                 |
| `context-menu`: `ContextMenu` and its `Trigger`, `Content`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `Label`, `Separator`, `Shortcut`, `Group`, `Portal`, `Sub`, `SubTrigger`, `SubContent`                                                                                                    | A menu opened by right-click or long press.                                |
| `dialog`: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`, `DialogOverlay`, `DialogPortal`                                                                                                                                 | A modal window.                                                            |
| `direction`: `DirectionProvider`, `useDirection`                                                                                                                                                                                                                                                         | Sets and reads left-to-right or right-to-left for the components inside.   |
| `drawer`: `Drawer` and its `Trigger`, `Content`, `Header`, `Footer`, `Title`, `Description`, `Close`, `Overlay`, `Portal`, `SwipeHandle`                                                                                                                                                                 | A panel that slides in from an edge and swipes away.                       |
| `dropdown-menu`: `DropdownMenu` and its `Trigger`, `Content`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `Label`, `Separator`, `Shortcut`, `Group`, `Portal`, `Sub`, `SubTrigger`, `SubContent`                                                                                                  | A menu opened from a button.                                               |
| `empty`: `Empty`, `EmptyHeader`, `EmptyTitle`, `EmptyDescription`, `EmptyContent`, `EmptyMedia`                                                                                                                                                                                                          | What a screen shows when it has nothing yet.                               |
| `field`: `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldLegend`, `FieldSeparator`, `FieldSet`, `FieldContent`, `FieldTitle`                                                                                                                                                | A form control with its label, hint and error.                             |
| `file-tree`: `Tree`, `Folder`, `File`, `CollapseButton`                                                                                                                                                                                                                                                  | A tree of folders and files that expand and collapse.                      |
| `google-button`: `GoogleButton`                                                                                                                                                                                                                                                                          | The "Sign in with Google" button.                                          |
| `hover-card`: `HoverCard`, `HoverCardTrigger`, `HoverCardContent`                                                                                                                                                                                                                                        | A card shown while pointing at a link.                                     |
| `input-group`: `InputGroup`, `InputGroupAddon`, `InputGroupButton`, `InputGroupText`, `InputGroupInput`, `InputGroupTextarea`                                                                                                                                                                            | An input or textarea with text, icons or buttons attached.                 |
| `input-otp`: `InputOTP`, `InputOTPGroup`, `InputOTPSlot`, `InputOTPSeparator`                                                                                                                                                                                                                            | A one-time code entered one character per box.                             |
| `input`: `Input`                                                                                                                                                                                                                                                                                         | A text input.                                                              |
| `item`: `Item`, `ItemMedia`, `ItemContent`, `ItemActions`, `ItemGroup`, `ItemSeparator`, `ItemTitle`, `ItemDescription`, `ItemHeader`, `ItemFooter`                                                                                                                                                      | A list row with media, text and actions.                                   |
| `kbd`: `Kbd`, `KbdGroup`                                                                                                                                                                                                                                                                                 | Keyboard keys as they read on the device.                                  |
| `label`: `Label`                                                                                                                                                                                                                                                                                         | A form label.                                                              |
| `marker`: `Marker`, `MarkerIcon`, `MarkerContent`, `markerVariants`                                                                                                                                                                                                                                      | A short line of status text with an icon.                                  |
| `menubar`: `Menubar` and its `Menu`, `Trigger`, `Content`, `Item`, `CheckboxItem`, `RadioGroup`, `RadioItem`, `Label`, `Separator`, `Shortcut`, `Group`, `Portal`, `Sub`, `SubTrigger`, `SubContent`                                                                                                     | A desktop-style menu bar.                                                  |
| `message-scroller`: `MessageScrollerProvider`, `MessageScroller`, `MessageScrollerViewport`, `MessageScrollerContent`, `MessageScrollerItem`, `MessageScrollerButton`, `useMessageScroller`, `useMessageScrollerScrollable`, `useMessageScrollerVisibility`                                              | A chat list that stays at the newest message and offers a jump back to it. |
| `message`: `MessageGroup`, `Message`, `MessageAvatar`, `MessageContent`, `MessageHeader`, `MessageFooter`                                                                                                                                                                                                | One chat message with its sender.                                          |
| `native-select`: `NativeSelect`, `NativeSelectOption`, `NativeSelectOptGroup`                                                                                                                                                                                                                            | The browser's own select, styled.                                          |
| `navigation-menu`: `NavigationMenu` and its `List`, `Item`, `Trigger`, `Content`, `Link`, `Indicator`, `Positioner`, `navigationMenuTriggerStyle`                                                                                                                                                        | Site navigation with dropdown panels.                                      |
| `pagination`: `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationPrevious`, `PaginationNext`, `PaginationEllipsis`                                                                                                                                                        | Page number links.                                                         |
| `popover`: `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverHeader`, `PopoverTitle`, `PopoverDescription`                                                                                                                                                                                          | Content floating next to its trigger.                                      |
| `progress`: `Progress`, `ProgressTrack`, `ProgressIndicator`, `ProgressLabel`, `ProgressValue`                                                                                                                                                                                                           | A progress bar.                                                            |
| `questionnaire`: `Questionnaire` and its `Item`, `Title`, `Description`, `Choices`, `Choice`, `ChoiceDescription`, `Input`, `Error`, `Progress`, `Actions`, `Previous`, `Next`, `Skip`, `Submit`                                                                                                         | A form asked one question at a time.                                       |
| `radio-group`: `RadioGroup`, `RadioGroupItem`                                                                                                                                                                                                                                                            | One choice out of several.                                                 |
| `resizable`: `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle`                                                                                                                                                                                                                                  | Panels the user resizes by dragging.                                       |
| `scroll-area`: `ScrollArea`, `ScrollBar`                                                                                                                                                                                                                                                                 | A scrolling region with styled scrollbars.                                 |
| `select`: `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectGroup`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton`                                                                                                                     | A styled select.                                                           |
| `separator`: `Separator`                                                                                                                                                                                                                                                                                 | A line between content.                                                    |
| `sheet`: `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`, `SheetClose`                                                                                                                                                                           | A dialog that slides in from a side.                                       |
| `skeleton`: `Skeleton`                                                                                                                                                                                                                                                                                   | A placeholder while content loads.                                         |
| `slider`: `Slider`                                                                                                                                                                                                                                                                                       | A value picked by dragging.                                                |
| `sonner`: `Toaster`, `toast`                                                                                                                                                                                                                                                                             | Toasts on sonner, and the function that shows one.                         |
| `spinner`: `Spinner`                                                                                                                                                                                                                                                                                     | A loading spinner.                                                         |
| `switch`: `Switch`                                                                                                                                                                                                                                                                                       | An on/off switch.                                                          |
| `table`: `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableHead`, `TableRow`, `TableCell`, `TableCaption`                                                                                                                                                                                        | A data table.                                                              |
| `tabs`: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `tabsListVariants`                                                                                                                                                                                                                             | Tabbed panels.                                                             |
| `textarea`: `Textarea`                                                                                                                                                                                                                                                                                   | A multi-line text input.                                                   |
| `toast`: `Toaster`, `Toast`, `ToastProvider`, `ToastViewport`, `ToastPortal`, `ToastContent`, `ToastTitle`, `ToastDescription`, `ToastAction`, `ToastClose`, `toast`, `createToastManager`, `useToastManager`                                                                                            | Toasts on Base UI, with a manager to show them from anywhere.              |
| `toggle-group`: `ToggleGroup`, `ToggleGroupItem`                                                                                                                                                                                                                                                         | Toggle buttons where one or several are on.                                |
| `toggle`: `Toggle`, `toggleVariants`                                                                                                                                                                                                                                                                     | A button that stays pressed.                                               |
| `tooltip`: `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider`                                                                                                                                                                                                                              | A short hint shown on hover or focus.                                      |

### `@kestack/web-platform/ui/viewers/diff-viewer`

| Export               | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `DiffViewer`         | Shows one file's diff, side by side or unified; its options can be held by the caller to keep. |
| `defaultDiffOptions` | The options a diff opens with: split, unwrapped, both sides, folded.                           |

### `@kestack/web-platform/ui/viewers/file-tree`

| Export          | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| `FileTree`      | Shows a list of file paths as a tree of folders.                |
| `expandAll`     | Every folder path in a list of files, to open the whole tree.   |
| `expandToDepth` | The folder paths no deeper than a given depth.                  |
| `expandTo`      | The folder paths that lead to one file, to reveal it.           |
| `toggleSubtree` | Opens or closes one folder together with every folder under it. |

### `@kestack/web-platform/ui/viewers/git-changes`

| Export               | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `ChangeBadge`        | The `new` or `mod` mark for an added or modified item.                               |
| `ChangesMenu`        | The menu that shows or hides changes and picks the branch they are measured against. |
| `changeSurfaceClass` | Border classes that mark an added or modified surface.                               |
| `defaultGitOptions`  | Changes shown, unchanged items kept.                                                 |
| `uncommittedBaseRef` | The base ref, `HEAD`, that means the working tree's uncommitted changes.             |
| `rollUpChanges`      | Each owner's change status from the files it owns.                                   |
| `changedPathsUnder`  | The changed files under one or more path prefixes.                                   |

### `@kestack/web-platform/ui/viewers/json`

| Export       | What it does                              |
| ------------ | ----------------------------------------- |
| `JsonViewer` | Shows a JSON value as a collapsible view. |
| `JsonTree`   | Shows a JSON value as an expandable tree. |
| `JsonEditor` | Edits JSON text in CodeMirror.            |

### `@kestack/web-platform/ui/viewers/markdown-viewer`

| Export           | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `MarkdownViewer` | Renders Markdown, with GitHub tables and lists, as typography. |

### `@kestack/web-platform/ui/viewers/source-explorer`

| Export           | What it does                                                               |
| ---------------- | -------------------------------------------------------------------------- |
| `SourceExplorer` | A dialog that opens one scope's documentation and files, with their diffs. |

### `@kestack/web-platform/ui/viewers/source-viewer`

| Export         | What it does                                                       |
| -------------- | ------------------------------------------------------------------ |
| `SourceViewer` | Shows highlighted source with line numbers, ranges and diff lines. |

### `@kestack/web-platform/ui/components/hooks/use-element-width`

| Export            | What it does                           |
| ----------------- | -------------------------------------- |
| `useElementWidth` | An element's content width, kept live. |

### `@kestack/web-platform/ui/components/hooks/use-mobile`

| Export         | What it does                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `useIsMobile`  | Whether the screen is phone-sized; wide on the server and during hydration. |
| `MOBILE_QUERY` | The media query `useIsMobile` reads.                                        |

### `@kestack/web-platform/ui/components/hooks/use-scroll`

| Export      | What it does                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `useScroll` | Keeps a scroller pinned to its bottom as content grows, until the user scrolls up; scrolls back on request. |

### `@kestack/web-platform/ui/components/utils`

| Export | What it does                                               |
| ------ | ---------------------------------------------------------- |
| `cn`   | Joins class names and merges conflicting Tailwind classes. |

### `@kestack/web-platform/ui/components/lucide`

| Export | What it does |
| ------ | ------------ |

### `@kestack/web-platform/ui/components/motion`

| Export | What it does |
| ------ | ------------ |

### `@kestack/web-platform/ui/components/scroll-styles`

| Export            | What it does                                                                        |
| ----------------- | ----------------------------------------------------------------------------------- |
| `scrollbarStyles` | Classes for thin scrollbars on devices with a fine pointer.                         |
| `scrollBar`       | The same classes for a `default`, `small` or hidden scrollbar, in one or both axes. |

### `@kestack/web-platform/ui/components/shadow-dom`

| Export           | What it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `ShadowScope`    | Renders its children in a shadow root with the given CSS and a portal container. |
| `useShadowScope` | The shadow root, portal container and Theme of the nearest `ShadowScope`.        |

### `@kestack/web-platform/ui/form`

| Export        | What it does                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useAppForm`  | A TanStack Form hook whose fields come bound to the components: `TextField`, `TextareaField`, `SelectField`, `SwitchField`, `DatePickerField`, and `SubmitButton`. |
| `withForm`    | Builds a piece of form that takes the form as a prop.                                                                                                              |
| `formOptions` | TanStack Form's `formOptions`, to share options between forms.                                                                                                     |

### `@kestack/web-platform/ui/input`

How a person drives the app: the device, touch gestures, keys and sounds.

| Export             | What it does                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `play`             | Plays one short sound made by the browser, such as `tick`, `arm`, `confirm` or `wrong`; the web's twin of haptics.                           |
| `DEVICE_SCRIPT`    | Inline script that marks `<html>` with `data-keyboard` and `data-touch` before the first paint; `./app/document`'s Document already adds it. |
| `useDevice`        | Whether this device has a keyboard, a touch screen or both, live; a key pressed outside a text field turns keyboard on.                      |
| `GestureProvider`  | Follows every touch and pen finger in the Gesture Zones inside it; put one at the app's root.                                                |
| `GestureZone`      | An area where the app may own touch; zones nest, and the browser scrolls when no listener takes the touch.                                   |
| `useGesture`       | Every finger its nearest Gesture Zone hears, with motion values that follow it; never says what the Gesture means.                           |
| `useSwipe`         | The Swipe Recognizer: fingers moving one way, Tracking with motion values, then a Commit or a Cancel.                                        |
| `useSidebar`       | A sidebar that follows a Swipe open from anywhere or an edge, and back, then settles open or closed.                                         |
| `usePullToRefresh` | Pull to refresh: a Swipe down at a list's top, followed with resistance, refreshing past a distance.                                         |
| `BindingKeys`      | A Binding's keys step by step, such as `⌘` `K`, shown only where there is a keyboard unless `always`.                                        |
| `recorded`         | Turns one recorded key press into a Shortcut, with Cmd on a Mac and Ctrl elsewhere as `mod`.                                                 |

### `@kestack/web-platform/pwa`

The PWA on the page.

| Export                  | What it does                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PwaHead`               | The PWA's head tags for a Kabuki Start Document's `head`: the manifest link, the Apple icon and the Build ID.                     |
| `Pwa`                   | Around the app in the Document: registers the worker, shows the Update Prompt while a new version waits, and offers install once. |
| `PwaProvider`           | Registers the worker after mount and gives `usePwa` its Status; `Pwa` renders it.                                                 |
| `pwaHead`               | Head tags: manifest link, Apple icon, and meta tags for the Build ID, build time and commit.                                      |
| `usePwa`                | The Status with `checkForUpdate` and `applyUpdate` (`Unsupported` before mount), and the page's `version`.                        |
| `clearRuntimeCache`     | Deletes every Runtime Cache; works outside `PwaProvider`, for example in sign-out.                                                |
| `UpdatePrompt`          | Persistent toast while an update is ready; accepting it reloads every page into it.                                               |
| `splashHead`            | The iOS startup image tags, one per screen iOS matches.                                                                           |
| `splashScreens`         | Each splash image's size, its `/splash/<w>x<h>.png` path, and the screen it is for, for an app to draw them.                      |
| `useInstall`            | Install state with `prompt` and `dismiss` (remembered 30 days); call it in the root to catch the browser's offer.                 |
| `InstallPrompt`         | Bottom sheet on small screens, corner card on larger ones, manual steps on iOS Safari.                                            |
| `Install`               | The Effect service behind `useInstall`, with its `layer`.                                                                         |
| `InstallState`          | Tagged enum `Unsupported`, `Available`, `ManualIos`, `Installed`, `Dismissed`.                                                    |
| `IosSteps`              | The Share, then Add to Home Screen steps `InstallPrompt` shows on iOS Safari, for an app's own install screen.                    |
| `isIosSafari`           | Whether a `navigator` is Safari on iOS or iPadOS, where install has no API and only those steps work.                             |
| `useOnline`             | Whether the browser is online; `true` before mount.                                                                               |
| `OfflineIndicator`      | "You're offline" pill in a live region, stacked above sheets.                                                                     |
| `Online`                | The Effect service behind `useOnline`, with its `layer`.                                                                          |
| `useDisplayMode`        | The display mode, such as `browser` or `standalone`; `browser` before mount.                                                      |
| `DisplayMode`           | The Effect service behind `useDisplayMode`, with its `layer`.                                                                     |
| `useStoragePersistence` | Persisted flag with `persist` and `estimate`; `null` while unknown.                                                               |
| `StoragePersistence`    | The Effect service behind `useStoragePersistence`, with its `layer`.                                                              |

### `@kestack/web-platform/pwa/vite`

| Export  | What it does                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa`   | Vite plugins that emit the manifest from the app's `name`, pick the Precache, compute the Build ID, build the worker (or the Kill Switch) and add `no-cache` rules to `_headers`. |
| `noPwa` | The Vite plugin for an app that is no PWA: `PwaHead` and `Pwa` draw nothing of their own, and there is no worker or manifest.                                                     |

### `@kestack/web-platform/pwa/worker`

| Export             | What it does                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `runServiceWorker` | Starts the worker; call it once at the top of the entry, optionally with a `layer` such as a Worker Server.       |
| `WorkerHost`       | Service given to that `layer`: the worker's Build ID and a stream of every `message` event that is not a Command. |

### `@kestack/web-platform/pwa/rpc/worker`

| Export               | What it does                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `WorkerServer.layer` | Serves an Effect `RpcGroup` inside the worker; provide its handlers and pass it to `runServiceWorker`. |

### `@kestack/web-platform/pwa/rpc/client`

| Export               | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `WorkerClient.make`  | Scoped Effect that opens this page's Worker Client to the Worker Server.                  |
| `WorkerClient.layer` | The same client as a Layer under your own service tag.                                    |
| `VersionSkew`        | Tagged error a call fails with when the worker belongs to another Build ID than the page. |

### `@kestack/web-platform/recipes/frame`

| Export                                                         | What it does                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppShell`                                                     | The Frame: an optional Sidebar, an optional header with title and actions, the page, with `vim` as a floating window, the same in Vim Mode or out of it, with a status line while it is on, and `column` to wrap the header and page in one element; on a phone the page moves aside under a finger to show the Sidebar. |
| `useAppShell`                                                  | `open`, `setOpen`, `toggle` and `isMobile`, inside an `AppShell`.                                                                                                                                                                                                                                                        |
| `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`     | Labeled groups for custom Sidebar content.                                                                                                                                                                                                                                                                               |
| `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`          | Menu rows; a button shuts the Sidebar when tapped on a phone.                                                                                                                                                                                                                                                            |
| `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton` | Nested menu rows.                                                                                                                                                                                                                                                                                                        |
| `SidebarInput`, `SidebarMenuSkeleton`                          | A search input and a loading row for the Sidebar.                                                                                                                                                                                                                                                                        |

### `@kestack/web-platform/recipes/account-switcher`

The Account Switcher of a Kabuki app: a Child of the root page, its View in the header, and `CurrentAccount` for every page.

| Export                | What it does                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccountSwitcherLive` | The Child to place on the root page, given `maxAccounts`: follows auth-toolkit's `Accounts`, shows a switch once under way 150 ms and for at least 300 ms, and runs switch, add and sign-out one at a time. |
| `AccountSwitcherView` | Its slot in the header, always the width of "Sign in": the button signed out, the Account menu signed in, the remembered avatar or nothing while checking.                                                  |
| `CurrentAccount`      | The Capability the root page Provides with `CurrentAccount.layer`: who is signed in and the switch on screen as a stream, and Requests to sign in, switch and sign out.                                     |

### `@kestack/web-platform/recipes/keyboard`

| Export          | What it does                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KeysStatusBar` | The Vim window's status line for an app's `keys`: the Mode, the path of Surfaces the user can be in, the Sequence under way, help, and a button to turn Vim Mode off.       |
| `KeysHelp`      | A help sheet of every Action that works where the user is, drawn while its Isolated Surface is Active; Escape closes it, and `finalFocus={false}` leaves focus to use-keys. |
| `SurfaceScrim`  | A scrim behind an Isolated Surface the app draws itself.                                                                                                                    |

### `@kestack/web-platform/recipes/local-sign-in`

| Export        | What it does                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------- |
| `LocalSignIn` | Asks who to sign in as on the Local Backend, with one-tap presets and an email and name form. |

### `@kestack/web-platform/recipes/devtools`

| Export           | What it does                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DevtoolsDock`   | Wraps a page with devtools opened from a corner button of one fixed size and place, or Ctrl+/: full screen, a resizable bar or side panel, or a floating window, kept across reloads; phones get only full screen and the bar. With `scrolls="window"`, a page that scrolls the window stays in the document's flow, the bar or panel fixed over it. |
| `KabukiDevtools` | The Inspector on a running Kabuki app, from `App.useRuntime()`: picking a Step on its Timeline Time Travels the app, going live comes back.                                                                                                                                                                                                          |
| `Inspector`      | The Step shown, drawn as a Map, with the Sheet of what is picked and the Timeline under it; it lays itself out by its own width, and its Map as a packed tree or an outline, switched from its controls.                                                                                                                                             |

### `@kestack/web-platform/recipes/thumb-picker`

| Export        | What it does                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ThumbPicker` | Picks from a menu by a thumb's swipe while another finger holds still: up and down Step, right opens, left goes back, lifting chooses. |

### `@kestack/web-platform/recipes/swipe-row`

| Export     | What it does                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `SwipeRow` | A row one finger swipes left to delete, arming past a distance with a click; a mouse never swipes it. |

### `@kestack/web-platform/app/vite`

| Export | What it does                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app`  | Every Vite plugin a kstack app needs: Tailwind, React, Kabuki Start and the PWA (`pwa: false` for none), with the Web Platform bundled for the server. |

### `@kestack/web-platform/app/document`

| Export     | What it does                                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document` | The Document for `Start.app({ document })`: Start's head and scripts, Inter preloaded, the Theme and the device marked before the first paint, the PWA when the build has it, and the app's own head. |

### `@kestack/web-platform/app/alchemy`

| Export              | What it does                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Site`              | A Kabuki Start app as a Cloudflare Website: on its domain on a deployed Stage, on Portless's port under `alchemy dev`.         |
| `State`             | Where alchemy keeps a Stack's state: Cloudflare's state store for a deployed Stage, `.alchemy/state` on disk for anyone's own. |
| `where`             | Where the Stage being run serves the site and its API Workers, once it is checked it may be run.                               |
| `isDeployedStage`   | Whether a Stage reaches the world: `prod`, `demo` or a pull request's `prN`.                                                   |
| `assertStageIsSafe` | Refuses a deployed Stage unless `ALLOW_DEPLOY=true`.                                                                           |
| `portlessPort`      | The `PORT` `portless run` gives `pnpm dev`; throws when there is none.                                                         |

## Usage

### A kstack app

An app writes its Vite config, its `src/app.tsx` and its `alchemy.run.ts`; the Web Platform gives the rest, and the app is a PWA. Lifted from `apps/code`.

```tsx
// vite.config.ts
plugins: [app({ name: 'Code', platform: cloudflare(), app: 'src/app' })],

// src/app.tsx
export default Start.app({
  router,
  view: Shell.view,
  document: document({ theme: Theme, head: <link rel="icon" href="/favicon.svg" /> }),
  layer,
});

// alchemy.run.ts
export default Stack('Code', { providers, state: State }, Site({ host: 'code', zone: 'kishore.app' }));
```

- Start builds the client and the Worker; `pwa()` then writes `sw.js`, `manifest.webmanifest` and a `_headers` block with `Cache-Control: no-cache` for both into the client's folder. The worker entry is the app's `src/sw.ts` if it has one, or a built-in one.
- `name` is all the manifest needs: its colors are the default Theme's, and its icons are `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `apple-touch-icon.png` in `public/`; the build warns about any that is missing. `pwa: { manifest }` overrides any field. The Install Prompt is titled with the name.
- How each page works offline follows from its Render Mode, as Kabuki Start's Pages (`/_kabuki/pages`) say. On install the worker saves the Pages, the App Shell and every static page that is one URL ([ADR 0010](../../docs/adr/0010-kabuki-start-serves-the-web-platform-decides.md)). A client page is the App Shell, at once. A static page is this build's copy, saved on install or on first visit. A dynamic page, or one Start does not name, is the network within `navigation.networkTimeoutMs`, kept per Build ID; offline, the copy kept last, else the App Shell. With no Pages (an app not on Start), every page is dynamic and there is no App Shell.
- In `vite dev` the worker is off unless `pwa: { dev: true }`. `pwa: { enabled: false }` builds the Kill Switch, and `pwa: false` makes the app no PWA at all. Paths under `neverCache` (default `/api/auth/`), non-GET requests and `navigation.denylist` never reach the caches.
- While an update waits, this build's copy of a page, else its App Shell, answers navigations, so every page stays on one Build ID until the user accepts ([ADR 0006](./docs/adr/0006-pending-update-pins-navigations-to-the-active-build.md)).
- `Site` takes what the app adds, such as `env`, from a function given where the Stage serves; app-specific Workers stay in the app.

### What the Document puts before the first paint

`document({ theme })` draws Start's head and scripts with the Web Platform's look, and `around` wraps every page, as `apps/kabuki-start` wraps it in Kabuki's devtools.

```css
/* src/styles.css */
@import '@kestack/web-platform/ui/theme/global.css';
@import '@kestack/web-platform/ui/theme/font-inter.css';
```

- Text never moves when Inter arrives. `FontPreload` asks for Inter's Latin
  file before the first paint, and it is the very file `font-inter.css`
  declares, since the app's bundler gives one file one URL. If the file is
  late, text is set in `Inter Fallback`, Arial sized to Inter's metrics, which
  the Theme's sans family names next, so the swap changes the letters' shapes
  but moves nothing.
- The Theme's script sets light or dark on `<html>` before the body paints,
  and the device script sets `data-keyboard` and `data-touch` for the
  `keyboard:` and `touch:` variants.
- `head` adds the app's own tags, such as icons, after the Web Platform's
  and the PWA's. The same rule holds for any other web font: preload the file the first
  paint needs, and give it a fallback whose metrics match.
