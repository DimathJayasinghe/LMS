import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodaysCash } from "./TodaysCash";

describe("TodaysCash", () => {
  it("shows what the desk has taken today and links to the count", () => {
    render(<TodaysCash summary={{ amount: 7500, payments: 3, uncounted: 1 }} />);
    expect(screen.getByText("Rs 7,500")).toBeInTheDocument();
    expect(screen.getByText(/3 payments/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Count the day" })).toHaveAttribute("href", "/payments/cash");
  });

  it("uses the singular for one payment", () => {
    render(<TodaysCash summary={{ amount: 2500, payments: 1, uncounted: 1 }} />);
    expect(screen.getByText(/1 payment\b/)).toBeInTheDocument();
  });

  it("says when the day is already counted and still links to the cash page", () => {
    render(<TodaysCash summary={{ amount: 7500, payments: 3, uncounted: 0 }} />);
    expect(screen.getByText("Counted")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See cash" })).toHaveAttribute("href", "/payments/cash");
  });

  it("says nothing was taken yet, without asking for a count", () => {
    render(<TodaysCash summary={{ amount: 0, payments: 0, uncounted: 0 }} />);
    expect(screen.getByText("No cash taken yet today.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Count the day" })).not.toBeInTheDocument();
  });
});
