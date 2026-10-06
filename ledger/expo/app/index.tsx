// Phase 2 shell: proves the Expo Toolkit's theme, components and feedback
// render in Expo Go. Phase 3 replaces it with Ledger's Home.
import { Button } from '@kstackz/expo-toolkit/components/button';
import { Card } from '@kstackz/expo-toolkit/components/card';
import { Item } from '@kstackz/expo-toolkit/components/item';
import { Switch } from '@kstackz/expo-toolkit/components/switch';
import { Tabs } from '@kstackz/expo-toolkit/components/tabs';
import { Text } from '@kstackz/expo-toolkit/components/text';
import { createSounds, haptic } from '@kstackz/expo-toolkit/feedback';
import { useTheme } from '@kstackz/expo-toolkit/theme';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const sounds = createSounds({ tick: require('../assets/sounds/tick.wav') });

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [scheme, setScheme] = useState<string>('system');
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(true);

  const choose = (next: string) => {
    setScheme(next);
    setTheme(next as 'light' | 'dark' | 'system');
  };

  const tap = () => {
    if (haptics) haptic('light');
    if (sound) sounds.play('tick');
  };

  return (
    <SafeAreaView className="flex-1">
      <ScrollView contentContainerClassName="gap-6 p-4">
        <Text size="3xl" weight="bold">
          Ledger
        </Text>
        <Text muted>
          The Expo Toolkit on SDK 57: Ledger's tokens, Panel UI components,
          haptics and sound. Theme in use: {theme}.
        </Text>

        <Tabs
          variant="segmented"
          value={scheme}
          onValueChange={choose}
          defaultValue="system"
        >
          <Tabs.List>
            <Tabs.Trigger value="light">Light</Tabs.Trigger>
            <Tabs.Trigger value="dark">Dark</Tabs.Trigger>
            <Tabs.Trigger value="system">System</Tabs.Trigger>
          </Tabs.List>
        </Tabs>

        <Card>
          <Card.Header>
            <Card.Title>Feedback</Card.Title>
            <Card.Description>
              What a tap feels and sounds like.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <Item.Group>
              <Item>
                <Item.Content>
                  <Item.Title>Haptics</Item.Title>
                </Item.Content>
                <Item.Actions>
                  <Switch
                    value={haptics}
                    onValueChange={setHaptics}
                    label="Haptics"
                  />
                </Item.Actions>
              </Item>
              <Item.Separator />
              <Item>
                <Item.Content>
                  <Item.Title>Sounds</Item.Title>
                </Item.Content>
                <Item.Actions>
                  <Switch
                    value={sound}
                    onValueChange={setSound}
                    label="Sounds"
                  />
                </Item.Actions>
              </Item>
            </Item.Group>
          </Card.Content>
        </Card>

        <Button onPress={tap}>Tap</Button>
        <Button variant="destructive">Delete</Button>
      </ScrollView>
    </SafeAreaView>
  );
}
