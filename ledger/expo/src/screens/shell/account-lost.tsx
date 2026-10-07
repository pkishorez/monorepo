import { Button } from '@kstackz/expo-toolkit/components/button';
import { Dialog } from '@kstackz/expo-toolkit/components/dialog';
import { useGate } from '../../ledger';

/**
 * Says, once, that a User was signed out somewhere else: their money left
 * this phone, and whoever else is signed in opened instead.
 */
export function AccountLost() {
  const { notice, dismissNotice: dismiss } = useGate();
  const lost = notice?.kind === 'accountLost' ? notice.user : null;
  return (
    <Dialog open={lost !== null} onOpenChange={(open) => !open && dismiss()}>
      <Dialog.Content>
        <Dialog.Title>{`${lost?.name ?? ''} was signed out`}</Dialog.Title>
        <Dialog.Description>
          {`${lost?.name ?? ''} signed out somewhere else, or their sign-in ran out, so their money left this phone. It is still in their account; sign them in again to see it here.`}
        </Dialog.Description>
        <Dialog.Footer>
          <Button onPress={dismiss}>OK</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
