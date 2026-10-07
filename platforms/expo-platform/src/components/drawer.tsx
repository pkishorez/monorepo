/**
 * Drawer — a panel that comes in from an edge of the screen and covers the app
 * until it is dismissed.
 *
 * ```tsx
 * <Drawer>
 *   <Drawer.Trigger>
 *     <Button variant="outline">Menu</Button>
 *   </Drawer.Trigger>
 *   <Drawer.Content>
 *     <Drawer.Header title="Workspace" description="Switch or manage" />
 *     <Drawer.Body>
 *       <Item title="Projects" />
 *       <Item title="Members" />
 *     </Drawer.Body>
 *     <Drawer.Footer>
 *       <Button className="flex-1">Settings</Button>
 *     </Drawer.Footer>
 *   </Drawer.Content>
 * </Drawer>
 * ```
 *
 * ## Why the sides are `start` and `end`
 *
 * A drawer is the one overlay whose whole identity is the edge it belongs to,
 * and in a right-to-left app "the navigation edge" is the right one. Naming the
 * sides `left` and `right` would bake a reading direction into the API and
 * force every caller in an RTL app to invert it themselves, so the sides are
 * logical: `start` is the edge text begins at, `end` the edge it runs toward.
 * Both follow the enclosing `<Direction>`, and `top` and `bottom` mean what
 * they say because the vertical axis does not mirror.
 *
 * Yoga mirrors the panel's own position, because that is laid out from `start-0`
 * / `end-0`. It does not mirror the drag, which is measured in raw pixels — so
 * the gesture consults the direction and negates itself, which is what keeps a
 * swipe *outward* dismissing in both directions rather than only one.
 *
 * ## Why it is not a BottomSheet with a different edge
 *
 * A sheet is sized by its content and dragged along the axis its scroller runs
 * on, which is why so much of it is about sharing one drag between the two. A
 * side drawer is sized by the screen and dragged across its scroller's axis, so
 * the two gestures never compete: the cross-axis drag simply fails and the list
 * keeps it. That difference is the reason this is a separate component and not
 * a prop on the sheet.
 */
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type ScrollViewProps,
  type ViewProps,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  SlideInDown,
  SlideInLeft,
  SlideInRight,
  SlideInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tv } from 'tailwind-variants';
import { useCSSVariable } from 'uniwind';
import { XIcon } from './icons';
import { ModalPortal } from './parts/portal';
import { Scrim } from './parts/scrim';
import { Text, textChildren } from './text';
import { useBackHandler } from './parts/use-back-handler';
import {
  DirectionContext,
  useDirection,
  useDirectionSign,
} from './parts/use-direction';
import { cn } from '../theme';

const SPRING = { damping: 24, stiffness: 300, mass: 0.7 } as const;
/** How long the panel takes to leave, whether by a drag or a press. */
const EXIT_DURATION = 200;

/** How far a drag has to travel outward before releasing it dismisses. */
const DISMISS_DISTANCE = 80;
/** A flick this fast dismisses regardless of how far it got. */
const DISMISS_VELOCITY = 650;

export type DrawerSide = 'start' | 'end' | 'top' | 'bottom';
export type DrawerSize = 'sm' | 'md' | 'lg' | 'full';
export type DrawerCloseSide = 'start' | 'end';

/**
 * How much of the screen each size asks for, and the cap it is never allowed
 * past on a wide screen.
 *
 * The cap is the whole point. A fraction alone reads correctly on a phone and
 * absurdly on a tablet, where 78% of the width is a navigation list with a
 * column of whitespace beside it. Capping turns the fraction into "no wider
 * than it needs to be", which is what a drawer is.
 */
const WIDTH = {
  sm: { fraction: 0.62, max: 280 },
  md: { fraction: 0.78, max: 320 },
  lg: { fraction: 0.88, max: 400 },
  // Not 1: an edge of the app left showing is what says it is still there
  // behind the drawer, and it is also the only thing left to tap to dismiss.
  full: { fraction: 0.94, max: Infinity },
} as const;

/** The same idea on the vertical axis, where there is no sensible cap. */
const HEIGHT = {
  sm: 0.3,
  md: 0.45,
  lg: 0.62,
  full: 0.94,
} as const;

const panelVariants = tv({
  base: 'absolute border-border bg-popover shadow-lg',
  variants: {
    side: {
      // Three real edges each. The fourth is the screen edge the drawer is
      // docked to, and drawing a border or a radius along it would be a line
      // through the middle of nothing.
      start: 'bottom-0 start-0 top-0 rounded-e-3xl border-e',
      end: 'bottom-0 end-0 top-0 rounded-s-3xl border-s',
      top: 'end-0 start-0 top-0 rounded-b-3xl border-b',
      bottom: 'bottom-0 end-0 start-0 rounded-t-3xl border-t',
    },
  },
  defaultVariants: {
    side: 'start',
  },
});

