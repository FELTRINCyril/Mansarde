// globalThis.crypto exists in node >= 19 and in browsers
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
