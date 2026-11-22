import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ExamSit } from "./ExamSit";
import { ApiError } from "@/lib/api";
import type { ExamDetail } from "@/lib/types";

const m = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn(), get: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post: m.post, patch: m.patch, get: m.get, del: vi.fn(), upload: vi.fn() } };
});

const WRITTEN = "exam:u1:e1:written";
const MCQ = "exam:u1:e1:answers";
const NOW = new Date("2026-09-06T09:00:00Z").getTime();

const exam = (over: Partial<ExamDetail> = {}): ExamDetail => ({
  id: "e1", title: "Paper", type: "WRITTEN", startTime: new Date(NOW - 600_000).toISOString(),
  endTime: new Date(NOW + 60_000).toISOString(), totalMarks: 100, isPublished: false, allowTypedAnswers: true,
  allowPdfUpload: true, courseId: "c1", createdAt: "", updatedAt: "", paperPdfUrl: null, mcqPayload: null,
  sitting: { autoSubmitLeadSeconds: 15 }, ...over,
});
const serverAhead = (ms: number) => m.get.mockResolvedValue({ data: { timestamp: new Date(NOW + ms).toISOString() } });
const advance = (seconds: number) => act(async () => { await vi.advanceTimersByTimeAsync(seconds * 1000); });
const type = (text: string, label = "Answer 1") => fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const submitButton = () => screen.getByRole("button", { name: /submit exam/i });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  m.post.mockReset().mockResolvedValue({ data: { submission: { id: "s1" } } });
  m.patch.mockReset();
  m.refresh.mockReset();
  serverAhead(0);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("typed answers are kept on the device", () => {
  it("restores typed answers after a reload", async () => {
    localStorage.setItem(WRITTEN, JSON.stringify({ channel: "typed", parts: [{ key: "part-1", text: "Half done" }, { key: "part-2", text: "More" }] }));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Half done");
    expect(screen.getByLabelText("Answer 2")).toHaveValue("More");
  });

  it("restores the chosen answer method", async () => {
    localStorage.setItem(WRITTEN, JSON.stringify({ channel: "pdf", parts: [{ key: "part-1", text: "" }] }));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    expect(screen.getByRole("tab", { name: "Upload PDF" })).toHaveAttribute("aria-selected", "true");
  });

  it("restores MCQ selections together with the written draft", async () => {
    localStorage.setItem(MCQ, JSON.stringify({ q1: ["a"] }));
    const hybrid = exam({ type: "HYBRID", mcqPayload: { questions: [{ id: "q1", text: "2+2", order: 1, marks: 5, options: [{ id: "a", text: "4" }, { id: "b", text: "5" }] }] } });
    render(<ExamSit userId="u1" exam={hybrid} />);
    await advance(0);
    expect(screen.getByRole("checkbox", { name: "4" })).toBeChecked();
  });

  it("saves as the student types", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Because of the lever");
    expect(JSON.parse(localStorage.getItem(WRITTEN)!)).toEqual({ channel: "typed", parts: [{ key: "part-1", text: "Because of the lever" }] });
  });

  it("does not overwrite a saved draft with an empty page while it restores", async () => {
    localStorage.setItem(WRITTEN, JSON.stringify({ channel: "typed", parts: [{ key: "part-1", text: "Keep me" }] }));
    render(<ExamSit userId="u1" exam={exam()} />);
    expect(JSON.parse(localStorage.getItem(WRITTEN)!).parts[0].text).toBe("Keep me");
    await advance(0);
    expect(JSON.parse(localStorage.getItem(WRITTEN)!).parts[0].text).toBe("Keep me");
  });

  it("does not restore a draft that another student saved on the same device", async () => {
    localStorage.setItem("exam:u2:e1:written", JSON.stringify({ channel: "typed", parts: [{ key: "part-1", text: "Someone else's work" }] }));
    localStorage.setItem("exam:e1:written", JSON.stringify({ channel: "typed", parts: [{ key: "part-1", text: "Old unscoped draft" }] }));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    expect(screen.getByLabelText("Answer 1")).toHaveValue("");
    await advance(46);
    expect(m.post).not.toHaveBeenCalled();
  });

  it("ignores a corrupt draft", async () => {
    localStorage.setItem(WRITTEN, "{not json");
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    expect(screen.getByLabelText("Answer 1")).toHaveValue("");
  });

  it("still works when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Still typing");
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Still typing");
  });

  it("clears the drafts once the submission is accepted", async () => {
    localStorage.setItem(MCQ, JSON.stringify({}));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Final");
    fireEvent.click(submitButton());
    await advance(0);
    expect(localStorage.getItem(WRITTEN)).toBeNull();
    expect(localStorage.getItem(MCQ)).toBeNull();
    expect(m.refresh).toHaveBeenCalled();
  });
});

