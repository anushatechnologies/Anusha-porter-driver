declare global {
  interface Window {
    location: any;
    alert: any;
  }
  const window: Window & typeof globalThis;
}

export {};
