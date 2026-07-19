/**
 * HTML-safety and network helpers shared by the core renderer and card authors.
 *
 * Card templates interpolate strings sourced from external APIs and end-user
 * input. Those strings are attacker-influenceable (a GitHub repo description, a
 * Wiktionary entry, a poll option), so every value that reaches an HTML or
 * inline-script context must be escaped at the boundary.
 */

/**
 * Escape a value for interpolation into HTML text or a double/single-quoted
 * attribute. Covers `& < > " '`, which is sufficient for both contexts.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Alias for {@link escapeHtml}; the escaping rules cover attribute context too. */
export const escapeAttr = escapeHtml;

// U+2028 / U+2029 are valid inside JSON strings but are line terminators in
// JavaScript, so they must be escaped when embedding JSON in an inline script.
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), 'g');
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), 'g');

/**
 * Serialize a value for safe embedding inside an inline `<script>` block.
 *
 * `JSON.stringify` alone does not neutralize `</script>` or HTML comment
 * openers, so a value containing the literal `</script>` would terminate the
 * script element early. This escapes `<`, `>` and the JS line terminators.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(LINE_SEP, '\\u2028')
    .replace(PARA_SEP, '\\u2029');
}

/**
 * Restrict a string to characters safe in a URL path segment and HTML
 * attribute. Used to harden identifiers (instance IDs, card names) that flow
 * into `data-*` attributes and share URLs before they are trusted as opaque.
 */
export function sanitizeId(value: unknown): string {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '');
}

/**
 * Only allow http(s) URLs; returns an empty string for anything else
 * (e.g. `javascript:` / `data:` URIs) so it is safe to place in an href.
 */
export function safeHttpUrl(value: unknown): string {
  const str = String(value ?? '').trim();
  return /^https?:\/\//i.test(str) ? str : '';
}

export interface FetchJsonOptions {
  /** Abort the request after this many milliseconds. Defaults to 8000. */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * Fetch JSON with a mandatory timeout and non-2xx handling. Card `getData`
 * functions should use this instead of a bare `fetch` so a hung or blocked
 * upstream cannot stall the render (and, transitively, the MCP tool call and
 * screenshot pipeline) indefinitely.
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const { timeoutMs = 8000, headers } = options;
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      /* keep raw url if unparseable */
    }
    throw new Error(`Request to ${host} failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}
