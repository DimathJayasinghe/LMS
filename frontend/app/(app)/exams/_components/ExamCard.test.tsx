import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ExamCard from "./ExamCard";
import type { Exam } from "@/lib/types";

const exam = (over: Partial<Exam> = {}): Exam => ({
  id: "e1", title: "Paper", type: "WRITTEN", startTime: "2026-09-06T08:00:00.000Z", endTime: "2026-09-06T10:00:00.000Z",
  totalMarks: 100, isPublished: false, allowTypedAnswers: true, allowPdfUpload: true, courseId: "c1",
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...over,
});

describe("ExamCard", () => {
  it("shows nothing extra for a course-wide exam", () => {
    render(<ExamCard exam={exam({ myAudience: null })} />);
    expect(screen.queryByText("Sat in the hall")).not.toBeInTheDocument();
  });

  it("marks an exam the student sits in the hall", () => {
    render(<ExamCard exam={exam({ myAudience: { label: "Hall A", deliveryMode: "PHYSICAL", instituteName: "Nugegoda Centre" } })} />);
    expect(screen.getByText("Sat in the hall")).toBeInTheDocument();
  });

  it("does not mark an online participant", () => {
    render(<ExamCard exam={exam({ myAudience: { label: "Group", deliveryMode: "ONLINE", instituteName: null } })} />);
    expect(screen.queryByText("Sat in the hall")).not.toBeInTheDocument();
  });

  it("flags an upload that did not finish", () => {
    render(<ExamCard exam={exam()} state="incomplete" />);
    expect(screen.getByText("Upload not finished")).toBeInTheDocument();
  });
});