interface DrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawer(component: string): DrawerContextValue {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error(`${component} must be used within a <Drawer>`);
  }
  return context;
}

/**
 * What the panel knows and its parts need: which corner the close button took,
 * so a header can leave it clear rather than wrap underneath it.
 */
interface DrawerSurfaceValue {
  closeSide: DrawerCloseSide;
  showClose: boolean;
}

const DrawerSurfaceContext = createContext<DrawerSurfaceValue | null>(null);

export interface DrawerProps {
  children: ReactNode;
  /** Open state, when you want to own it. Pair with `onOpenChange`. */
  open?: boolean;
  /** Called with the next open state, whether the drawer or you caused it. */
  onOpenChange?: (open: boolean) => void;
  /** Open state to start at when you are not controlling it. */
  defaultOpen?: boolean;
}

function DrawerRoot({
  children,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
}: DrawerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange]
  );

  const context = useMemo<DrawerContextValue>(
    () => ({ open, setOpen }),
    [open, setOpen]
  );

  return (
    <DrawerContext.Provider value={context}>{children}</DrawerContext.Provider>
  );
}

export interface DrawerTriggerProps {
  /** A single pressable element. Its own `onPress` still runs. */
  children: ReactElement<{ onPress?: (...args: unknown[]) => void }>;
}

function DrawerTrigger({ children }: DrawerTriggerProps) {
  const { setOpen } = useDrawer('Drawer.Trigger');
  if (!isValidElement(children)) return children;

  return cloneElement(children, {
    onPress: (...args: unknown[]) => {
      children.props.onPress?.(...args);
      setOpen(true);
    },
  });
}

export interface DrawerCloseProps {
  /** A single pressable element. Its own `onPress` still runs. */
  children: ReactElement<{ onPress?: (...args: unknown[]) => void }>;
}

function DrawerClose({ children }: DrawerCloseProps) {
  const { setOpen } = useDrawer('Drawer.Close');
  if (!isValidElement(children)) return children;

  return cloneElement(children, {
    onPress: (...args: unknown[]) => {
      children.props.onPress?.(...args);
      setOpen(false);
    },
  });
}

export interface DrawerContentProps extends ViewProps {
  className?: string;
  /**
   * Which edge the drawer is docked to. `start` and `end` are the edges text
   * begins and ends at, so both follow the enclosing `<Direction>` rather than
   * pinning the drawer to a physical side.
   */
  side?: DrawerSide;
  /**
   * How much of the screen the drawer takes — its width on `start` / `end`, its
   * height on `top` / `bottom`. A horizontal drawer is also capped in points,
   * so `md` is a 320-point navigation panel on a tablet rather than 78% of it.
   */
  size?: DrawerSize;
  /** Tap on the backdrop closes the drawer. Default true. */
  dismissible?: boolean;
  /**
   * Drag the drawer back toward its edge to dismiss it. Default true. Turn it
   * off for a drawer whose content wants the same axis — a horizontal
   * scroller in a side drawer.
   */
  swipeToDismiss?: boolean;
  /** Show a close button in the drawer's inner top corner. Default true. */
  showClose?: boolean;
  /**
   * Which top corner the close button takes. Logical, like `side`: `end` is the
   * corner text runs toward, so it is the right one in a left-to-right app and
   * the left one in a right-to-left one.
   *
   * Defaults to the corner *away* from the docked edge, so an `end` drawer's
   * button does not sit against the screen edge the panel came out of. Set it
   * when the drawer reads better with the button on the outer corner instead —
   * a panel people close by reaching for the same corner every time.
   */
  closeSide?: DrawerCloseSide;
  /**
   * Frost the screen behind the drawer instead of dimming it. Needs the
   * optional `expo-blur`; without it this dims, rather than failing.
   *
   * Someone who has Reduce Transparency switched on gets an opaque
   * backdrop instead, which is the whole point of the setting.
   */
  blur?: boolean;
  children?: ReactNode;
}

