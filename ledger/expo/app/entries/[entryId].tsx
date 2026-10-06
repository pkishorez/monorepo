import { validateEntriesSearch } from '@ledger/core/client/views';
import { useLocalSearchParams } from 'expo-router';
import { Entry } from '../../src/screens/places/entries';

export default function EntryRoute() {
  const { entryId, ...search } = useLocalSearchParams<{ entryId: string }>();
  return <Entry entryId={entryId} search={validateEntriesSearch(search)} />;
}
