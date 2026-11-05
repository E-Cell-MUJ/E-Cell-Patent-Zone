// Test setup for jsdom environment
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window !== 'undefined' && !window.localStorage) {
  const store: Record<string, string> = {};
  const mockStorage: Storage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key in store) {
        delete store[key];
      }
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: 0,
  };
  Object.defineProperty(window, 'localStorage', {
    value: mockStorage,
  });
}
