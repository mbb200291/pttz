const jsdomEnvironment = globalThis as typeof globalThis & {
  jsdom?: { window: Window };
};

const jsdomWindow = jsdomEnvironment.jsdom?.window;

if (jsdomWindow) {
  Object.defineProperties(globalThis, {
    localStorage: {
      configurable: true,
      value: jsdomWindow.localStorage,
    },
    sessionStorage: {
      configurable: true,
      value: jsdomWindow.sessionStorage,
    },
  });
}
