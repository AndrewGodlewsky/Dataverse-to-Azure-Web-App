// ponytail: in-memory TTL cache — correct for a single-instance App Service plan
// (ADR-0001 makes this load-bearing: it collapses N viewers into 1 upstream call).
// Move to Redis only if the app ever scales out.
const store = new Map();

export function cached(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = fn(); // may be a promise; cache it as-is so concurrent callers share it
  store.set(key, { value, expires: Date.now() + ttlMs });
  if (value instanceof Promise) value.catch(() => store.delete(key));
  return value;
}

export function clearCache() {
  store.clear();
}
