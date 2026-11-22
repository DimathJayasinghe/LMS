import { describe, expect, it } from "vitest";
import { hallMessage, isUnfinishedUpload, studentExamView } from "./exam";

const unfinished = { status: "UPLOADING" as const, answerPdfUrl: null };
const done = { status: "COMPLETED" as const, answerPdfUrl: null };
const online = { myAudience: { label: "Group", deliveryMode: "ONLINE" as const, instituteName: null } };
const hall = { myAudience: { label: "Hall A", deliveryMode: "PHYSICAL" as const, instituteName: "Nugegoda Centre" } };

describe("isUnfinishedUpload", () => {
  it("is true only for an UPLOADING row with no stored file", () => {
    expect(isUnfinishedUpload(unfinished)).toBe(true);
    expect(isUnfinishedUpload({ status: "UPLOADING", answerPdfUrl: "answers/x.pdf" })).toBe(false);
    expect(isUnfinishedUpload(done)).toBe(false);
  });
});

describe("studentExamView", () => {
  it("shows the result of a finished submission in every window state", () => {
    for (const status of ["upcoming", "active", "ended"] as const) {
      expect(studentExamView(online, status, done)).toBe("result");
    }
  });

  it("shows a hall result: a hall participant with a recorded mark still sees it", () => {
    expect(studentExamView(hall, "ended", done)).toBe("result");
  });

  it("tells a hall participant where the paper is sat, in any window state, with no way to sit online", () => {
    for (const status of ["upcoming", "active", "ended"] as const) {
      expect(studentExamView(hall, status)).toBe("hall");
    }
  });

  it("lets an online participant sit while the window is open", () => {
    expect(studentExamView(online, "active")).toBe("sit");
    expect(studentExamView({ myAudience: null }, "active")).toBe("sit");
    expect(studentExamView({}, "active")).toBe("sit");
  });

  it("resumes an unfinished upload while the window is open", () => {
    expect(studentExamView(online, "active", unfinished)).toBe("sit");
  });

  it("says the file was not received once the window has closed on an unfinished upload", () => {
    expect(studentExamView(online, "ended", unfinished)).toBe("not-received");
  });

  it("waits before the window opens and closes it afterwards", () => {
    expect(studentExamView(online, "upcoming")).toBe("upcoming");
    expect(studentExamView(online, "ended")).toBe("closed");
  });
});

describe("hallMessage", () => {
  it("names the institute when there is one", () => {
    expect(hallMessage(hall.myAudience)).toBe("Your paper is sat in the hall at Nugegoda Centre. There is no online submission.");
  });

  it("still reads well without an institute", () => {
    expect(hallMessage({ label: "Hall A", deliveryMode: "PHYSICAL", instituteName: null })).toBe("Your paper is sat in the hall. There is no online submission.");
  });
});
