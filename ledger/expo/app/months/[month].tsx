import { isMonthKey } from '@ledger/core/shared/ledger';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { Month } from '../../src/screens/places/months';

export default function MonthRoute() {
  const { month } = useLocalSearchParams<{ month: string }>();
  // Not a Month: the list of them, as the web's not-found goes nowhere.
  if (!isMonthKey(month)) return <Redirect href="/months" />;
  return <Month key={month} month={month} />;
}
