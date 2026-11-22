import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScanResultCard } from "./ScanResultCard";
import type { ScanContext } from "@/lib/types";

const base: ScanContext = {
  enrollmentState: "ENROLLED",
  paidThisMonth: true,
  covered: "PAID",
  month: "2026-11",
  graceUntil: "2026-11-10",
  warnings: [],
  student: { name: "Nimal Perera", indexNumber: 42, profileImage: "https://cdn.example/nimal.jpg" },
};
const show = (patch: Partial<ScanContext> = {}) => render(<ScanResultCard classId="c1" context={{ ...base, ...patch }} />);

describe("ScanResultCard", () => {
  it("shows the student large enough to compare with the face at the door", () => {
    show();
    expect(screen.getByText("Nimal Perera")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Nimal Perera" })).toHaveAttribute("src", "https://cdn.example/nimal.jpg");
  });

  it("says when there is no photo on file", () => {
    show({ student: { ...base.student, profileImage: null } });
    expect(screen.getByText("No photo on file")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("is plainly green for an enrolled student who has paid, with no warning and no actions", () => {
    show();
    expect(screen.getByText(/paid for 2026-11/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "ok");
  });

  it("is amber inside grace, names the date and offers to collect", () => {
    show({ paidThisMonth: false, covered: "GRACE", warnings: ["FEE_IN_GRACE"] });
    expect(screen.getByText(/not paid yet.*grace until/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "warn");
    expect(screen.getByRole("link", { name: "Collect payment" })).toHaveAttribute("href", "/payments");
  });

  it("is red outside grace and offers to collect", () => {
    show({ paidThisMonth: false, covered: "UNPAID", warnings: ["FEE_UNPAID"] });
    expect(screen.getByText(/2026-11 fee is not paid/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "alert");
    expect(screen.getByRole("link", { name: "Collect payment" })).toBeInTheDocument();
  });

  it("flags a student who is not enrolled and links to the class to enrol them, with no fee line", () => {
    show({ enrollmentState: "NOT_ENROLLED", paidThisMonth: false, covered: "UNPAID", warnings: ["NOT_ENROLLED"] });
    expect(screen.getByText("Not enrolled in this class")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enrol" })).toHaveAttribute("href", "/classes/c1");
    expect(screen.queryByRole("link", { name: "Collect payment" })).not.toBeInTheDocument();
    expect(screen.queryByText(/not paid/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "alert");
  });

  it("flags an online-only student and still shows the fee state", () => {
    show({ enrollmentState: "MODE_MISMATCH", paidThisMonth: false, covered: "UNPAID", warnings: ["MODE_MISMATCH", "FEE_UNPAID"] });
    expect(screen.getByText("Enrolled for online classes only")).toBeInTheDocument();
    expect(screen.getByText(/2026-11 fee is not paid/i)).toBeInTheDocument();
  });
});
