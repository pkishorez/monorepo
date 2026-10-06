import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '../../components/button';
import { Dialog } from '../../components/dialog';
import { Input } from '../../components/input';
import { Text } from '../../components/text';

/** Who to sign in as, when sign-in is local. */
export interface LocalSignInChoice {
  email: string;
  name?: string;
}

const initials = (choice: LocalSignInChoice) =>
  (choice.name || choice.email)
    .split(/[\s@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/**
 * Stands in for a real sign-in when an app runs on its own, as
 * ui-toolkit's LocalSignIn does on the web: the User picks a preset or
 * types who they want to be. Nothing leaves the device.
 */
export function LocalSignIn(props: {
  open: boolean;
  presets: ReadonlyArray<LocalSignInChoice>;
  onChoose: (choice: LocalSignInChoice) => void;
  /** Called when the User closes the dialog without choosing. */
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const submit = () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    props.onChoose(
      name.trim() ? { email: trimmed, name: name.trim() } : { email: trimmed },
    );
    setEmail('');
    setName('');
  };
  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!next) props.onCancel();
      }}
    >
      <Dialog.Content>
        <Dialog.Title>Who should sign in?</Dialog.Title>
        <Dialog.Description>
          Nothing here leaves this device. Pick anyone to continue as.
        </Dialog.Description>
        <View className="-mx-2 gap-1">
          {props.presets.map((choice) => (
            <Pressable
              key={choice.email}
              accessibilityRole="button"
              accessibilityLabel={`Sign in as ${choice.name ?? choice.email}`}
              onPress={() => props.onChoose(choice)}
              className="flex-row items-center gap-3 rounded-lg px-2 py-2 active:bg-muted"
            >
              <View className="size-8 items-center justify-center rounded-full bg-muted">
                <Text className="text-xs" weight="medium">
                  {initials(choice)}
                </Text>
              </View>
              <View className="flex-1">
                {choice.name ? (
                  <Text className="text-sm">{choice.name}</Text>
                ) : null}
                <Text muted className="text-xs">
                  {choice.email}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
        <View className="gap-3">
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="someone@example.com"
            onSubmitEditing={submit}
          />
          <Input
            label="Name (optional)"
            value={name}
            onChangeText={setName}
            onSubmitEditing={submit}
          />
        </View>
        <Dialog.Footer>
          <Button variant="outline" onPress={props.onCancel}>
            Cancel
          </Button>
          <Button disabled={!email.trim()} onPress={submit}>
            Continue
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
