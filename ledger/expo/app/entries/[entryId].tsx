import { useLocalSearchParams } from 'expo-router';
import { Entry } from '../../src/screens/places/entries';

export default function EntryRoute() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  return <Entry entryId={entryId} />;
}
