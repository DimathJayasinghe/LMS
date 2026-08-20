import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GradeSubmissionRow } from "./GradeSubmissionRow";
import type { ExamSubmission, Role } from "@/lib/types";

const { patch, refresh } = vi.hoisted(() => ({ patch: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { patch } };
});

const submission: ExamSubmission = {
  id: "submission-1",
  status: "COMPLETED",
  answerPdfUrl: null,
  answers: null,
  writtenAnswers: { essay: "Student answer" },
  marks: 72,
  feedback: "Initial feedback",
  submittedAt: "2026-08-19T00:00:00.000Z",
  gradedAt: "2026-08-20T00:00:00.000Z",
  user: { id: "student-1", name: "Nimal", email: "nimal@example.com", indexNumber: 42 },
};

const renderRow = async (viewerRole: Role, published: boolean) => {
  const user = userEvent.setup();
  render(
    <GradeSubmissionRow
      submission={submission}
      examType="WRITTEN"
      totalMarks={100}
      mcqPayload={null}
      viewerRole={viewerRole}
      published={published}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Nimal/ }));
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  patch.mockResolvedValue({ data: {} });
});

describe("GradeSubmissionRow role states", () => {
  it("lets an assigned marker grade before publication", async () => {
    await renderRow("MARKER", false);
    expect(screen.getByRole("button", { name: "Save marks" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record correction" })).not.toBeInTheDocument();
  });

  it("keeps pre-publication grading read-only for teachers", async () => {
    await renderRow("TEACHER", false);
    expect(screen.getByText(/Assigned markers enter marks here/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save marks" })).not.toBeInTheDocument();
  });

  it("locks marker edits after publication", async () => {
    await renderRow("MARKER", true);
    expect(screen.getByText(/Published results are locked for markers/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save marks" })).not.toBeInTheDocument();
  });

  it("requires a reason and records an audited teacher correction", async () => {
    const user = await renderRow("TEACHER", true);
    await user.clear(screen.getByLabelText("Corrected marks"));
    await user.type(screen.getByLabelText("Corrected marks"), "75");
    await user.type(screen.getByLabelText(/Correction reason/), "Transcription error");
    await user.click(screen.getByRole("button", { name: "Record correction" }));

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith(
        "/submissions/submission-1/result-correction",
        { marks: 75, feedback: "Initial feedback", reason: "Transcription error" },
        { headers: { "Idempotency-Key": expect.any(String) } },
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
