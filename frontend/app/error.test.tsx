import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import ErrorPage from "./error";

it("retries the failed render", () => {
  const retry = vi.fn();
  render(<ErrorPage retry={retry} />);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