describe("answer parts", () => {
  it("never reuses a key after a middle answer is removed", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    fireEvent.click(screen.getByRole("button", { name: "Add answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Add answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove answer 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add answer" }));
    const keys = JSON.parse(localStorage.getItem(WRITTEN)!).parts.map((p: { key: string }) => p.key);
    expect(keys).toEqual(["part-1", "part-3", "part-4"]);
  });
});

describe("a second tab on the same exam", () => {
  const otherTab = (key: string, newValue: string | null) =>
    act(() => { window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: localStorage })); });
  const draftOf = (text: string) => JSON.stringify({ channel: "typed", parts: [{ key: "part-1", text }] });

  it("adopts the draft the other tab saved", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Mine");
    otherTab(WRITTEN, draftOf("Typed in the other tab"));
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Typed in the other tab");
  });

  it("does not wipe this tab when the other tab clears its draft after submitting", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Keep this");
    otherTab(WRITTEN, null);
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Keep this");
  });

  it("ignores a corrupt draft and drafts for other keys", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Keep this");
    otherTab(WRITTEN, "{not json");
    otherTab("exam:u2:e1:written", draftOf("Not mine"));
    expect(screen.getByLabelText("Answer 1")).toHaveValue("Keep this");
  });

  it("does not write back what it just adopted", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    const write = vi.spyOn(Storage.prototype, "setItem");
    otherTab(WRITTEN, draftOf("From the other tab"));
    expect(write).toHaveBeenCalledTimes(1); // the autosave effect rewrites the same text, which fires no storage event
    expect(write.mock.calls[0]![1]).toBe(draftOf("From the other tab"));
  });

  it("treats an answer the other tab already sent as sent, not as an error", async () => {
    m.post.mockRejectedValue(new ApiError(409, "You have already submitted this exam", "ALREADY_SUBMITTED"));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Both tabs held this");
    await advance(46);
    expect(screen.getByText("Submitted automatically")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(localStorage.getItem(WRITTEN)).toBeNull();
  });

  it("still shows the same refusal as an error when the student pressed Submit", async () => {
    m.post.mockRejectedValue(new ApiError(409, "You have already submitted this exam", "ALREADY_SUBMITTED"));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("By hand");
    fireEvent.click(submitButton());
    await advance(0);
    expect(screen.getByRole("alert")).toHaveTextContent("already submitted");
    expect(screen.queryByText("Submitted automatically")).not.toBeInTheDocument();
  });
});

describe("leaving the page with unsent work", () => {
  const leave = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("warns while something is typed", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Unsent");
    expect(leave()).toBe(true);
  });

  it("does not warn when nothing is typed or chosen", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    expect(leave()).toBe(false);
  });

  it("stops warning after the work is sent", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Sent");
    fireEvent.click(submitButton());
    await advance(0);
    expect(leave()).toBe(false);
  });

  it("stops warning when the page goes away", async () => {
    const { unmount } = render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Unsent");
    unmount();
    expect(leave()).toBe(false);
  });
});

