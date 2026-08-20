import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStream } from "./useNotificationStream";

type Listener = (event: MessageEvent<string>) => void;

class MockEventSource {
  static instance: MockEventSource;
  readonly listeners = new Map<string, Listener>();
  readonly close = vi.fn();

  constructor() {
    MockEventSource.instance = this;
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }

  emit(type: string, data: unknown): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

beforeEach(() => {
  globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
});

describe("useNotificationStream", () => {
  it("delivers events to the latest callback without reconnecting", () => {
    const first = vi.fn();
    const second = vi.fn();
    const hook = renderHook(({ onEvent }) => useNotificationStream(onEvent), {
      initialProps: { onEvent: first },
    });
    const source = MockEventSource.instance;

    hook.rerender({ onEvent: second });
    act(() => {
      source.emit("NOTIFICATION_CREATED", {
        data: { notificationId: "n1", type: "PAYMENT_CONFIRMED", title: "Paid" },
      });
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({
      notificationId: "n1",
      type: "PAYMENT_CONFIRMED",
      title: "Paid",
    });

    hook.unmount();
    expect(source.close).toHaveBeenCalledOnce();
  });
});
