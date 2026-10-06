import '../global.css';
import { PanelUIProvider } from '@kstackz/expo-toolkit/components/panel-ui-provider';
import { useThemeFonts } from '@kstackz/expo-toolkit/theme';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// The page colour is the theme's `bg-background`, drawn by PanelUIProvider;
// the navigator stays transparent over it instead of painting its own grey.
const navigation = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent' },
};

export default function Layout() {
  if (!useThemeFonts()) return null;
  return (
    <PanelUIProvider>
      <ThemeProvider value={navigation}>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </PanelUIProvider>
  );
}
