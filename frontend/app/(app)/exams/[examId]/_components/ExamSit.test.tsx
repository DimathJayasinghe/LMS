import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamSit } from "./ExamSit";
import type { ExamDetail, MySubmission } from "@/lib/types";

const m = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post: m.post, patch: m.patch, get: vi.fn(), del: vi.fn(), upload: vi.fn() } };
});

const exam = (over: Partial<ExamDetail> = {}): ExamDetail => ({
  id: "e1", title: "Paper", type: "WRITTEN", startTime: new Date(Date.now() - 600_000).toISOString(),
  endTime: new Date(Date.now() + 3_600_000).toISOString(), totalMarks: 100, isPublished: false, allowTypedAnswers: true,
  allowPdfUpload: true, courseId: "c1", createdAt: "", updatedAt: "", paperPdfUrl: null, mcqPayload: null,
  myAudience: { label: "Group", deliveryMode: "ONLINE", instituteName: null }, ...over,
});
const unfinished = (over: Partial<MySubmission> = {}): MySubmission => ({
  id: "s1", status: "UPLOADING", answers: null, writtenAnswers: null, answerPdfUrl: null, marks: null, feedback: null,
  published: false, examId: "e1", exam: { id: "e1", title: "Paper", type: "WRITTEN", totalMarks: 100, isPublished: false },
  submittedAt: "", gradedAt: null, ...over,
});
const started = { data: { submission: { id: "s1" }, uploadUrl: "https://upload.example/a", uploadKey: "answers/e1/u/a.pdf" } };
const pdf = () => new File(["%PDF-1.4"], "My answers.pdf", { type: "application/pdf" });

const choosePdf = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("tab", { name: "Upload PDF" }));
  await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, pdf());
};

beforeEach(() => {
  m.post.mockReset(); m.patch.mockReset(); m.refresh.mockReset();
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("ExamSit, first attempt", () => {
  it("shows no resume notice", () => {
    render(<ExamSit exam={exam()} />);
    expect(screen.queryByText("Your earlier upload did not finish")).not.toBeInTheDocument();
  });

  it("never sends an audience: the server derives it", async () => {
    m.post.mockResolvedValue(started);
    const user = userEvent.setup();
    render(<ExamSit exam={exam()} />);
    await choosePdf(user);
    await user.click(screen.getByRole("button", { name: /submit exam/i }));
    expect(m.post).toHaveBeenCalledWith("/submissions", {
      examId: "e1", fileName: "My_answers.pdf", contentType: "application/pdf", fileSizeBytes: 8,
    });
    expect(m.patch).toHaveBeenCalledWith("/submissions/s1/complete", { key: "answers/e1/u/a.pdf" });
    expect(m.refresh).toHaveBeenCalled();
  });

  it("lets the student retry after a failed upload, starting again on the same screen", async () => {
    m.post.mockResolvedValue(started);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true }));
    const user = userEvent.setup();
    render(<ExamSit exam={exam()} />);
    await choosePdf(user);
    await user.click(screen.getByRole("button", { name: /submit exam/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload failed");
    expect(m.refresh).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /submit exam/i }));
    expect(m.post).toHaveBeenCalledTimes(2);
    expect(m.patch).toHaveBeenCalledTimes(1);
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });
});

describe("ExamSit, resuming an unfinished upload", () => {
  it("explains that the earlier upload did not finish and what to do", () => {
    render(<ExamSit exam={exam()} resume={unfinished()} />);
    expect(screen.getByText("Your earlier upload did not finish")).toBeInTheDocument();
    expect(screen.getByText(/choose your pdf again or type your answers/i)).toBeInTheDocument();
  });

  it("starts again with a fresh upload and completes it", async () => {
    m.post.mockResolvedValue(started);
    const user = userEvent.setup();
    render(<ExamSit exam={exam()} resume={unfinished()} />);
    await choosePdf(user);
    await user.click(screen.getByRole("button", { name: /submit exam/i }));
    expect(m.post).toHaveBeenCalledWith("/submissions", expect.not.objectContaining({ audienceId: expect.anything() }));
    expect(m.patch).toHaveBeenCalledWith("/submissions/s1/complete", { key: "answers/e1/u/a.pdf" });
  });

  it("lets the student switch to typed answers instead", async () => {
    m.post.mockResolvedValue({ data: { submission: { id: "s1" } } });
    const user = userEvent.setup();
    render(<ExamSit exam={exam()} resume={unfinished()} />);
    await user.click(screen.getByRole("tab", { name: "Type answers" }));
    await user.type(screen.getByLabelText("Answer 1"), "Because of the lever");
    await user.click(screen.getByRole("button", { name: /submit exam/i }));
    expect(m.post).toHaveBeenCalledWith("/submissions", { examId: "e1", writtenAnswers: { "part-1": "Because of the lever" } });
    expect(m.patch).not.toHaveBeenCalled();
  });

  it("keeps the MCQ answers already stored on the row of a hybrid paper", async () => {
    const hybrid = exam({
      type: "HYBRID",
      mcqPayload: { questions: [{ id: "q1", text: "Two plus two?", order: 1, marks: 5, options: [{ id: "a", text: "4" }, { id: "b", text: "5" }] }] },
    });
    render(<ExamSit exam={hybrid} resume={unfinished({ answers: { q1: ["a"] } })} />);
    expect(screen.getByRole("checkbox", { name: "4" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "5" })).not.toBeChecked();
  });
});
