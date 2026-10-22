// The API can require a bearer token (CLOUDSENTRY_API_TOKEN on the backend).
// The operator types it once per browser session; it lives in sessionStorage,
// never in the build, so it is not shipped to anyone else. Storage can be
// unavailable (private windows, blocked cookies), so every access is guarded.

const KEY = "cloudsentry_api_token";

export class AuthRequiredError extends Error {
  constructor() {
    super("The API requires a token");
    this.name = "AuthRequiredError";
  }
}

export function getToken(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.sessionStorage.setItem(KEY, token.trim());
  } catch {
    /* the page still works for this load; the token just is not remembered */
  }
}

export function clearToken(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
