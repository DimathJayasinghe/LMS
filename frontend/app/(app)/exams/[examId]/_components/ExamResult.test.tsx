import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExamResult } from "./ExamResult";
import type { MySubmission } from "@/lib/types";

const sub = (over: Partial<MySubmission> = {}): MySubmission => ({
  id: "s1", status: "COMPLETED", answers: null, writtenAnswers: null, answerPdfUrl: null, marks: null, feedback: null,
  published: false, examId: "e1", exam: { id: "e1", title: "Paper", type: "WRITTEN", totalMarks: 100, isPublished: false },
  submittedAt: "2026-09-06T09:00:00.000Z", gradedAt: null, ...over,
});

describe("ExamResult", () => {
  it("says a finished submission is awaiting results", () => {
    render(<ExamResult submission={sub()} />);
    expect(screen.getByText("Submitted — awaiting results")).toBeInTheDocument();
  });

  it("says the answer file was not received for an upload that never finished", () => {
    render(<ExamResult submission={sub({ status: "UPLOADING" })} />);
    expect(screen.getByText("Your answer file was not received")).toBeInTheDocument();
    expect(screen.queryByText("Submitted — awaiting results")).not.toBeInTheDocument();
    expect(screen.getByText(/contact your teacher/i)).toBeInTheDocument();
  });

  it("treats an UPLOADING row that holds a stored file as submitted", () => {
    render(<ExamResult submission={sub({ status: "UPLOADING", answerPdfUrl: "https://signed.example/a.pdf" })} />);
    expect(screen.getByText("Submitted — awaiting results")).toBeInTheDocument();
  });

  it("shows the mark once published", () => {
    render(<ExamResult submission={sub({ published: true, marks: 72 })} />);
    expect(screen.getByText("Your result")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
  });
});
