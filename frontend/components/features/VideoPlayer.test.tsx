import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { VideoPlayer } from "./VideoPlayer";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
// Captured Player.js event handlers so the test can drive playback events.
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, (d?: unknown) => void>() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { get, post, patch: vi.fn(), upload: vi.fn(), del: vi.fn() } };
});
vi.mock("player.js", () => ({
  default: {
    Player: class {
      on(evt: string, cb: (d?: unknown) => void) {
        handlers.set(evt, cb);
      }
      off() {}
    },
  },
}));

const emit = (evt: string, data?: unknown) => act(() => handlers.get(evt)?.(data));

beforeEach(() => {
  get.mockReset().mockResolvedValue({
    data: {
      videoId: "v1",
      title: "Lecture",
      durationSeconds: 3600,
      embedUrl: "https://iframe.mediadelivery.net/embed/1/v1?token=x&expires=1",
      watermark: "Stu · #1",
      expiresAt: 1,
    },
  });
  post.mockReset().mockResolvedValue({});
  handlers.clear();
});

describe("VideoPlayer — watch attendance", () => {
  it("POSTs /attendance/video once after ~30s watched, then not again", async () => {
    render(<VideoPlayer videoId="v1" courseId="c1" classSessionId="s1" />);

    // iframe renders once the signed stream is fetched; the effect attaches player.js.
    await screen.findByTitle("Lecture");
    await waitFor(() => expect(handlers.has("ready")).toBe(true));
    emit("ready"); // registers timeupdate + ended

    for (let t = 1; t <= 31; t++) emit("timeupdate", { seconds: t });

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/attendance/video", { classSessionId: "s1" }),
    );
    // firing more ticks must not send it again
    for (let t = 32; t <= 40; t++) emit("timeupdate", { seconds: t });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("marks attendance on 'ended' for a short clip", async () => {
    render(<VideoPlayer videoId="v1" courseId="c1" classSessionId="s1" />);
    await screen.findByTitle("Lecture");
    await waitFor(() => expect(handlers.has("ready")).toBe(true));
    emit("ready");

    emit("timeupdate", { seconds: 3 }); // below threshold
    emit("ended");

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith("/attendance/video", { classSessionId: "s1" });
  });
});
