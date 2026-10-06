import { useLocalSearchParams } from 'expo-router';
import { Entries } from '../../src/screens/places/entries';

export default function EntriesRoute() {
  const { account } = useLocalSearchParams<{ account?: string }>();
  return <Entries account={account} />;
}
