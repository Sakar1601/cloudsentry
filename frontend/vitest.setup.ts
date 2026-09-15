import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver implementation. Fire the callback once,
// synchronously on observe(), so components that wait on a first size
// reading (e.g. GraphCanvas) never hang a test waiting for one.
class ResizeObserverMock {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    this.callback(
      [{ contentRect: target.getBoundingClientRect() } as ResizeObserverEntry],
      this as unknown as ResizeObserver
    );
  }

  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock;
