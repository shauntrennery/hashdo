import { createHash, randomBytes } from 'node:crypto';
import type { CardDefinition, InputSchema, InputValues } from './types.js';

/**
 * For cards with `uniqueInstance: true`, auto-generate an `id` when none was
 * provided so that every invocation creates a distinct instance.
 * Call this before `resolveInstance` / `computeInstanceId`.
 *
 * Returns inputs unchanged if the card doesn't opt in or already has an `id`.
 */
export function prepareInputs<S extends InputSchema>(
  card: CardDefinition<S>,
  inputs: Record<string, unknown>,
): Record<string, unknown> {
  // Treat only null/undefined/'' as "no id"; a legitimate falsy id such as 0
  // must not be overwritten with a fresh random one.
  const hasId = inputs.id !== undefined && inputs.id !== null && inputs.id !== '';
  if (card.uniqueInstance && 'id' in card.inputs && !hasId) {
    return { ...inputs, id: randomBytes(3).toString('hex') };
  }
  return inputs;
}

/**
 * Canonicalize input values into a deterministic string.
 *
 * Uses a sorted-key JSON object rather than `k=v&...` concatenation so that
 * values containing `&`/`=`, object/array values, and distinct inputs cannot
 * collide onto the same serialization. `undefined`-valued keys are dropped so
 * that `{a:'x', b:undefined}` and `{a:'x'}` — semantically identical calls —
 * canonicalize identically.
 */
function canonicalizeInputs(obj: Record<string, unknown>): string {
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] !== undefined) canonical[key] = obj[key];
  }
  return JSON.stringify(canonical);
}

/**
 * Create a stable key from input values for state lookups.
 * Deterministic: same inputs always produce the same key.
 */
export function stableKey(obj: Record<string, unknown>): string {
  return Buffer.from(canonicalizeInputs(obj)).toString('base64url');
}

/**
 * Compute the instance ID for a card — a short, URL-safe, user-independent
 * identifier that uniquely represents this card + inputs combination.
 *
 * If the card defines `stateKey()`, extracts the value portion after the last
 * colon (e.g. `"id:71a1bc"` → `"71a1bc"`). Otherwise falls back to a 6-char
 * SHA-256 hex hash of sorted inputs.
 */
export function computeInstanceId<S extends InputSchema>(
  card: CardDefinition<S>,
  inputs: InputValues<S>,
): string {
  if (card.stateKey) {
    // Instance IDs are always user-independent (no userId)
    const key = card.stateKey(inputs, undefined);
    if (key) {
      const colonIdx = key.lastIndexOf(':');
      return colonIdx >= 0 ? key.slice(colonIdx + 1) : key;
    }
  }

  // Fallback: 8-char hex hash of canonicalized inputs. 8 hex chars (32 bits)
  // keeps IDs short/URL-safe while pushing the birthday-collision point out to
  // ~90k instances per card, well above the shared-state use cases here.
  return createHash('sha256')
    .update(canonicalizeInputs(inputs as Record<string, unknown>))
    .digest('hex')
    .slice(0, 8);
}

/**
 * Resolve the full instance identity for a card render or action.
 *
 * Returns:
 * - `instanceId` — short URL-safe ID (user-independent, suitable for share URLs)
 * - `cardKey` — full state-store key, may include userId for per-user state cards
 *
 * The cardKey format is preserved from the existing convention:
 * `card:{name}:{stateKey(inputs, userId) || stableKey(inputs)}`
 */
export function resolveInstance<S extends InputSchema>(
  card: CardDefinition<S>,
  inputs: InputValues<S>,
  userId?: string,
): { instanceId: string; cardKey: string } {
  const instanceId = computeInstanceId(card, inputs);

  const customKey = card.stateKey?.(inputs, userId);
  const cardKey = customKey
    ? `card:${card.name}:${customKey}`
    : `card:${card.name}:${stableKey(inputs as Record<string, unknown>)}`;

  return { instanceId, cardKey };
}
