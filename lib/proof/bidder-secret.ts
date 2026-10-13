/**
 * Secrets a bidder keeps in this browser.
 *
 * `bidder_secret` is a stable per-browser secret: it feeds the bidder binding
 * and the per-auction nullifier, so it must stay secret and never appears in a
 * memo, bundle or link. `blinding` is a per-auction random value that makes the
 * bid commitment hiding; it is needed again at reveal time, so it is stored
 * keyed by auction id. Neither value is ever transmitted.
 *
 * Losing storage (clearing site data) means a new secret and a new nullifier:
 * an existing sealed bid can no longer be revealed, which is the honest cost of
 * keeping the bidder's identity local.
 */
const SECRET_KEY = "zecpass.bidder-secret";
const BLINDING_PREFIX = "zecpass.bid-blinding.";

let memorySecret: string | null = null;

function randomSecretHex(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidSecret(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{62}$/.test(value) && /[1-9a-f]/.test(value);
}

export function getBidderSecret(): string {
  try {
    const stored = window.localStorage.getItem(SECRET_KEY);
    if (isValidSecret(stored)) return stored;
    const fresh = randomSecretHex();
    window.localStorage.setItem(SECRET_KEY, fresh);
    return fresh;
  } catch {
    memorySecret ??= randomSecretHex();
    return memorySecret;
  }
}

/** The per-auction blinding, created on first use and reused for seal and reveal. */
export function getBidBlinding(auctionId: string): string {
  const key = `${BLINDING_PREFIX}${auctionId}`;
  try {
    const stored = window.localStorage.getItem(key);
    if (isValidSecret(stored)) return stored;
    const fresh = randomSecretHex();
    window.localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    memorySecret ??= randomSecretHex();
    return memorySecret;
  }
}
