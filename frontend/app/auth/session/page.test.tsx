import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
let nextParam: string | null = "/classes/7";
const refreshSession = vi.fn();
const apiPost = vi.fn();

// Stable identities, as in the real app router.
const router = { replace };
const params = { get: (k: string) => (k === "next" ? nextParam : null) };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => params,
}));
vi.mock("@/lib/api", () => ({
  refreshSession: (...a: unknown[]) => refreshSession(...a),
  api: { post: (...a: unknown[]) => apiPost(...a) },
}));

import SessionPage from "./page";

beforeEach(() => {
  replace.mockReset();
  refreshSession.mockReset();
  apiPost.mockReset().mockResolvedValue({});
  nextParam = "/classes/7";
});

describe("/auth/session", () => {
  it("shows a neutral signing-in state while refreshing", () => {
    refreshSession.mockReturnValue(new Promise(() => undefined));
    render(<SessionPage />);
    expect(screen.getByText(/signing you back in/i)).toBeInTheDocument();
  });

  it("on success replaces the URL with the safe next path", async () => {
    refreshSession.mockResolvedValue({ ok: true });
    render(<SessionPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/classes/7"));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("never follows an unsafe next value", async () => {
    nextParam = "//evil.com";
    refreshSession.mockResolvedValue({ ok: true });
    render(<SessionPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it.each([401, 403])("on %s clears the dead cookies via logout and goes to login with next", async (status) => {
    refreshSession.mockResolvedValue({ ok: false, status });
    render(<SessionPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/auth/login?next=${encodeURIComponent("/classes/7")}`),
    );
    expect(apiPost).toHaveBeenCalledWith("/auth/logout");
  });

  it("still reaches login when the logout call itself fails", async () => {
    refreshSession.mockResolvedValue({ ok: false, status: 401 });
    apiPost.mockRejectedValue(new Error("network"));
    render(<SessionPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(expect.stringContaining("/auth/login")));
  });

  it.each([429, 502, null])("on %s keeps the cookies and shows a retry state", async (status) => {
    refreshSession.mockResolvedValue({ ok: false, status });
    render(<SessionPage />);
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("retrying runs the refresh again and then continues", async () => {
    refreshSession.mockResolvedValueOnce({ ok: false, status: 502 }).mockResolvedValueOnce({ ok: true });
    render(<SessionPage />);
    await userEvent.click(await screen.findByRole("button", { name: /try again/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/classes/7"));
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });
});
