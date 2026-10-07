/**
 * Choice: one of a few things, as a row of pills that scrolls sideways when
 * it does not fit — kinds, categories, days. The chosen one is the only one
 * filled. A swipe right at its start is not its own, so it reaches what is
 * around it, such as a Sidebar. The native twin of the web's pill row; the toolkit's own, not a
 * Panel UI copy.
 *
 * ```tsx
 * <Choice label="Kind" value={kind} onChange={setKind}
 *   options={[{ value: 'cash', label: 'Cash', icon: <Glyph icon={Cash01Icon} /> }]} />
 * ```
 */
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { NativeScroll } from '../input';
import { cn } from '../theme';
import { IconColorProvider } from './icons';
import { Text } from './text';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Drawn before the label, in the pill's text colour. */
  icon?: ReactNode;
}

export interface ChoiceProps<T extends string> {
  /** What is being chosen, for a screen reader. */
  label: string;
  value: T;
  options: ReadonlyArray<ChoiceOption<T>>;
  onChange: (value: T) => void;
  /** Extra classes for the scrolling row's content. */
  className?: string;
  /**
   * How far, in points, the row reaches past its container on each side, to
   * the screen's edge, so pills scroll in from the edge rather than being cut
   * at the padding. Usually the container's own side padding.
   */
  bleed?: number;
}

export function Choice<T extends string>(props: ChoiceProps<T>) {
  const on = useCSSVariable('--color-primary-foreground');
  const off = useCSSVariable('--color-foreground');
  return (
    <NativeScroll
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={props.label}
      keyboardShouldPersistTaps="handled"
      style={props.bleed ? { marginHorizontal: -props.bleed } : undefined}
      contentContainerStyle={
        props.bleed ? { paddingHorizontal: props.bleed } : undefined
      }
      contentContainerClassName={cn('gap-1.5', props.className)}
    >
      {props.options.map((option) => {
        const chosen = option.value === props.value;
        const tint = chosen ? on : off;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: chosen }}
            onPress={() => props.onChange(option.value)}
            className={cn(
              'h-9 flex-row items-center gap-1.5 rounded-full border px-3.5',
              chosen
                ? 'border-primary bg-primary'
                : 'border-border active:bg-muted',
            )}
          >
            {option.icon !== undefined && (
              <IconColorProvider
                color={typeof tint === 'string' ? tint : undefined}
              >
                {option.icon}
              </IconColorProvider>
            )}
            <Text
              className={cn(
                'text-sm',
                chosen ? 'text-primary-foreground' : 'text-foreground',
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </NativeScroll>
  );
}
