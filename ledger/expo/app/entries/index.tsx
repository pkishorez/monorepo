import { validateEntriesSearch } from '@ledger/core/client/views';
import { useLocalSearchParams } from 'expo-router';
import { Entries } from '../../src/screens/places/entries';

export default function EntriesRoute() {
  const params = useLocalSearchParams();
  return <Entries search={validateEntriesSearch(params)} />;
}
