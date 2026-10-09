# @kstackz/web-platform

The Web Platform: a web app from one config, as a PWA on TanStack Start with its Theme, its APIs on a cloud or a device Backend, several Accounts with one Session each, the screens before sign-in, and the server; plus the components, input, forms and Recipes to build screens with.

## Big picture

Every kstack web app used to wire the same things by hand: the root document, the Theme, the PWA, sign-in and its screens, the browser as a Host, and the server for its APIs. This Package holds all of it, so a new app writes only its APIs, its Backend, its Session, its Cache and its screens ([ADR 0004](../../docs/adr/0004-an-app-is-api-backend-and-stores.md)). It replaces `@kstackz/web-toolkit`, `@kstackz/ui-toolkit` and `@kstackz/pwa-toolkit`.

The root door is `createApp`. It hands one config to [`@kstackz/platform-toolkit`](../../toolkits/platform-toolkit)'s `createApp` with `webHost` (IndexedDB with a Broadcaster per database every tab hears, the sign-in service's cookies, the window's network and tabs) and gives back the app with its root route, the Theme, `SignedIn` with the screens before an Account is open (the Gate Screens and Account Lost recipes), and the named sign-in dialog for the device Backend. Every app is a PWA: `createApp` always adds the PWA's Root Plugin. The `server` door's `createServer` serves each `http` API on its cloud Backend and each `websocket` API in the caller's own Live Object (a Durable Object made with `liveObject`, one per user), and checks every call with the sign-in service. Why the Platforms may break while the Toolkits keep what persists is [ADR 0006](../../docs/adr/0006-platforms-may-break-toolkits-keep-what-persists.md).

Underneath, it is laid out one layer per job and one subpath per layer, bottom to top: `theme`, `feedback`, `input`, `components`, `form`, `recipes`, `client`, then `pwa`; `server` stands beside them. These stay exported for screens and for the unusual app; [ADR 0003](../../docs/adr/0003-web-toolkit-and-the-gate.md) is the earlier design.

It ships built `dist/` (from `vp pack`). Terms are in [CONTEXT.md](./CONTEXT.md); the PWA's decisions are in [docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @kstackz/web-platform @kstackz/platform-toolkit @kstackz/auth-toolkit @kstackz/rpc-toolkit @kstackz/std-toolkit react react-dom @kstackz/use-gesture
pnpm add -D @tailwindcss/vite
```

An app that renders on the server adds `@kstackz/web-platform` to `ssr.noExternal` in its Vite config, as Ledger, `apps/docs` and `apps/alchemy-console` do. Its stylesheet imports `@kstackz/web-platform/theme/global.css`, which also points Tailwind at the Package's own classes.

- `@kstackz/platform-toolkit`: `createApp` runs on its `createApp`, the Gate and the Session; the root door re-exports its `Api`, `defineSession` and `SessionClosed`.
- `@kstackz/auth-toolkit`: `webHost` signs in with its `cookie`, and `createServer` checks calls with its `authz.cloud`.
- `@kstackz/rpc-toolkit`: `createServer` answers each `http` API with its `Rpc.http.server`, and `liveObject` each `websocket` one with its `Rpc.websocket.server`.
- `@kstackz/std-toolkit`: `webHost` keeps tables and Std Sync in its IndexedDB adapters.
- `react`, `react-dom`: every component, Recipe and the root document render with React 19.
- `@kstackz/use-gesture`: the platform-free gesture core that `./input`'s web gestures and the Thumb Picker run on.
- `@kstackz/use-keys` (optional): the Binding and Shortcut types `./recipes/key-bindings` shows.
- `@tanstack/react-router` (optional): `./client`'s `webRoot` is a root route.
- `@tanstack/react-start` (optional): `./client/server` reads the Theme cookie with it, and `./server` hands pages to its server entry.
- `effect` (optional): the root door, the PWA subpaths, `./server`, and the diff and source viewers are built on it.
- `vite` (optional): needed by `./pwa/vite`.
- `laymos` (optional): the file diff and change types the diff, git-changes and source-explorer viewers read.
- `use-effect-ts` (optional): runs `./components/viewers/source-explorer`'s loaders inside React.

## Exports

### `@kstackz/web-platform`

| Export          | What it does                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createApp`     | A web app from one config: its root route, Theme and PWA, its APIs, device Backend and Cache, and with `auth` its Accounts and the screens before sign-in. |
| `webHost`       | The browser as an app's Host: IndexedDB, the sign-in service's cookies, the window's network and visibility, and its other tabs.                           |
| `Api.http`      | Declares an API reached over HTTP, from platform-toolkit.                                                                                                  |
| `Api.websocket` | Declares an API reached over a WebSocket, from platform-toolkit.                                                                                           |
| `defineSession` | Writes an app's Session once over its APIs, from platform-toolkit.                                                                                         |
| `SessionClosed` | Error a run rejects with when its Session closed first, from platform-toolkit.                                                                             |

