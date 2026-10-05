/**
 * A post-sign-in redirect target that can only stay on this site.
 *
 * Browsers treat "\" as "/", so "/\evil.com" means "//evil.com": a prefix
 * check is not enough. Resolve the value against a placeholder origin and keep
 * it only if the origin is unchanged; reject backslashes and control
 * characters outright. Dot segments can resolve "/..//evil.com" to the path
 * "//evil.com", so the resolved result is checked again.
 */

const PLACEHOLDER = "http://same-site.invalid";

export function safeCallback(value: unknown, fallback: string): string {
  // Next's searchParams types a key as a single string, but a repeated query
  // key (?callbackUrl=a&callbackUrl=b) hands one an array at runtime.
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }
  try {
    const url = new URL(value, PLACEHOLDER);
    if (url.origin !== PLACEHOLDER) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    return path.startsWith("//") ? fallback : path;
  } catch {
    return fallback;
  }
}