function DrawerContent({
  className,
  side = 'start',
  size = 'md',
  dismissible = true,
  swipeToDismiss = true,
  showClose = true,
  closeSide,
  blur = false,
  children,
  ...props
}: DrawerContentProps) {
  const { open, setOpen } = useDrawer('Drawer.Content');
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  const sign = useDirectionSign();
  const closeTint = useCSSVariable('--color-muted-foreground');

  // Memoised for the reason `Direction` memoises its own: this is the object
  // that invalidates layout for the whole panel, and a fresh one every render
  // would re-run Yoga over it for a value that almost never changes.
  const directionStyle = useMemo(() => ({ direction: dir }) as const, [dir]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  // An open drawer catches the Android back button, closing itself instead of
  // popping the screen behind it.
  useBackHandler(open, close);

  const horizontal = side === 'start' || side === 'end';

  /**
   * How far the panel has to travel to be fully off-screen — the distance a
   * dismissing drag animates out to, and the axis the drag is measured on.
   */
  const extent = horizontal
    ? Math.min(screenWidth * WIDTH[size].fraction, WIDTH[size].max)
    : screenHeight * HEIGHT[size];

  /**
   * Which way "outward" points in raw pixels.
   *
   * Yoga has already mirrored where the panel sits, but a transform is not
   * laid out — it is applied to whatever Yoga decided — so this is the one
   * place that has to know the reading direction and negate itself. A `start`
   * drawer leaves toward negative X in a left-to-right app and positive X in a
   * right-to-left one; `end` is the mirror of that.
   */
  const outward = horizontal
    ? (side === 'start' ? -1 : 1) * sign
    : side === 'top'
      ? -1
      : 1;

  /** Outward drag distance in points. Negative means dragged further in. */
  const travel = useSharedValue(0);

  /*
   * Parked at zero on every open. A swipe-dismiss leaves the panel a full
   * extent outward, and without this the next open would draw a lit backdrop
   * over an app with the drawer still off-screen behind it — dimmed, blocking,
   * and with nothing on it to close.
   */
  useEffect(() => {
    if (open) {
      travel.value = 0;
      return;
    }
    /*
     * And parked again once a swipe-dismiss has slid out. Reset only on open,
     * the drawer that mounts next drew its first frame from the old `travel`
     * and the entering slide then left it there, part way in (seen on iOS
     * after every drag to close). The exit has read `travel` already.
     */
    const parked = setTimeout(() => {
      travel.value = 0;
    }, EXIT_DURATION + 50);
    return () => clearTimeout(parked);
  }, [open, travel]);

  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .enabled(swipeToDismiss)
      .onChange((event) => {
        const delta = (horizontal ? event.changeX : event.changeY) * outward;
        const next = travel.value + delta;
        // Follow the finger outward; rubber-band the pull further in, which
        // has nowhere to go.
        travel.value = next > 0 ? next : next / 3;
      })
      .onEnd((event) => {
        const velocity =
          (horizontal ? event.velocityX : event.velocityY) * outward;
        if (travel.value > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
          // Straight to the exit, without finishing the slide first. The exit
          // starts from wherever `travel` is and carries it the rest of the
          // way, so driving it to `extent` here would be the same distance
          // animated twice.
          runOnJS(close)();
        } else {
          travel.value = withSpring(0, SPRING);
        }
      });

    /*
     * The drag has to give way to whatever the content is doing on the other
     * axis. A side drawer holds a vertical list, so a mostly-vertical drag
     * fails here and the list keeps it — which is why a side drawer needs none
     * of the shared-gesture machinery a bottom sheet does.
     */
    return horizontal
      ? gesture.activeOffsetX([-12, 12]).failOffsetY([-18, 18])
      : gesture.activeOffsetY([-12, 12]).failOffsetX([-18, 18]);
  }, [close, extent, horizontal, outward, swipeToDismiss, travel]);

  const panelStyle = useAnimatedStyle(() =>
    horizontal
      ? { transform: [{ translateX: travel.value * outward }] }
      : { transform: [{ translateY: travel.value * outward }] }
  );

  /*
   * Resolved once and shared, because the button's corner and the header's
   * clearance are the same decision seen from two places. Letting each work it
   * out from `side` is how they drift, and a header padded on the wrong side
   * runs its title straight under the button.
   */
  const closeCorner: DrawerCloseSide = closeSide ?? (side === 'end' ? 'start' : 'end');

  const surface = useMemo<DrawerSurfaceValue>(
    () => ({ closeSide: closeCorner, showClose }),
    [closeCorner, showClose]
  );

  /*
   * The slide out is written by hand, because the panel is not always at rest
   * when it starts.
   *
   * A preset animates from the view's *layout* position and applies its own
   * transform, which overrides the one the drag was already using. So a
   * swipe-dismiss played twice: the gesture carried the panel off-screen, and
   * then the exit put it back at zero and slid it out again. Seeding the
   * initial transform from `travel` makes the two one animation — the exit
   * picks the panel up wherever the finger left it and carries it the rest of
   * the way. A press on the close button or the backdrop leaves `travel` at
   * zero, so that path is the same slide it always was.
   *
   * Above the early return, with every other hook. It reads nothing that is
   * only known once the drawer is open, and a hook below that return is one
   * that runs on an open drawer and not on a closed one.
   */
  const exiting = useCallback(() => {
    'worklet';
    const shift = extent * outward;
    const from = travel.value * outward;
    const timing = { duration: EXIT_DURATION, easing: Easing.out(Easing.quad) };

    return {
      initialValues: {
        transform: horizontal
          ? [{ translateX: from }, { translateY: 0 }]
          : [{ translateX: 0 }, { translateY: from }],
      },
      animations: {
        transform: horizontal
          ? [{ translateX: withTiming(shift, timing) }, { translateY: 0 }]
          : [{ translateX: 0 }, { translateY: withTiming(shift, timing) }],
      },
    };
  }, [extent, horizontal, outward, travel]);

  if (!open) return null;

  /*
   * The slide has to be given a physical direction, since the animation
   * presets are physical. This is the same mirroring Yoga did for the panel's
   * position, applied by hand to the one thing Yoga does not own.
   */
  const physical: 'left' | 'right' | 'top' | 'bottom' = horizontal
    ? (side === 'start') === (dir === 'ltr')
      ? 'left'
      : 'right'
    : side;

  const entering = {
    left: SlideInLeft,
    right: SlideInRight,
    top: SlideInUp,
    bottom: SlideInDown,
  }[physical];

  /*
   * The inset and the panel's own padding stack rather than compete.
   *
   * A drawer that reaches the top of the screen is drawn behind the status bar
   * on purpose — a surface the app disappears under should not stop short of
   * the edge — but the clock and the battery are drawn *in* that band, so the
   * content clears the whole of it and then takes its padding on top. `Math.max`
   * gave the two the same slot: on a 59-point inset it resolved to 59, leaving
   * the header and the close button flush against the clock with nothing
   * between them.
   *
   * `bottom` is the one side whose top edge is nowhere near the status bar, and
   * `top` the one side ending in open screen rather than at the home indicator.
   * Each takes plain padding on the edge it does not meet.
   */
  const padding = {
    paddingTop: side === 'bottom' ? 16 : insets.top + 16,
    paddingBottom: side === 'top' ? 16 : Math.max(insets.bottom, 16),
  };

  return (
    <ModalPortal>
      {/* Portal content mounts under PortalHost, outside this provider's
          subtree — re-provide the context so Drawer.Close keeps working. */}
      <DrawerContext.Provider value={{ open, setOpen }}>
        {/*
         * The reading direction has to be put back on this layer, and in both
         * of its forms.
         *
         * A portal escapes the `Direction` the drawer was written inside twice
         * over. It escapes the *context*, because an element reads context from
         * where it is rendered rather than from where it was written — the same
         * reason `Drawer.Close` needs its provider back. And it escapes the
         * *style*, because the flip is Yoga's: `direction` mirrors the view
         * subtree it is set on, and this one now hangs off the portal host
         * instead. Without the style a `start` drawer in a right-to-left app
         * docks to the left while its animation comes from the right; without
         * the provider its rows and its text stay left-to-right inside it.
         */}
        <DirectionContext.Provider value={dir}>
          <View className="absolute inset-0" style={directionStyle}>
            <View className="absolute inset-0">
              {/* Scrim draws the backdrop and its own fade; the Pressable over
                  it is what closes the drawer, since the scrim takes no
                  touches. */}
              <Scrim blur={blur} />
              <Pressable
                accessibilityLabel="Close drawer"
                className="flex-1"
                onPress={dismissible ? close : undefined}
              />
            </View>
            <GestureDetector gesture={pan}>
              <Animated.View
                entering={entering
                  .springify()
                  .damping(24)
                  .stiffness(260)
                  .mass(0.7)}
                exiting={exiting}
                accessibilityViewIsModal
                className={panelVariants({ side, className })}
                {...props}
                // After the spread, and folding the caller's own `style` in
                // rather than replacing the array: spread last, a caller
                // passing `style` would silently drop the drag transform and
                // the safe-area padding with it.
                style={[
                  panelStyle,
                  padding,
                  horizontal ? { width: extent } : { height: extent },
                  props.style,
                ]}
              >
                <DrawerSurfaceContext.Provider value={surface}>
                  {textChildren(children)}
                  {/*
                   * Last, and lifted above the content, so a header that spans
                   * the panel cannot bury it — in React Native a later sibling
                   * wins the touch, and a close button drawn first under a
                   * full-width title reads as a button that only works near its
                   * top edge.
                   *
                   * Offset by the panel's own top padding rather than pinned
                   * with `top-0`. An absolutely positioned child's containing
                   * block is the padding *edge*, so padding moves the content
                   * around it and leaves it where it was — `top-0` put the
                   * button at the top of the panel, which on the three sides
                   * that reach the top of the screen is behind the status bar.
                   * Taking the same number the padding does is what keeps it
                   * level with the first line of the header on every side.
                   *
                   * The corner follows the docked edge by default. An `end`
                   * drawer's own edge is the trailing one, so its button moves
                   * to the leading side rather than sitting against the screen
                   * edge the drawer came out of — and `closeSide` overrides
                   * that for a panel that wants the same corner every time.
                   */}
                  {showClose ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Close"
                      onPress={close}
                      hitSlop={8}
                      className={cn(
                        'absolute z-10 h-8 w-8 items-center justify-center rounded-full bg-muted active:opacity-70',
                        closeCorner === 'start' ? 'start-4' : 'end-4'
                      )}
                      style={{ top: padding.paddingTop }}
                    >
                      <XIcon
                        size={16}
                        color={
                          typeof closeTint === 'string' ? closeTint : undefined
                        }
                      />
                    </Pressable>
                  ) : null}
                </DrawerSurfaceContext.Provider>
              </Animated.View>
            </GestureDetector>
          </View>
        </DirectionContext.Provider>
      </DrawerContext.Provider>
    </ModalPortal>
  );
}

