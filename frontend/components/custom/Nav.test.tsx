import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Nav from "./Nav";

let pathname = "/initial-route";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: "div", span: "span" },
  useReducedMotion: () => true,
}));

beforeEach(() => {
  pathname = "/initial-route";
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

describe("Nav mobile menu", () => {
  it("closes automatically when navigation changes the current path", async () => {
    const user = userEvent.setup();
    const view = render(<Nav />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();

    pathname = "/new-route";
    view.rerender(<Nav />);

    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close menu" })).not.toBeInTheDocument();
  });
});
