import { cn } from '@kstackz/expo-platform/theme';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

/**
 * The page a Place is drawn in: it scrolls, with room at its foot so the
 * Add button never covers the last row.
 */
export function Scroll(props: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerClassName={cn('px-4 pt-5 pb-28', props.className)}
    >
      {props.children}
    </ScrollView>
  );
}
