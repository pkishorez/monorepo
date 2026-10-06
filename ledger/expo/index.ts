// Where the phone starts Ledger: Hermes gets what core expects of a runtime
// first, then Expo Router loads the routes in app/.
import './src/runtime/hermes';
import 'expo-router/entry';
