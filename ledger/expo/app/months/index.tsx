import { useLocalSearchParams } from 'expo-router';
import { Months } from '../../src/screens/places/months';

export default function MonthsRoute() {
  const { at } = useLocalSearchParams<{ at?: string }>();
  return <Months at={at} />;
}
