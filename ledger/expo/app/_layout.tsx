import '../global.css';
import { PanelUIProvider } from '@kstackz/expo-toolkit/components/panel-ui-provider';
import { useTheme, useThemeFonts } from '@kstackz/expo-toolkit/theme';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
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

/** Every Place, inside Ledger's shell. Go shows the new Place at once. */
export default function Layout() {
  const { theme } = useTheme();
  if (!useThemeFonts()) return null;
  return (
    <GestureHandlerRootView className="flex-1">
      <PanelUIProvider>
        <ThemeProvider value={navigation}>
          <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
          <Shell>
            <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
          </Shell>
        </ThemeProvider>
      </PanelUIProvider>
    </GestureHandlerRootView>
  );
}
