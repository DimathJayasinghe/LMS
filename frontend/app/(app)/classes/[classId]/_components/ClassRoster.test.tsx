import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ClassRoster } from "./ClassRoster";
import type { RosterList, RosterRow } from "@/lib/types";

const classId = "11111111-1111-4111-8111-111111111111";
const row = (patch: Partial<RosterRow> = {}): RosterRow => ({
  studentId: "u1",
  name: "Nimal Perera",
  indexNumber: 1001,
  classType: "PHYSICAL",
  enrolledAt: "2026-02-05T05:00:00.000Z",
  feeState: "PAID",
  attendedLastN: { attended: 5, sessions: 8 },
  ...patch,
});
const list = (data: RosterRow[], patch: Partial<RosterList> = {}): RosterList => ({
  status: "success", data, count: data.length, page: 1, pageSize: 100, ...patch,
});

describe("ClassRoster", () => {
  it("shows each student's name, index, mode, enrolment date, fee state and attendance", () => {
    render(<ClassRoster classId={classId} roster={list([row(), row({ studentId: "u2", name: "Kamal", indexNumber: 1002, classType: "ONLINE", feeState: "NOT_PAID", attendedLastN: { attended: 0, sessions: 8 } })])} />);

    expect(screen.getByRole("heading", { name: "Students (2)" })).toBeInTheDocument();
    const [, nimal, kamal] = screen.getAllByRole("row");
    expect(within(nimal!).getByText("Nimal Perera")).toBeInTheDocument();
    expect(within(nimal!).getByText("#1001")).toBeInTheDocument();
    expect(within(nimal!).getByText("In hall")).toBeInTheDocument();
    expect(within(nimal!).getByText("5 Feb 2026")).toBeInTheDocument();
    expect(within(nimal!).getByText("Paid")).toBeInTheDocument();
    expect(within(nimal!).getByText("5 of 8")).toBeInTheDocument();
    expect(within(kamal!).getByText("Online")).toBeInTheDocument();
    expect(within(kamal!).getByText("Not paid")).toBeInTheDocument();
    expect(within(kamal!).getByText("0 of 8")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Last 8 sessions" })).toBeInTheDocument();
  });

  it("drops the fee column when the owner hides the paid state", () => {
    render(<ClassRoster classId={classId} roster={list([row({ feeState: undefined })])} />);
    expect(screen.queryByRole("columnheader", { name: "This month" })).not.toBeInTheDocument();
    expect(screen.queryByText("Paid")).not.toBeInTheDocument();
    expect(screen.queryByText("Not paid")).not.toBeInTheDocument();
  });

  it("says so when no session has been held yet", () => {
    render(<ClassRoster classId={classId} roster={list([row({ attendedLastN: { attended: 0, sessions: 0 } })])} />);
    expect(screen.getByText("No sessions yet")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Attendance" })).toBeInTheDocument();
  });

  it("shows an empty state and no table for a class without students", () => {
    render(<ClassRoster classId={classId} roster={list([])} />);
    expect(screen.getByText("No students are enrolled in this class yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Roster pages" })).not.toBeInTheDocument();
  });

  it("points back to the first page when the asked page is past the end", () => {
    render(<ClassRoster classId={classId} roster={list([], { count: 30, page: 9, pageSize: 100 })} />);
    expect(screen.getByText(/This page has no students/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the first page" })).toHaveAttribute("href", `/classes/${classId}`);
  });

  it("shows contact and money details nowhere", () => {
    render(<ClassRoster classId={classId} roster={list([row()])} />);
    expect(screen.queryByText(/@|077|NIC|Rs/)).not.toBeInTheDocument();
  });

  it("has no page links for a single page", () => {
    render(<ClassRoster classId={classId} roster={list([row()])} />);
    expect(screen.queryByRole("navigation", { name: "Roster pages" })).not.toBeInTheDocument();
  });

  it("links to the next page from the first page of several", () => {
    render(<ClassRoster classId={classId} roster={list([row()], { count: 250, page: 1, pageSize: 100 })} />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", `/classes/${classId}?rosterPage=2`);
    expect(screen.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
  });

  it("links back to the clean class URL from page 2 and onward from the middle", () => {
    const { rerender } = render(<ClassRoster classId={classId} roster={list([row()], { count: 250, page: 2, pageSize: 100 })} />);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", `/classes/${classId}`);
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", `/classes/${classId}?rosterPage=3`);

    rerender(<ClassRoster classId={classId} roster={list([row()], { count: 250, page: 3, pageSize: 100 })} />);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", `/classes/${classId}?rosterPage=2`);
    expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  });
});
