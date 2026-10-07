/**
 * The reading direction in force.
 *
 * The context lives here rather than beside the `Direction` component so that
 * anything can read it cheaply. `Text` in particular has to: `direction` is a
 * Yoga *layout* property, and React Native resolves a paragraph's alignment
 * from the process-wide `I18nManager.isRTL` instead — so without this, an
 * Arabic paragraph inside `<Direction dir="rtl">` mirrors the furniture around
 * it and then sits left-aligned inside it.
 *
 * Keeping it in a hook also keeps the dependency the right way round: a
 * component that only needs to know the direction pulls in a hook, not the
 * whole provider.
 */
import { createContext, useContext } from 'react';
import { I18nManager } from 'react-native';

export type DirectionValue = 'ltr' | 'rtl';

/** What the device is set to, for anything outside a provider. */
export const deviceDirection = (): DirectionValue =>
  I18nManager.isRTL ? 'rtl' : 'ltr';

export const DirectionContext = createContext<DirectionValue | null>(null);

/**
 * The reading direction in force, for a component that has to flip maths Yoga
 * cannot flip for it. Safe with no provider mounted: it falls back to the
 * device's own setting.
 */
export function useDirection(): DirectionValue {
  return useContext(DirectionContext) ?? deviceDirection();
}

/**
 * `-1` in a right-to-left subtree, `1` otherwise.
 *
 * The form most of the pixel maths actually wants. A drag translation, an
 * indicator offset and a sweep are all a number that has to change sign, and
 * writing `dir === 'rtl' ? -x : x` at every one of them is where the sign
 * errors live.
 */
export function useDirectionSign(): 1 | -1 {
  return useDirection() === 'rtl' ? -1 : 1;
}
