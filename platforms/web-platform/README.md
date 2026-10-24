# @kestack/web-platform

The way to build a kstack app on Kabuki Start: its Document with the Theme, the PWA, the components, input, forms and Recipes to build screens with.

## Big picture

Every kstack web app used to wire the same things by hand: the Document, the Theme, the PWA, and the screens. This Package holds them for apps on Kabuki Start, so a new app writes only its pages. It replaces `@kestack/ui-toolkit` and `@kestack/pwa-toolkit`.

The way in is `./start`'s `Document`, which an app's `src/document.tsx` draws: Inter and the Theme set before the first paint, the device marked, and the viewport drawn under the notch and home bar. `./pwa`'s `PwaHead` and `Pwa` make the app a PWA inside it, and `./pwa/vite`'s `pwa()` builds its worker and manifest beside Start's. Why the Web Platform may break while the Toolkits keep what persists is [ADR 0006](../../docs/adr/0006-platforms-may-break-toolkits-keep-what-persists.md).

Underneath, it is laid out one layer per job and one subpath per layer, bottom to top: `theme`, `feedback`, `input`, `components`, `form`, `recipes`, then `pwa` and `start`; `server` stands beside them. These stay exported for screens and for the unusual app; [ADR 0003](../../docs/adr/0003-web-toolkit-and-the-gate.md) is the earlier design.

It ships built `dist/` (from `vp pack`). Terms are in [CONTEXT.md](./CONTEXT.md); the PWA's decisions are in [docs/adr/](./docs/adr/).

## Install

```sh
pnpm add @kestack/web-platform @kestack/auth-toolkit react react-dom @kestack/use-gesture
pnpm add -D @tailwindcss/vite
```

An app that renders on the server adds `@kestack/web-platform` to `ssr.noExternal` in its Vite config, as `apps/docs` and `apps/code` do. Its stylesheet imports `@kestack/web-platform/theme/global.css`, which also points Tailwind at the Package's own classes.

- `@kestack/auth-toolkit`: `./account-switcher` follows its `Accounts`, by the sign-in service's cookie or as Fake Accounts.
- `react`, `react-dom`: every component, Recipe and the root document render with React 19.
- `@kestack/use-gesture`: the platform-free gesture core that `./input`'s web gestures and the Thumb Picker run on.
- `@kestack/use-keys` (optional): the Binding and Shortcut types `./recipes/key-bindings` shows, and the `createKeys` keyboard `./recipes/keyboard` shows. `./theme/global.css` draws every `keys.Surface` from its data attributes, so a `keys.Provider` needs no `appearance` (also alone as `./theme/keys.css`).
- `effect` (optional): the PWA subpaths and the diff and source viewers are built on it.
- `vite` (optional): needed by `./pwa/vite`.
- `laymos` (optional): the file diff and change types the diff, git-changes and source-explorer viewers read.
- `use-effect-ts` (optional): runs `./components/viewers/source-explorer`'s loaders inside React.
- `@kestack/kabuki` (optional): the running app `./recipes/kabuki-devtools` inspects, the Start parts `./start`'s Document draws, the Start app `./pwa/vite` builds beside, and the Actor and View `./account-switcher` is.

## Exports

### `@kestack/web-platform/theme`

