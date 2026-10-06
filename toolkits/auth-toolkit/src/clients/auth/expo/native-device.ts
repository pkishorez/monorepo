import {
  AuthRequest,
  CodeChallengeMethod,
  ResponseType,
} from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { Linking } from 'react-native';
import type { Device } from './device.js';

// Readable once the phone has been unlocked after a restart, so a refresh
// can run in the background; never restored to another phone from a backup.
const keychain = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** The phone itself: the keychain (Keystore on Android) through
 * expo-secure-store, ASWebAuthenticationSession (Custom Tabs on Android)
 * through expo-auth-session, and the system browser. */
export const nativeDevice = (): Device => ({
  secrets: {
    get: (key) => SecureStore.getItemAsync(key, keychain),
    set: (key, value) => SecureStore.setItemAsync(key, value, keychain),
    remove: (key) => SecureStore.deleteItemAsync(key, keychain),
  },
  authorize: async ({
    authorizationEndpoint,
    clientId,
    redirectUri,
    scopes,
    params,
  }) => {
    // expo-auth-session makes the PKCE pair and `state`, and refuses a
    // redirect whose `state` is not the one it sent (`state_mismatch`).
    const request = new AuthRequest({
      clientId,
      redirectUri,
      scopes: [...scopes],
      responseType: ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: CodeChallengeMethod.S256,
      extraParams: { ...params },
    });
    // Not ephemeral: the sheet shares the browser's cookies, so the sign-in
    // service knows who is already signed in there.
    const result = await request.promptAsync(
      { authorizationEndpoint },
      { preferEphemeralSession: false },
    );
    if (result.type === 'error') {
      return {
        type: 'error',
        code: result.error?.code ?? 'unknown_error',
        description: result.error?.description,
      };
    }
    const code = result.type === 'success' ? result.params['code'] : undefined;
    if (!code || !request.codeVerifier) return { type: 'cancelled' };
    return { type: 'code', code, codeVerifier: request.codeVerifier };
  },
  open: (url) => Linking.openURL(url),
});