export interface DrawerHeaderProps extends ViewProps {
  className?: string;
  /** Heading for the drawer. Strings are wrapped; anything else is drawn as given. */
  title?: ReactNode;
  /** A line under the title, for what the drawer is for. */
  description?: ReactNode;
  children?: ReactNode;
}

function DrawerHeader({
  className,
  title,
  description,
  children,
  ...props
}: DrawerHeaderProps) {
  const surface = useContext(DrawerSurfaceContext);

  /*
   * Padding on whichever side the close button took, so a long title wraps
   * above it rather than running underneath it. Nothing to clear when the
   * button was turned off, and a header used outside a panel keeps its plain
   * padding rather than reserving a corner for a button that is not there.
   */
  const clearance = !surface?.showClose
    ? undefined
    : surface.closeSide === 'start'
      ? 'ps-14'
      : 'pe-14';

  return (
    <View className={cn('gap-1 px-5 pb-3', clearance, className)} {...props}>
      {typeof title === 'string' ? (
        <Text size="lg" weight="semibold">
          {title}
        </Text>
      ) : (
        title
      )}
      {typeof description === 'string' ? (
        <Text className="text-sm text-muted-foreground">{description}</Text>
      ) : (
        description
      )}
      {textChildren(children)}
    </View>
  );
}