### `@kstackz/web-platform/theme`

| Export             | What it does                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTheme`      | Makes the app's Theme: `useTheme`, the head `Script` that sets it before paint, the `StatusBar` strip, and `manifest` colors for a given Theme. |
| `themeFromCookies` | Reads the Theme from a `Cookie` header string; dark when it is missing or unknown.                                                              |
| `THEME_COOKIE`     | The cookie's name, `kui-theme`.                                                                                                                 |

### `@kstackz/web-platform/theme/*.css`

| Export           | What it does                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `global.css`     | The one stylesheet to import: Tailwind, the tokens, the `dark`, `keyboard:` and `touch:` variants, and the rest. |
| `theme.css`      | The design tokens as Tailwind theme variables; included by `global.css`.                                         |
| `sources.css`    | Points Tailwind at the Package's built components, form, Recipes, client and PWA; included by `global.css`.      |
| `typography.css` | The Tailwind typography plugin; included by `global.css`.                                                        |
| `shiki.css`      | Dark-theme colors and diff line marks for highlighted code; included by `global.css`.                            |
| `font-inter.css` | Inter and JetBrains Mono as variable fonts; import it beside `global.css` to use them.                           |

### `@kstackz/web-platform/feedback`

| Export | What it does                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| `play` | Plays one short sound made by the browser, such as `tick`, `arm`, `confirm` or `wrong`; the web's twin of haptics. |

### `@kstackz/web-platform/input`

| Export             | What it does                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `DEVICE_SCRIPT`    | Inline script that marks `<html>` with `data-keyboard` and `data-touch` before the first paint; `webRoot` already adds it. |
| `useDevice`        | Whether this device has a keyboard, a touch screen or both, live; a key pressed outside a text field turns keyboard on.    |
| `GestureProvider`  | Follows every touch and pen finger in the Gesture Zones inside it; put one at the app's root.                              |
| `GestureZone`      | An area where the app may own touch; zones nest, and the browser scrolls when no listener takes the touch.                 |
| `useGesture`       | Every finger its nearest Gesture Zone hears, with motion values that follow it; never says what the Gesture means.         |
| `useSwipe`         | The Swipe Recognizer: fingers moving one way, Tracking with motion values, then a Commit or a Cancel.                      |
| `useSidebar`       | A sidebar that follows a Swipe open from anywhere or an edge, and back, then settles open or closed.                       |
| `usePullToRefresh` | Pull to refresh: a Swipe down at a list's top, followed with resistance, refreshing past a distance.                       |

### `@kstackz/web-platform/components/*`

Owned shadcn copies on Base UI, one subpath per file, such as `@kstackz/web-platform/components/button`.

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

### `@kstackz/web-platform/components/viewers/diff-viewer`

| Export               | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `DiffViewer`         | Shows one file's diff, side by side or unified; its options can be held by the caller to keep. |
| `defaultDiffOptions` | The options a diff opens with: split, unwrapped, both sides, folded.                           |

### `@kstackz/web-platform/components/viewers/file-tree`

| Export          | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| `FileTree`      | Shows a list of file paths as a tree of folders.                |
| `expandAll`     | Every folder path in a list of files, to open the whole tree.   |
| `expandToDepth` | The folder paths no deeper than a given depth.                  |
| `expandTo`      | The folder paths that lead to one file, to reveal it.           |
| `toggleSubtree` | Opens or closes one folder together with every folder under it. |

### `@kstackz/web-platform/components/viewers/git-changes`

| Export               | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `ChangeBadge`        | The `new` or `mod` mark for an added or modified item.                               |
| `ChangesMenu`        | The menu that shows or hides changes and picks the branch they are measured against. |
| `changeSurfaceClass` | Border classes that mark an added or modified surface.                               |
| `defaultGitOptions`  | Changes shown, unchanged items kept.                                                 |
| `uncommittedBaseRef` | The base ref, `HEAD`, that means the working tree's uncommitted changes.             |
| `rollUpChanges`      | Each owner's change status from the files it owns.                                   |
| `changedPathsUnder`  | The changed files under one or more path prefixes.                                   |

### `@kstackz/web-platform/components/viewers/json`

| Export       | What it does                              |
| ------------ | ----------------------------------------- |
| `JsonViewer` | Shows a JSON value as a collapsible view. |
| `JsonTree`   | Shows a JSON value as an expandable tree. |
| `JsonEditor` | Edits JSON text in CodeMirror.            |

### `@kstackz/web-platform/components/viewers/markdown-viewer`

| Export           | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `MarkdownViewer` | Renders Markdown, with GitHub tables and lists, as typography. |

### `@kstackz/web-platform/components/viewers/source-explorer`

| Export           | What it does                                                               |
| ---------------- | -------------------------------------------------------------------------- |
| `SourceExplorer` | A dialog that opens one scope's documentation and files, with their diffs. |

### `@kstackz/web-platform/components/viewers/source-viewer`

| Export         | What it does                                                       |
| -------------- | ------------------------------------------------------------------ |
| `SourceViewer` | Shows highlighted source with line numbers, ranges and diff lines. |

### `@kstackz/web-platform/components/hooks/use-element-width`

| Export            | What it does                           |
| ----------------- | -------------------------------------- |
| `useElementWidth` | An element's content width, kept live. |

### `@kstackz/web-platform/components/hooks/use-mobile`

| Export         | What it does                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `useIsMobile`  | Whether the screen is phone-sized; wide on the server and during hydration. |
| `MOBILE_QUERY` | The media query `useIsMobile` reads.                                        |

### `@kstackz/web-platform/components/hooks/use-scroll`

| Export      | What it does                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `useScroll` | Keeps a scroller pinned to its bottom as content grows, until the user scrolls up; scrolls back on request. |

### `@kstackz/web-platform/components/utils`

| Export | What it does                                               |
| ------ | ---------------------------------------------------------- |
| `cn`   | Joins class names and merges conflicting Tailwind classes. |

### `@kstackz/web-platform/components/lucide`

| Export     | What it does                                             |
| ---------- | -------------------------------------------------------- |
| every icon | Re-exports `lucide-react`, so apps use the same version. |

### `@kstackz/web-platform/components/motion`

| Export       | What it does                                             |
| ------------ | -------------------------------------------------------- |
| every export | Re-exports `motion/react`, so apps use the same version. |

### `@kstackz/web-platform/components/scroll-styles`

| Export            | What it does                                                                        |
| ----------------- | ----------------------------------------------------------------------------------- |
| `scrollbarStyles` | Classes for thin scrollbars on devices with a fine pointer.                         |
| `scrollBar`       | The same classes for a `default`, `small` or hidden scrollbar, in one or both axes. |

### `@kstackz/web-platform/components/shadow-dom`

| Export           | What it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `ShadowScope`    | Renders its children in a shadow root with the given CSS and a portal container. |
| `useShadowScope` | The shadow root, portal container and Theme of the nearest `ShadowScope`.        |

### `@kstackz/web-platform/form`

| Export        | What it does                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useAppForm`  | A TanStack Form hook whose fields come bound to the components: `TextField`, `TextareaField`, `SelectField`, `SwitchField`, `DatePickerField`, and `SubmitButton`. |
| `withForm`    | Builds a piece of form that takes the form as a prop.                                                                                                              |
| `formOptions` | TanStack Form's `formOptions`, to share options between forms.                                                                                                     |

### `@kstackz/web-platform/recipes/frame`

| Export                                                         | What it does                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppShell`                                                     | The Frame: an optional Sidebar, an optional header with title and actions, and the page; on a phone the page moves aside under a finger to show the Sidebar. |
| `useAppShell`                                                  | `open`, `setOpen`, `toggle` and `isMobile`, inside an `AppShell`.                                                                                            |
| `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`     | Labeled groups for custom Sidebar content.                                                                                                                   |
| `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`          | Menu rows; a button shuts the Sidebar when tapped on a phone.                                                                                                |
| `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton` | Nested menu rows.                                                                                                                                            |
| `SidebarInput`, `SidebarMenuSkeleton`                          | A search input and a loading row for the Sidebar.                                                                                                            |

### `@kstackz/web-platform/recipes/thumb-picker`

| Export        | What it does                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ThumbPicker` | Picks from a menu by a thumb's swipe while another finger holds still: up and down Step, right opens, left goes back, lifting chooses. |

### `@kstackz/web-platform/recipes/swipe-row`

| Export     | What it does                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `SwipeRow` | A row one finger swipes left to delete, arming past a distance with a click; a mouse never swipes it. |

### `@kstackz/web-platform/recipes/key-bindings`

| Export        | What it does                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `BindingKeys` | A Binding's keys step by step, such as `⌘` `K`, shown only where there is a keyboard unless `always`. |
| `recorded`    | Turns one recorded key press into a Shortcut, with Cmd on a Mac and Ctrl elsewhere as `mod`.          |

### `@kstackz/web-platform/recipes/local-sign-in`

| Export        | What it does                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------- |
| `LocalSignIn` | Asks who to sign in as on the device Backend, with one-tap presets and an email and name form. |

### `@kstackz/web-platform/recipes/account-lost`

| Export        | What it does                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AccountLost` | Holds the app on an Account Lost until the User signs in to it again or opens another Account; it cannot be dismissed. |

### `@kstackz/web-platform/recipes/gate-screens`

| Export        | What it does                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GateScreens` | Every screen before an Account is open, in one card: checking, opening, signing out, signed out with the way to the other Backend, unopenable. |

### `@kstackz/web-platform/recipes/account-switcher`

| Export            | What it does                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `AccountSwitcher` | A menu of the Signed-in Accounts: switch, add an account, sign out the Active Account or everyone. |

### `@kstackz/web-platform/client`

| Export    | What it does                                                                                                                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webRoot` | The root route's options: the document in the Theme set before paint, the device marked, the shared head, a 404, and each Root Plugin's head and provider. |

### `@kstackz/web-platform/client/server`

| Export     | What it does                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `getTheme` | Reads the Theme from the request's cookie, for the app's own server function behind `loadTheme`. |

### `@kstackz/web-platform/pwa`

| Export              | What it does                                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pwaRoot`           | The Root Plugin that makes an app a PWA: manifest, icon, Build ID and splash tags, the provider, and the Update and Install Prompts. |
| `PwaProvider`       | Registers the worker after mount and gives `usePwa` its Status; `pwaRoot` renders it.                                                |
| `pwaHead`           | Head tags: manifest link, Apple icon, and meta tags for the Build ID, build time and commit.                                         |
| `usePwa`            | The Status with `checkForUpdate` and `applyUpdate` (`Unsupported` before mount), and the page's `version`.                           |
| `clearRuntimeCache` | Deletes every Runtime Cache; works outside `PwaProvider`, for example in sign-out.                                                   |
| `UpdatePrompt`      | Persistent toast while an update is ready; accepting it reloads every page into it.                                                  |
| `splashHead`        | The iOS startup image tags, one per screen iOS matches.                                                                              |
| `splashScreens`     | Each splash image's size, its `/splash/<w>x<h>.png` path, and the screen it is for, for an app to draw them.                         |

### `@kstackz/web-platform/pwa/vite`

| Export | What it does                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa`  | Vite plugins that emit the manifest, pick the Precache, compute the Build ID, build the worker (or the Kill Switch) and add `no-cache` rules to `_headers`. |

### `@kstackz/web-platform/pwa/splash`

| Export          | What it does                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------- |
| `splashHead`    | The iOS startup image tags, one per screen iOS matches.                                       |
| `splashScreens` | Each splash image's size, path and screen, with no React, for a script that draws the images. |

### `@kstackz/web-platform/pwa/worker`

| Export             | What it does                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `runServiceWorker` | Starts the worker; call it once at the top of the entry, optionally with a `layer` such as a Worker Server.       |
| `WorkerHost`       | Service given to that `layer`: the worker's Build ID and a stream of every `message` event that is not a Command. |

### `@kstackz/web-platform/pwa/client`

| Export              | What it does                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Pwa`               | Service with the page's `status`, `checkForUpdate`, `applyUpdate` (reloads every open page) and `clearRuntimeCache`. |
| `Pwa.layer`         | Registers the worker and builds `Pwa` from the build info; browser only, never during SSR.                           |
| `PwaStatus`         | Tagged enum `Unsupported`, `Installing`, `Ready`, `UpdateReady`, `Updating`.                                         |
| `clearRuntimeCache` | Effect that deletes every Runtime Cache, with no registration or `Pwa` needed.                                       |

### `@kstackz/web-platform/pwa/extras`

| Export                  | What it does                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `useInstall`            | Install state with `prompt` and `dismiss` (remembered 30 days); call it in the root to catch the browser's offer. |
| `InstallPrompt`         | Bottom sheet on small screens, corner card on larger ones, manual steps on iOS Safari.                            |
| `Install`               | The Effect service behind `useInstall`, with its `layer`.                                                         |
| `InstallState`          | Tagged enum `Unsupported`, `Available`, `ManualIos`, `Installed`, `Dismissed`.                                    |
| `IosSteps`              | The Share, then Add to Home Screen steps `InstallPrompt` shows on iOS Safari, for an app's own install screen.    |
| `isIosSafari`           | Whether a `navigator` is Safari on iOS or iPadOS, where install has no API and only those steps work.             |
| `useOnline`             | Whether the browser is online; `true` before mount.                                                               |
| `OfflineIndicator`      | "You're offline" pill in a live region, stacked above sheets.                                                     |
| `Online`                | The Effect service behind `useOnline`, with its `layer`.                                                          |
| `useDisplayMode`        | The display mode, such as `browser` or `standalone`; `browser` before mount.                                      |
| `DisplayMode`           | The Effect service behind `useDisplayMode`, with its `layer`.                                                     |
| `useStoragePersistence` | Persisted flag with `persist` and `estimate`; `null` while unknown.                                               |
| `StoragePersistence`    | The Effect service behind `useStoragePersistence`, with its `layer`.                                              |

### `@kstackz/web-platform/pwa/rpc/worker`

| Export               | What it does                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| `WorkerServer.layer` | Serves an Effect `RpcGroup` inside the worker; provide its handlers and pass it to `runServiceWorker`. |

### `@kstackz/web-platform/pwa/rpc/client`

| Export               | What it does                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `WorkerClient.make`  | Scoped Effect that opens this page's Worker Client to the Worker Server.                  |
| `WorkerClient.layer` | The same client as a Layer under your own service tag.                                    |
| `VersionSkew`        | Tagged error a call fails with when the worker belongs to another Build ID than the page. |

### `@kstackz/web-platform/server`

| Export              | What it does                                                                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createServer`      | A web app's server from its APIs and its cloud Backend: each `http` API at its path, each `websocket` API's socket handed to the Live Object named for whoever its `access_token` names, each call checked with the sign-in service when the app has auth, everything else TanStack Start. |
| `liveObject`        | A Durable Object class serving one `websocket` API, one object per user with its own storage, each call still checked; `streams` sets where open streams are kept while it sleeps.                                                                                                         |
| `webServer`         | One fetch handler: `/rpc` goes to the app's API, everything else to TanStack Start; a Cloudflare Worker's default export as it is.                                                                                                                                                         |
| `isDeployedStage`   | Whether an alchemy stage reaches the world: `prod` or a pull request's `prN`.                                                                                                                                                                                                              |
| `assertStageIsSafe` | Refuses a deployed stage unless `ALLOW_DEPLOY=true`.                                                                                                                                                                                                                                       |
| `domainFor`         | Where a stage is served: the domain for `prod`, `prN-<domain>` for a pull request, nowhere for anyone's own stage.                                                                                                                                                                         |
| `devConfigFor`      | A local stage's dev server on the `PORT` portless gives it; throws when there is none.                                                                                                                                                                                                     |

## Usage

### A web app from one config

`app.ts` makes the app once; the root route and the Worker come from it. From Ledger's `src/app.ts`, `src/routes/__root.tsx` and `src/worker.ts`.

```tsx
// src/app.ts
import { createApp } from '@kstackz/web-platform';
export const app = createApp({
  name: 'ledger',
  title: 'Ledger',
  description: 'Write down what you spend and earn, and see where it goes.',
  mark: createElement(LedgerMark),
  apis, // { ledger: Api.websocket(LedgerApi, { path: '/live' }) }
  device, // every API's handlers on the device's Storage
  cache: ledgerCache,
  auth: {
    url: AUTH_URL,
    session: ledgerSession, // defineSession(apis, ...)
    presets: [{ email: 'ada@example.com', name: 'Ada Lovelace' }],
  },
  theme: { cookieDomain },
  pwa: { installTitle: 'Install Ledger' },
});
export const { SignedIn, useAccounts, useGate, theme: appTheme } = app;

// src/routes/__root.tsx
export const Route = createRootRoute(app.root({ stylesheet: appCss }));

// src/worker.ts
import { createServer } from '@kstackz/web-platform/server';
export default createServer({
  apis,
  backend: (env: WorkerEnv) => ({
    ledger: ledgerBackend.pipe(Layer.provide(tableCloud(env.DB))),
  }),
  live: (env: WorkerEnv) => ({ ledger: env.LedgerObject }), // a liveObject
  auth: { url: AUTH_URL, resource: LEDGER_RESOURCE },
}) satisfies ExportedHandler<WorkerEnv>;
```

- `app.root` is the root route: the document in the Theme, the PWA's head and prompts, and the named sign-in dialog when there is a device Backend.
- `SignedIn` renders its children while an Account is open, and otherwise the Gate Screens or Account Lost. Everything inside remounts on an Account Switch.
- The Host is made the first time anything asks, so `app.ts` loads on the server too. The device Backend's code loads the first time someone chooses it; `?backend=device` in the address starts on it.
- `createServer` serves each `http` API at its path and everything else from TanStack Start. Point `tanstackStart({ server: { entry } })` at this file.
- A `websocket` API is served by `live` instead of `backend`: each `(env) => ({ [api]: namespace })` names a Durable Object binding, and a socket opens at `getByName(userId)` once its `access_token` checks out (401 without one, 503 when the sign-in service can't be asked). Ledger's `LedgerObject`, made with `liveObject`, is the example.
- With `auth`, each call is checked by auth-toolkit's `authz.cloud` for a bearer token or the sign-in cookie, and refreshed cookies go back on the answer. `resource` lets a phone's Access Token in too.

### Building the PWA

`createApp` adds the PWA to the root route; `pwa()` in the Vite plugins builds its worker and manifest. From Ledger's `vite.config.ts`.

```ts
// vite.config.ts
ssr: { noExternal: ['@kstackz/web-platform'] },
plugins: [
  tailwindcss(),
  tanstackStart({
    // App Shell and Offline Fallback, both precached by pwa().
    spa: { enabled: true, prerender: { outputPath: '/_shell' } },
    pages: [
      {
        path: '/offline',
        prerender: { enabled: true, crawlLinks: false, autoSubfolderIndex: false },
      },
    ],
    prerender: { autoStaticPathsDiscovery: false },
  }),
  react(),
  // After tanstackStart(): the worker builds after prerendering.
  pwa({
    dev: process.env['PWA_DEV'] === 'true',
    manifest: { name: 'Ledger', short_name: 'Ledger', ...createTheme().manifest('dark'), icons },
  }),
],
```

- `pwa()` must come after `tanstackStart()`, because the worker builds in a post `buildApp` hook that runs after prerendering; the wrong order throws at config time. When `/_shell` or `/offline` is missing from the build, the build warns and prints the exact Start options.
- The app writes its own `/offline` route; the worker redirects there as `/offline?from=<page>`, so "Try again" should only go back to a same-origin `from`.
- The build writes `sw.js`, `manifest.webmanifest`, `_shell.html`, `offline.html` and a `_headers` block with `Cache-Control: no-cache` for the worker and the manifest. The worker entry is the app's `src/sw.ts` if it has one, or a built-in one.
- In `vite dev` the worker is off unless `pwa({ dev: true })`. `pwa({ enabled: false })` builds the Kill Switch.
- The `app` preset (the default) answers any route offline from the App Shell; `content` saves visited pages and sends unvisited ones to the Offline Fallback. Paths under `neverCache` (default `/api/auth/`), non-GET requests and `navigation.denylist` never reach the caches.
- While an update waits, the App Shell of the active build answers navigations, so every page stays on one Build ID until the user accepts ([ADR 0006](./docs/adr/0006-pending-update-pins-navigations-to-the-active-build.md)).
