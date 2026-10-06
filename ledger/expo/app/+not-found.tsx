import { Redirect } from 'expo-router';

/** An address no Place lives at, such as a stale deep link, lands on Home. */
export default function NotFound() {
  return <Redirect href="/" />;
}