describe("submitting before time is up", () => {
  it("sends the typed answers the lead time before the end and says so", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Typed in time");
    await advance(44);
    expect(m.post).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
    await advance(2);
    expect(m.post).toHaveBeenCalledTimes(1);
    expect(m.post).toHaveBeenCalledWith("/submissions", { examId: "e1", writtenAnswers: { "part-1": "Typed in time" } });
    expect(screen.getByText("Submitted automatically")).toBeInTheDocument();
  });

  it("uses the lead time the server sent", async () => {
    render(<ExamSit userId="u1" exam={exam({ sitting: { autoSubmitLeadSeconds: 40 } })} />);
    await advance(0);
    type("Early");
    await advance(19);
    expect(m.post).not.toHaveBeenCalled();
    await advance(2);
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it("falls back to 15 seconds when the server sent nothing", async () => {
    render(<ExamSit userId="u1" exam={exam({ sitting: undefined })} />);
    await advance(0);
    type("Default");
    await advance(46);
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it("follows the server clock when the device is 30 seconds fast", async () => {
    serverAhead(-30_000);
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Fast clock");
    await advance(70);
    expect(m.post).not.toHaveBeenCalled();
    await advance(6);
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it("follows the server clock when the device is 30 seconds slow", async () => {
    serverAhead(30_000);
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Slow clock");
    await advance(14);
    expect(m.post).not.toHaveBeenCalled();
    await advance(2);
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when nothing is typed or chosen, and the time-up notice follows at the end", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    await advance(61);
    expect(m.post).not.toHaveBeenCalled();
    expect(screen.getByText(/time is up/i)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
  });

  it("does not send a PDF answer that has no file yet, but sends one that has", async () => {
    m.post.mockResolvedValue({ data: { submission: { id: "s1" }, uploadUrl: "https://upload.example/a", uploadKey: "k" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    fireEvent.click(screen.getByRole("tab", { name: "Upload PDF" }));
    await advance(44);
    expect(m.post).not.toHaveBeenCalled();
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["%PDF"], "a.pdf", { type: "application/pdf" })] },
    });
    await advance(2);
    expect(m.post).toHaveBeenCalledTimes(1);
    expect(m.patch).toHaveBeenCalledWith("/submissions/s1/complete", { key: "k" });
  });

  it("does not send twice when the student presses Submit just before it fires", async () => {
    m.post.mockReturnValue(new Promise(() => {}));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Both");
    await advance(44);
    fireEvent.click(submitButton());
    await advance(5);
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it("reports a failed automatic submit once and leaves Submit available", async () => {
    m.post.mockRejectedValue(new Error("Network down"));
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Offline");
    await advance(46);
    expect(screen.getByRole("alert")).toHaveTextContent("Network down");
    await advance(10);
    expect(m.post).toHaveBeenCalledTimes(1);
    expect(submitButton()).toBeEnabled();
  });

  it("still sends work typed after the lead time has begun", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    await advance(50);
    expect(m.post).not.toHaveBeenCalled();
    type("Typed in the last seconds");
    await advance(2);
    expect(m.post).toHaveBeenCalledTimes(1);
  });

  it("does not claim an automatic submit when the student pressed Submit", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("By hand");
    fireEvent.click(submitButton());
    await advance(0);
    expect(m.post).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Submitted automatically")).not.toBeInTheDocument();
  });

  it("goes on to the result when Continue is pressed after an automatic submit", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    type("Auto");
    await advance(46);
    expect(m.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(m.refresh).toHaveBeenCalledTimes(1);
  });

  it("reports a hybrid exam with ticks but no written part once, because the server needs both", async () => {
    const hybrid = exam({ type: "HYBRID", mcqPayload: { questions: [{ id: "q1", text: "2+2", order: 1, marks: 5, options: [{ id: "a", text: "4" }, { id: "b", text: "5" }] }] } });
    render(<ExamSit userId="u1" exam={hybrid} />);
    await advance(0);
    fireEvent.click(screen.getByRole("checkbox", { name: "4" }));
    await advance(46);
    expect(m.post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Type your written answers before submitting.");
    await advance(10);
    expect(m.post).not.toHaveBeenCalled();
  });

  it("labels the countdown for assistive technology", async () => {
    render(<ExamSit userId="u1" exam={exam()} />);
    await advance(0);
    expect(screen.getByRole("timer", { name: "Time remaining" })).toBeInTheDocument();
  });
});