| Export             | What it does                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTheme`      | Makes the app's Theme: `useTheme`, the head `Script` that sets it before paint, the `StatusBar` strip, and `manifest` colors for a given Theme. |
| `FontPreload`      | Preloads Inter's Latin file from the head, the same file `font-inter.css` uses, so the first paint is already in Inter.                         |
| `themeFromCookies` | Reads the Theme from a `Cookie` header string; dark when it is missing or unknown.                                                              |
| `THEME_COOKIE`     | The cookie's name, `kui-theme`.                                                                                                                 |

### `@kestack/web-platform/theme/*.css`

| Export           | What it does                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `global.css`     | The one stylesheet to import: Tailwind, the tokens, the `dark`, `keyboard:` and `touch:` variants, and the rest.          |
| `theme.css`      | The design tokens as Tailwind theme variables; included by `global.css`.                                                  |
| `sources.css`    | Points Tailwind at the Package's built components, form, Recipes, client and PWA; included by `global.css`.               |
| `typography.css` | The Tailwind typography plugin; included by `global.css`.                                                                 |
| `shiki.css`      | Dark-theme colors and diff line marks for highlighted code; included by `global.css`.                                     |
| `font-inter.css` | Inter and JetBrains Mono as variable fonts, and `Inter Fallback` sized to Inter's metrics; import it beside `global.css`. |

### `@kestack/web-platform/feedback`

| Export | What it does                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| `play` | Plays one short sound made by the browser, such as `tick`, `arm`, `confirm` or `wrong`; the web's twin of haptics. |

### `@kestack/web-platform/input`

| Export             | What it does                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DEVICE_SCRIPT`    | Inline script that marks `<html>` with `data-keyboard` and `data-touch` before the first paint; `./start`'s Document already adds it. |
| `useDevice`        | Whether this device has a keyboard, a touch screen or both, live; a key pressed outside a text field turns keyboard on.               |
| `GestureProvider`  | Follows every touch and pen finger in the Gesture Zones inside it; put one at the app's root.                                         |
| `GestureZone`      | An area where the app may own touch; zones nest, and the browser scrolls when no listener takes the touch.                            |
| `useGesture`       | Every finger its nearest Gesture Zone hears, with motion values that follow it; never says what the Gesture means.                    |
| `useSwipe`         | The Swipe Recognizer: fingers moving one way, Tracking with motion values, then a Commit or a Cancel.                                 |
| `useSidebar`       | A sidebar that follows a Swipe open from anywhere or an edge, and back, then settles open or closed.                                  |
| `usePullToRefresh` | Pull to refresh: a Swipe down at a list's top, followed with resistance, refreshing past a distance.                                  |

### `@kestack/web-platform/components/*`

Owned shadcn copies on Base UI, one subpath per file, such as `@kestack/web-platform/components/button`.

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

### `@kestack/web-platform/components/viewers/diff-viewer`

| Export               | What it does                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `DiffViewer`         | Shows one file's diff, side by side or unified; its options can be held by the caller to keep. |
| `defaultDiffOptions` | The options a diff opens with: split, unwrapped, both sides, folded.                           |

### `@kestack/web-platform/components/viewers/file-tree`

| Export          | What it does                                                    |
| --------------- | --------------------------------------------------------------- |
| `FileTree`      | Shows a list of file paths as a tree of folders.                |
| `expandAll`     | Every folder path in a list of files, to open the whole tree.   |
| `expandToDepth` | The folder paths no deeper than a given depth.                  |
| `expandTo`      | The folder paths that lead to one file, to reveal it.           |
| `toggleSubtree` | Opens or closes one folder together with every folder under it. |

### `@kestack/web-platform/components/viewers/git-changes`

| Export               | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `ChangeBadge`        | The `new` or `mod` mark for an added or modified item.                               |
| `ChangesMenu`        | The menu that shows or hides changes and picks the branch they are measured against. |
| `changeSurfaceClass` | Border classes that mark an added or modified surface.                               |
| `defaultGitOptions`  | Changes shown, unchanged items kept.                                                 |
| `uncommittedBaseRef` | The base ref, `HEAD`, that means the working tree's uncommitted changes.             |
| `rollUpChanges`      | Each owner's change status from the files it owns.                                   |
| `changedPathsUnder`  | The changed files under one or more path prefixes.                                   |

### `@kestack/web-platform/components/viewers/json`

| Export       | What it does                              |
| ------------ | ----------------------------------------- |
| `JsonViewer` | Shows a JSON value as a collapsible view. |
| `JsonTree`   | Shows a JSON value as an expandable tree. |
| `JsonEditor` | Edits JSON text in CodeMirror.            |

### `@kestack/web-platform/components/viewers/markdown-viewer`

| Export           | What it does                                                   |
| ---------------- | -------------------------------------------------------------- |
| `MarkdownViewer` | Renders Markdown, with GitHub tables and lists, as typography. |

### `@kestack/web-platform/components/viewers/source-explorer`

| Export           | What it does                                                               |
| ---------------- | -------------------------------------------------------------------------- |
| `SourceExplorer` | A dialog that opens one scope's documentation and files, with their diffs. |

### `@kestack/web-platform/components/viewers/source-viewer`

| Export         | What it does                                                       |
| -------------- | ------------------------------------------------------------------ |
| `SourceViewer` | Shows highlighted source with line numbers, ranges and diff lines. |

### `@kestack/web-platform/components/hooks/use-element-width`

| Export            | What it does                           |
| ----------------- | -------------------------------------- |
| `useElementWidth` | An element's content width, kept live. |

### `@kestack/web-platform/components/hooks/use-mobile`

| Export         | What it does                                                                |
| -------------- | --------------------------------------------------------------------------- |
| `useIsMobile`  | Whether the screen is phone-sized; wide on the server and during hydration. |
| `MOBILE_QUERY` | The media query `useIsMobile` reads.                                        |

### `@kestack/web-platform/components/hooks/use-scroll`

| Export      | What it does                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| `useScroll` | Keeps a scroller pinned to its bottom as content grows, until the user scrolls up; scrolls back on request. |

### `@kestack/web-platform/components/utils`

| Export | What it does                                               |
| ------ | ---------------------------------------------------------- |
| `cn`   | Joins class names and merges conflicting Tailwind classes. |

### `@kestack/web-platform/components/lucide`

| Export     | What it does                                             |
| ---------- | -------------------------------------------------------- |
| every icon | Re-exports `lucide-react`, so apps use the same version. |

### `@kestack/web-platform/components/motion`

| Export       | What it does                                             |
| ------------ | -------------------------------------------------------- |
| every export | Re-exports `motion/react`, so apps use the same version. |

### `@kestack/web-platform/components/scroll-styles`

| Export            | What it does                                                                        |
| ----------------- | ----------------------------------------------------------------------------------- |
| `scrollbarStyles` | Classes for thin scrollbars on devices with a fine pointer.                         |
| `scrollBar`       | The same classes for a `default`, `small` or hidden scrollbar, in one or both axes. |

### `@kestack/web-platform/components/shadow-dom`

| Export           | What it does                                                                     |
| ---------------- | -------------------------------------------------------------------------------- |
| `ShadowScope`    | Renders its children in a shadow root with the given CSS and a portal container. |
| `useShadowScope` | The shadow root, portal container and Theme of the nearest `ShadowScope`.        |

### `@kestack/web-platform/form`

| Export        | What it does                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useAppForm`  | A TanStack Form hook whose fields come bound to the components: `TextField`, `TextareaField`, `SelectField`, `SwitchField`, `DatePickerField`, and `SubmitButton`. |
| `withForm`    | Builds a piece of form that takes the form as a prop.                                                                                                              |
| `formOptions` | TanStack Form's `formOptions`, to share options between forms.                                                                                                     |

### `@kestack/web-platform/recipes/frame`

| Export                                                         | What it does                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AppShell`                                                     | The Frame: an optional Sidebar, an optional header with title and actions, the page, with `vim` as a floating window, the same in Vim Mode or out of it, with a status line while it is on, and `column` to wrap the header and page in one element; on a phone the page moves aside under a finger to show the Sidebar. |
| `useAppShell`                                                  | `open`, `setOpen`, `toggle` and `isMobile`, inside an `AppShell`.                                                                                                                                                                                                                                                        |
| `SidebarGroup`, `SidebarGroupContent`, `SidebarGroupLabel`     | Labeled groups for custom Sidebar content.                                                                                                                                                                                                                                                                               |
| `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`          | Menu rows; a button shuts the Sidebar when tapped on a phone.                                                                                                                                                                                                                                                            |
| `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton` | Nested menu rows.                                                                                                                                                                                                                                                                                                        |
| `SidebarInput`, `SidebarMenuSkeleton`                          | A search input and a loading row for the Sidebar.                                                                                                                                                                                                                                                                        |

### `@kestack/web-platform/recipes/thumb-picker`

| Export        | What it does                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ThumbPicker` | Picks from a menu by a thumb's swipe while another finger holds still: up and down Step, right opens, left goes back, lifting chooses. |

### `@kestack/web-platform/recipes/swipe-row`

| Export     | What it does                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `SwipeRow` | A row one finger swipes left to delete, arming past a distance with a click; a mouse never swipes it. |

### `@kestack/web-platform/recipes/key-bindings`

| Export        | What it does                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `BindingKeys` | A Binding's keys step by step, such as `⌘` `K`, shown only where there is a keyboard unless `always`. |
| `recorded`    | Turns one recorded key press into a Shortcut, with Cmd on a Mac and Ctrl elsewhere as `mod`.          |

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

### `@kestack/web-platform/recipes/account-lost`

| Export        | What it does                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AccountLost` | Holds the app on an Account Lost until the User signs in to it again or opens another Account; it cannot be dismissed. |

### `@kestack/web-platform/recipes/gate-screens`

| Export        | What it does                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GateScreens` | Every screen before an Account is open, in one card: checking, opening, signing out, signed out with the way to the other Backend, unopenable. |

### `@kestack/web-platform/recipes/devtools-dock`

| Export         | What it does                                                                                                                                                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DevtoolsDock` | Wraps a page with devtools opened from a corner button of one fixed size and place, or Ctrl+/: full screen, a resizable bar or side panel, or a floating window, kept across reloads; phones get only full screen and the bar. With `scrolls="window"`, a page that scrolls the window stays in the document's flow, the bar or panel fixed over it. |

### `@kestack/web-platform/recipes/kabuki-devtools`

| Export           | What it does                                                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KabukiDevtools` | The Inspector on a running Kabuki app, from `App.useRuntime()`: picking a Step on its Timeline Time Travels the app, going live comes back.                                                              |
| `Inspector`      | The Step shown, drawn as a Map, with the Sheet of what is picked and the Timeline under it; it lays itself out by its own width, and its Map as a packed tree or an outline, switched from its controls. |

### `@kestack/web-platform/pwa`

| Export              | What it does                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `PwaHead`           | The PWA's head tags for a Kabuki Start Document's `head`: the manifest link, the Apple icon and the Build ID.                     |
| `Pwa`               | Around the app in the Document: registers the worker, shows the Update Prompt while a new version waits, and offers install once. |
| `PwaProvider`       | Registers the worker after mount and gives `usePwa` its Status; `Pwa` renders it.                                                 |
| `pwaHead`           | Head tags: manifest link, Apple icon, and meta tags for the Build ID, build time and commit.                                      |
| `usePwa`            | The Status with `checkForUpdate` and `applyUpdate` (`Unsupported` before mount), and the page's `version`.                        |
| `clearRuntimeCache` | Deletes every Runtime Cache; works outside `PwaProvider`, for example in sign-out.                                                |
| `UpdatePrompt`      | Persistent toast while an update is ready; accepting it reloads every page into it.                                               |
| `splashHead`        | The iOS startup image tags, one per screen iOS matches.                                                                           |
| `splashScreens`     | Each splash image's size, its `/splash/<w>x<h>.png` path, and the screen it is for, for an app to draw them.                      |

### `@kestack/web-platform/pwa/vite`

| Export | What it does                                                                                                                                                |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa`  | Vite plugins that emit the manifest, pick the Precache, compute the Build ID, build the worker (or the Kill Switch) and add `no-cache` rules to `_headers`. |

### `@kestack/web-platform/pwa/splash`

| Export          | What it does                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------- |
| `splashHead`    | The iOS startup image tags, one per screen iOS matches.                                       |
| `splashScreens` | Each splash image's size, path and screen, with no React, for a script that draws the images. |

### `@kestack/web-platform/pwa/worker`

| Export             | What it does                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `runServiceWorker` | Starts the worker; call it once at the top of the entry, optionally with a `layer` such as a Worker Server.       |
| `WorkerHost`       | Service given to that `layer`: the worker's Build ID and a stream of every `message` event that is not a Command. |

### `@kestack/web-platform/pwa/client`

| Export              | What it does                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Pwa`               | Service with the page's `status`, `checkForUpdate`, `applyUpdate` (reloads every open page) and `clearRuntimeCache`. |
| `Pwa.layer`         | Registers the worker and builds `Pwa` from the build info; browser only, never during SSR.                           |
| `PwaStatus`         | Tagged enum `Unsupported`, `Installing`, `Ready`, `UpdateReady`, `Updating`.                                         |
| `clearRuntimeCache` | Effect that deletes every Runtime Cache, with no registration or `Pwa` needed.                                       |

### `@kestack/web-platform/pwa/extras`

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

### `@kestack/web-platform/start`

The Document for an app on Kabuki Start.

| Export     | What it does                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Document` | The HTML around a Kabuki Start app: Start's head and scripts, Inter preloaded, the Theme's script and the device marked before the first paint, and the app's own head. |

### `@kestack/web-platform/account-switcher`

The Account Switcher of a Kabuki app: a Child of the root page, its View in the header, and `CurrentAccount` for every page.

| Export                | What it does                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AccountSwitcherLive` | The Child to place on the root page, given `maxAccounts`: follows auth-toolkit's `Accounts`, shows a switch once under way 150 ms and for at least 300 ms, and runs switch, add and sign-out one at a time. |
| `AccountSwitcherView` | Its slot in the header, always the width of "Sign in": the button signed out, the Account menu signed in, the remembered avatar or nothing while checking.                                                  |
| `CurrentAccount`      | The Capability the root page Provides with `CurrentAccount.layer`: who is signed in and the switch on screen as a stream, and Requests to sign in, switch and sign out.                                     |

### `@kestack/web-platform/server`

| Export              | What it does                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `isDeployedStage`   | Whether an alchemy stage reaches the world: `prod` or a pull request's `prN`.                                      |
| `assertStageIsSafe` | Refuses a deployed stage unless `ALLOW_DEPLOY=true`.                                                               |
| `domainFor`         | Where a stage is served: the domain for `prod`, `prN-<domain>` for a pull request, nowhere for anyone's own stage. |
| `devConfigFor`      | A local stage's dev server on the `PORT` portless gives it; throws when there is none.                             |

## Usage

### Building the PWA

A Kabuki Start app becomes a PWA with `pwa()` in its Vite plugins and `PwaHead` and `Pwa` in its Document. Lifted from `apps/code`.

```tsx
// vite.config.ts
ssr: { noExternal: ['@kestack/web-platform'] },
plugins: [
  tailwindcss(),
  react(),
  start({ platform: cloudflare(), app: 'src/app' }),
  pwa({
    manifest: { name: 'Code', short_name: 'Code', theme_color: '#0a0a0a', background_color: '#0a0a0a', icons },
  }),
],

// src/document.tsx
export default function Document({ children }: Start.DocumentProps) {
  return (
    <WebDocument theme={Theme} head={<PwaHead />}>
      <Pwa installTitle="Install Code">{children}</Pwa>
    </WebDocument>
  );
}
```

- Start builds the client and the Worker; `pwa()` then writes `sw.js`, `manifest.webmanifest` and a `_headers` block with `Cache-Control: no-cache` for both into the client's folder. The worker entry is the app's `src/sw.ts` if it has one, or a built-in one.
- Start draws every page on request and prerenders none, so there is no App Shell: the worker saves each page visited, per Build ID, and sends one never visited to the Offline Fallback, the app's own `public/offline.html`, as `/offline?from=<page>`. Its "Try again" should only go back to a same-origin `from`. The build warns when the file is missing.
- `@kestack/web-platform/theme` loads Inter's file, which Node cannot import, so `vite.config.ts` writes the manifest's colors itself.
- In `vite dev` the worker is off unless `pwa({ dev: true })`. `pwa({ enabled: false })` builds the Kill Switch. Paths under `neverCache` (default `/api/auth/`), non-GET requests and `navigation.denylist` never reach the caches.
- While an update waits, this build's saved page answers navigations, so every page stays on one Build ID until the user accepts ([ADR 0006](./docs/adr/0006-pending-update-pins-navigations-to-the-active-build.md)).

### A Kabuki Start app's Document

An app on Kabuki Start writes `src/document.tsx` as the Web Platform's
`Document`, wrapping the app in what sits around every page. Lifted from
`apps/kabuki-start/src/client/document.tsx`.

```tsx
// src/document.tsx
import type { Start } from '@kestack/kabuki/start';
import { Document as WebDocument } from '@kestack/web-platform/start';
import { Devtools, Theme } from './components/index.ts';

export default function Document({ children }: Start.DocumentProps) {
  return (
    <WebDocument theme={Theme}>
      <Devtools>{children}</Devtools>
    </WebDocument>
  );
}
```

```css
/* src/styles.css */
@import '@kestack/web-platform/theme/global.css';
@import '@kestack/web-platform/theme/font-inter.css';
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
- `head` adds the app's own tags, such as icons, after the Web Platform's.
  The same rule holds for any other web font: preload the file the first
  paint needs, and give it a fallback whose metrics match.
