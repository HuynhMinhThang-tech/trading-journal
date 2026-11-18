import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

// Chỉ khởi tạo Firebase khi thật sự cần (không chạy lúc nạp trang), để lỗi cấu hình
// Firebase không làm trắng toàn bộ ứng dụng — chỉ riêng phần Gmail báo lỗi.
let authInstance: Auth | null = null;
function getAuthInstance(): Auth {
  if (!authInstance) {
    const app: FirebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    authInstance = getAuth(app);
  }
  return authInstance;
}

function toFriendlyError(err: unknown): Error {
  const code = (err as { code?: string } | null)?.code;
  if (code === 'auth/invalid-api-key') {
    return new Error('Cấu hình Firebase không hợp lệ (apiKey). Kiểm tra firebase-applet-config.json.');
  }
  if (code === 'auth/unauthorized-domain') {
    return new Error('Tên miền này chưa được cho phép trong Firebase → Authentication → Authorized domains.');
  }
  return err instanceof Error ? err : new Error('Không thể kết nối Gmail.');
}

// Chỉ lưu Access Token trong bộ nhớ RAM phiên chạy (tuyệt đối không lưu vào localStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export function initGmailAuthListener(
  onAuthenticated: (user: User, hasToken: boolean) => void,
  onUnauthenticated: () => void,
) {
  try {
    return onAuthStateChanged(getAuthInstance(), (user) => {
      if (user && !isSigningIn) {
        onAuthenticated(user, Boolean(cachedAccessToken));
      } else if (!user && !isSigningIn) {
        cachedAccessToken = null;
        onUnauthenticated();
      }
    });
  } catch (err) {
    console.error('Firebase auth init error:', err);
    onUnauthenticated();
    return () => {};
  }
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

    const result = await signInWithPopup(getAuthInstance(), provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Không nhận được mã truy cập Gmail từ Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (err) {
    throw toFriendlyError(err);
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
  try {
    await getAuthInstance().signOut();
  } catch (err) {
    throw toFriendlyError(err);
  }
}
