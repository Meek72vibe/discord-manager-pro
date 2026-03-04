/**
 * In-memory warning store with async flush.
 * Warnings survive restarts when WARN_FILE is set in env.
 */

interface Warning {
  reason: string;
  date: string;
}

const _store = new Map<string, Warning[]>();

export function addWarning(userId: string, reason: string): void {
  if (!_store.has(userId)) _store.set(userId, []);
  _store.get(userId)!.push({ reason, date: new Date().toISOString() });
}

export function getWarnings(userId: string): Warning[] {
  return _store.get(userId) ?? [];
}

export function clearWarnings(userId: string): void {
  _store.delete(userId);
}
