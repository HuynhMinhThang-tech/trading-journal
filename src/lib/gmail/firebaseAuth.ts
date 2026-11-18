import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Chỉ lưu Access Token trong bộ nhớ RAM phiên chạy (tuyệt đối không lưu vào localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export function initGmailAuthListener(
  onAuthenticated: (user: User, hasToken: boolean) => void,
  onUnauthenticated: () => void,
) {
  return onAuthStateChanged(auth, (user) => {
    if (user && !isSigningIn) {
      onAuthenticated(user, Boolean(cachedAccessToken));
    } else if (!user && !isSigningIn) {
      cachedAccessToken = null;
      onUnauthenticated();
    }
  });
}

export async function connectGmailAccount(loginHintEmail?: string): Promise<{
  user: User;
  accessToken: string;
}> {
  isSigningIn = true;
  try {
    const provider = new GoogleAuthProvider();
    // Chỉ xin quyền đọc Gmail (gmail.readonly)
    provider.addScope('https://www.googleapis.com/auth/gmail.readonly');

    const customParams: Record<string, string> = {
      prompt: 'select_account',
    };
    if (loginHintEmail && loginHintEmail.trim().includes('@')) {
      customParams.login_hint = loginHintEmail.trim();
    }
    provider.setCustomParameters(customParams);

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không nhận được mã truy cập Gmail từ Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export function getCachedGmailToken(): string | null {
  return cachedAccessToken;
}

export function clearCachedGmailToken(): void {
  cachedAccessToken = null;
}

export async function disconnectGmailAccount(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}
