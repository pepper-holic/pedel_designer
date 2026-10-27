import { vi } from "vitest";

/**
 * A stand-in 2D context for jsdom (which has none): every drawing call is a recorded no-op, so a
 * component's drawing code actually runs in tests - a typo in it throws here instead of only in a
 * browser.
 */
export function installFakeCanvas() {
  const calls: string[] = [];
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "measureText") return (text: string) => ({ width: text.length * 6 });
      if (key === "createLinearGradient") return () => gradient;
      return (...args: unknown[]) => {
        calls.push(key);
        void args;
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return { calls };
}
