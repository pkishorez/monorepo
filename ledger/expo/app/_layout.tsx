import '../global.css';
import { PanelUIProvider } from '@kstackz/expo-platform/components/panel-ui-provider';
import { useTheme, useThemeFonts } from '@kstackz/expo-platform/theme';
import { DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { restoreTheme } from '../src/ledger';
import { Shell } from '../src/screens/shell';

restoreTheme();

// The page colour is the theme's `bg-background`, drawn by PanelUIProvider;
// the navigator stays transparent over it instead of painting its own grey.
const navigation = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

/**
 * Every Place, inside Ledger's shell, one at a time: Go shows the new Place
 * at once, and nothing stays mounted behind it to answer Commands, as on the
 * web. There is no back stack to swipe through; the left edge is the
 * Sidebar's.
 */
export default function Layout() {
  const { theme } = useTheme();
  if (!useThemeFonts()) return null;
  return (
    <GestureHandlerRootView className="flex-1">
      <PanelUIProvider>
        <ThemeProvider value={navigation}>
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
          <Shell>
            <Slot />
          </Shell>
        </ThemeProvider>
      </PanelUIProvider>
    </GestureHandlerRootView>
  );
}
