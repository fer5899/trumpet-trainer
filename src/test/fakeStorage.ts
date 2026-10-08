/** Map-backed `Storage` (full interface) for tests; never touches the real `localStorage`. */
export function createFakeStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return [...items.keys()][index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, String(value));
    },
  };
}

/** A `Storage` whose every method (and `length`) throws, like blocked storage in some browsers. */
export function createThrowingStorage(): Storage {
  const blocked = (): never => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return {
    get length(): number {
      return blocked();
    },
    clear: blocked,
    getItem: blocked,
    key: blocked,
    removeItem: blocked,
    setItem: blocked,
  };
}
