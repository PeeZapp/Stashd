const FIREBASE_AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with this email.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'That email is already in use.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
  'auth/popup-blocked': 'Popup was blocked. Please allow popups and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
};

function extractFirebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const maybeCode = (error as { code?: unknown }).code;
  return typeof maybeCode === 'string' ? maybeCode : null;
}

export function getFirebaseAuthErrorMessage(error: unknown): string {
  const code = extractFirebaseErrorCode(error);
  if (code && FIREBASE_AUTH_ERROR_MESSAGES[code]) {
    return FIREBASE_AUTH_ERROR_MESSAGES[code];
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}
