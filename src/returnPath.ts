// The `return` value from the page URL - where to send you back to in the
// ShipThis app. It must be a path on the app, never another site.

export const DEFAULT_RETURN_PATH = '/dashboard'

export function getReturnPath(value: string | null | undefined): string {
  if (!value) return DEFAULT_RETURN_PATH
  if (!value.startsWith('/')) return DEFAULT_RETURN_PATH
  // `//evil.com` is a link to another site
  if (value.startsWith('//')) return DEFAULT_RETURN_PATH
  // Browsers treat `\` like `/`, so `/\evil.com` is too
  if (value.includes('\\')) return DEFAULT_RETURN_PATH
  // No control characters - browsers strip tabs and newlines from URLs
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_RETURN_PATH
  return value
}

// The full URL to send you back to
export function getReturnUrl(appOrigin: string, path: string): string {
  const url = new URL(path, appOrigin)
  // Belt and braces - the path check above should make this impossible
  if (url.origin !== new URL(appOrigin).origin) return new URL(DEFAULT_RETURN_PATH, appOrigin).href
  return url.href
}