export interface DrawerBodyProps extends ScrollViewProps {
  className?: string;
  /**
   * Scroll the body when it overflows. Pass `false` to lay the content out
   * plainly instead — for a drawer whose content is known to fit, and for one
   * that brings its own list, since a scroller nested inside this one leaves
   * neither of them scrolling properly.
   */
  scrollable?: boolean;
  children?: ReactNode;
}

function DrawerBody({
  className,
  scrollable = true,
  children,
  contentContainerStyle,
  ...props
}: DrawerBodyProps) {
  if (!scrollable) {
    return (
      <View className={cn('flex-1 px-5', className)}>
        {textChildren(children)}
      </View>
    );
  }

  return (
    <ScrollView
      className={cn('flex-1', className)}
      showsVerticalScrollIndicator={false}
      // The drawer's own drag runs across this axis and fails out of a mostly
      // vertical touch, so the two never have to be reconciled.
      contentContainerStyle={[{ paddingHorizontal: 20 }, contentContainerStyle]}
      {...props}
    >
      {textChildren(children)}
    </ScrollView>
  );
}

export interface DrawerFooterProps extends ViewProps {
  className?: string;
  children?: ReactNode;
}

function DrawerFooter({ className, children, ...props }: DrawerFooterProps) {
  return (
    <View
      className={cn(
        'flex-row items-center gap-2 border-t border-border px-5 pt-3',
        className
      )}
      {...props}
    >
      {textChildren(children)}
    </View>
  );
}

export const Drawer = Object.assign(DrawerRoot, {
  Trigger: DrawerTrigger,
  Content: DrawerContent,
  Header: DrawerHeader,
  Body: DrawerBody,
  Footer: DrawerFooter,
  Close: DrawerClose,
});
