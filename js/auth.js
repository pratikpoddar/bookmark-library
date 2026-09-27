// ============================================================================
// Identity: real Google Sign-In (Google Identity Services, client-side only)
// with a Guest fallback. There is no server anywhere in this app — a Google
// ID token here is decoded locally only to label and namespace your local
// library, never sent anywhere or verified against a backend.
// ============================================================================

const CURRENT_ACCOUNT_KEY = 'bmlib_current_account_v1';
const CLIENT_ID_KEY = 'bmlib_google_client_id_v1';

function getConfiguredClientId() {
  const stored = localStorage.getItem(CLIENT_ID_KEY);
  if (stored) return stored;
  if (window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID) return window.APP_CONFIG.GOOGLE_CLIENT_ID;
  return '';
}
function setConfiguredClientId(id) {
  if (id) localStorage.setItem(CLIENT_ID_KEY, id);
  else localStorage.removeItem(CLIENT_ID_KEY);
}

function decodeJwt(token) {
  const payload = token.split('.')[1];
  const json = decodeURIComponent(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    .split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  return JSON.parse(json);
}

function getCurrentAccount() {
  try {
    const raw = localStorage.getItem(CURRENT_ACCOUNT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function setCurrentAccount(account) {
  if (account) localStorage.setItem(CURRENT_ACCOUNT_KEY, JSON.stringify(account));
  else localStorage.removeItem(CURRENT_ACCOUNT_KEY);
}

function initGoogleSignIn(onSignedIn) {
  const clientId = getConfiguredClientId();
  const container = document.getElementById('googleBtn');
  const notConfigured = document.getElementById('googleNotConfigured');
  if (!clientId) {
    container.style.display = 'none';
    notConfigured.style.display = 'block';
    return;
  }
  if (!window.google || !window.google.accounts) {
    container.style.display = 'none';
    notConfigured.style.display = 'block';
    notConfigured.textContent = 'Could not load Google Sign-In (offline, or blocked by an extension). You can still continue as a guest below.';
    return;
  }
  notConfigured.style.display = 'none';
  container.style.display = 'block';
  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        const profile = decodeJwt(response.credential);
        setCurrentAccount({ id: profile.email, name: profile.name, email: profile.email, picture: profile.picture, kind: 'google' });
        onSignedIn();
      }
    });
    window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', width: 280 });
  } catch (e) {
    container.style.display = 'none';
    notConfigured.style.display = 'block';
    notConfigured.textContent = 'Google Sign-In failed to initialize — the Client ID may be invalid. You can still continue as a guest below.';
  }
}

function continueAsGuest(onSignedIn) {
  setCurrentAccount({ id: 'guest', name: 'Guest', email: null, picture: null, kind: 'guest' });
  onSignedIn();
}

function signOut() {
  if (window.google && window.google.accounts) {
    try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
  }
  setCurrentAccount(null);
  location.reload();
}
