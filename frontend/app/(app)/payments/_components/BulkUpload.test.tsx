import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkUpload } from "./BulkUpload";
import { ApiError } from "@/lib/api";
import type { BulkUploadResult } from "@/lib/types";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { upload } };
});

const result = (over: Partial<BulkUploadResult> = {}): { data: BulkUploadResult } => ({
  data: { dryRun: true, applied: false, total: 3, created: 2, updated: 1, errors: [], ...over },
});
const file = () => new File(["x"], "payments.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

beforeEach(() => {
  upload.mockReset();
  refresh.mockReset();
});

const pick = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.upload(screen.getByLabelText("Bulk payment file"), file());
};

describe("BulkUpload — checking the file first", () => {
  it("sends nothing until the owner asks for the check, and never applies without a clean check", async () => {
    const user = userEvent.setup();
    render(<BulkUpload />);
    await pick(user);

    expect(upload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Check file" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
  });

  it("previews with dryRun and a fresh key, and does not refresh the page", async () => {
    upload.mockResolvedValue(result());
    const user = userEvent.setup();
    render(<BulkUpload />);
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Check file" }));

    expect(upload).toHaveBeenCalledWith("/payments/bulk-upload?dryRun=true", expect.any(FormData), { headers: { "Idempotency-Key": expect.any(String) } });
    expect(await screen.findByText(/3 rows/)).toBeInTheDocument();
    expect(screen.getByText(/2 new/)).toBeInTheDocument();
    expect(screen.getByText(/1 to update/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been saved yet/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("lists every refused row, offers no apply button, and says nothing was saved", async () => {
    upload.mockResolvedValue(result({ errors: [{ row: 3, message: "This month is already paid." }, { row: 7, message: "Enrollment not found." }] }));
    const user = userEvent.setup();
    render(<BulkUpload />);
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Check file" }));

    expect(await screen.findByText(/Row 3: This month is already paid\./)).toBeInTheDocument();
    expect(screen.getByText(/Row 7: Enrollment not found\./)).toBeInTheDocument();
    expect(screen.getByText(/Fix these rows/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
  });

  it("offers no apply button for a file with nothing to record", async () => {
    upload.mockResolvedValue(result({ total: 1, created: 0, updated: 0 }));
    const user = userEvent.setup();
    render(<BulkUpload />);
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Check file" }));

    await screen.findByText(/1 row\b/);
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
  });
});

describe("BulkUpload — applying", () => {
  const checked = async (user: ReturnType<typeof userEvent.setup>) => {
    upload.mockResolvedValueOnce(result());
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Check file" }));
    return screen.findByRole("button", { name: "Apply 3 payments" });
  };

  it("applies the same file with a second, different key and refreshes the list", async () => {
    const user = userEvent.setup();
    render(<BulkUpload />);
    const apply = await checked(user);
    upload.mockResolvedValueOnce(result({ dryRun: false, applied: true }));
    await user.click(apply);

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls[1]![0]).toBe("/payments/bulk-upload?dryRun=false");
    expect(upload.mock.calls[1]![2].headers["Idempotency-Key"]).not.toBe(upload.mock.calls[0]![2].headers["Idempotency-Key"]);
    expect((upload.mock.calls[1]![1] as FormData).get("file")).toBeInstanceOf(File);
    expect(await screen.findByText(/3 payments recorded/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
  });

  it("shows the server's refusal and keeps the page as it was when the apply is refused", async () => {
    const user = userEvent.setup();
    render(<BulkUpload />);
    const apply = await checked(user);
    upload.mockResolvedValueOnce(result({ dryRun: false, applied: false, errors: [{ row: 4, message: "This month is already paid." }] }));
    await user.click(apply);

    expect(await screen.findByText(/Row 4: This month is already paid\./)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was saved/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a conflict message and lets the owner check again", async () => {
    const user = userEvent.setup();
    render(<BulkUpload />);
    const apply = await checked(user);
    upload.mockRejectedValueOnce(new ApiError(409, "Row 2 changed while the file was being applied. Nothing was saved. Run the preview again.", "BULK_UPLOAD_CONFLICT"));
    await user.click(apply);

    expect(await screen.findByText(/Row 2 changed while the file was being applied/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check file" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("blocks a second click while the apply is running", async () => {
    const user = userEvent.setup();
    render(<BulkUpload />);
    const apply = await checked(user);
    let finish!: (value: ReturnType<typeof result>) => void;
    upload.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    await user.click(apply);

    expect(screen.getByRole("button", { name: /Applying/ })).toBeDisabled();
    expect(screen.getByLabelText("Bulk payment file")).toBeDisabled();
    finish(result({ dryRun: false, applied: true }));
    await screen.findByText(/payments recorded/);
  });
});

describe("BulkUpload — failures and changing the file", () => {
  it("shows a server error from the check", async () => {
    upload.mockRejectedValue(new ApiError(400, "A bulk upload may contain at most 300 rows.", "BULK_UPLOAD_TOO_MANY_ROWS"));
    const user = userEvent.setup();
    render(<BulkUpload />);
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Check file" }));
    expect(await screen.findByText("A bulk upload may contain at most 300 rows.")).toBeInTheDocument();
  });

  it("shows a plain message for a failure that is not an API error", async () => {
    upload.mockRejectedValue(new Error("network"));
    const user = userEvent.setup();
    render(<BulkUpload />);
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Check file" }));
    expect(await screen.findByText("Upload failed. Try again.")).toBeInTheDocument();
  });

  it("drops the old check, so a changed file has to be checked again before it can be applied", async () => {
    upload.mockResolvedValue(result());
    const user = userEvent.setup();
    render(<BulkUpload />);
    await pick(user);
    await user.click(screen.getByRole("button", { name: "Check file" }));
    await screen.findByRole("button", { name: "Apply 3 payments" });

    await pick(user);
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/3 rows/)).not.toBeInTheDocument();
  });
});
