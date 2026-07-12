import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstituteManager } from "./InstituteManager";
import { ApiError } from "@/lib/api";
import type { Institute } from "@/lib/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const { post, patch } = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post, patch, get: vi.fn(), del: vi.fn() } };
});

const institutes: Institute[] = [
  { id: "1", name: "Kandy Center", code: "KDY", city: "Kandy", isActive: true, createdAt: "", updatedAt: "" },
  { id: "2", name: "Old Galle", code: "GLL", city: null, isActive: false, createdAt: "", updatedAt: "" },
];

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  post.mockReset().mockResolvedValue(undefined);
  patch.mockReset().mockResolvedValue(undefined);
});

describe("InstituteManager — status filter", () => {
  it("defaults to Active: shows active rows, hides inactive", () => {
    render(<InstituteManager institutes={institutes} search="" />);
    expect(screen.getByText("Kandy Center")).toBeInTheDocument();
    expect(screen.queryByText("Old Galle")).not.toBeInTheDocument();
  });

  it("All shows both active and inactive", async () => {
    const user = userEvent.setup();
    render(<InstituteManager institutes={institutes} search="" />);
    await user.click(screen.getByRole("button", { name: "all" }));
    expect(screen.getByText("Kandy Center")).toBeInTheDocument();
    expect(screen.getByText("Old Galle")).toBeInTheDocument();
  });
});

describe("InstituteManager — create", () => {
  it("gates submit until BOTH name (>=2) and code (>=2) are valid", async () => {
    const user = userEvent.setup();
    render(<InstituteManager institutes={institutes} search="" />);

    await user.click(screen.getByRole("button", { name: "New institute" }));
    const submit = screen.getByRole("button", { name: "Create institute" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Name"), "Matara");
    expect(submit).toBeDisabled(); // code still empty

    await user.type(screen.getByLabelText("Code"), "M");
    expect(submit).toBeDisabled(); // code too short

    await user.type(screen.getByLabelText("Code"), "TR");
    expect(submit).toBeEnabled();
  });

  it("POSTs trimmed values (empty city → undefined) and refreshes", async () => {
    const user = userEvent.setup();
    render(<InstituteManager institutes={institutes} search="" />);

    await user.click(screen.getByRole("button", { name: "New institute" }));
    await user.type(screen.getByLabelText("Name"), "  Matara  ");
    await user.type(screen.getByLabelText("Code"), "  MTR  ");
    await user.click(screen.getByRole("button", { name: "Create institute" }));

    expect(post).toHaveBeenCalledWith("/institutes", {
      name: "Matara",
      code: "MTR",
      city: undefined,
      isActive: true,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("maps a duplicate-code 409 to inline error text and keeps the form open", async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, "Institute code already exists", "INSTITUTE_ALREADY_EXISTS"),
    );
    const user = userEvent.setup();
    render(<InstituteManager institutes={institutes} search="" />);

    await user.click(screen.getByRole("button", { name: "New institute" }));
    await user.type(screen.getByLabelText("Name"), "Kandy Two");
    await user.type(screen.getByLabelText("Code"), "KDY");
    await user.click(screen.getByRole("button", { name: "Create institute" }));

    expect(await screen.findByText("Institute code already exists")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create institute" })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("InstituteManager — edit / deactivate / mutual exclusivity", () => {
  it("opening a row edit collapses the create form and pre-fills code", async () => {
    const user = userEvent.setup();
    render(<InstituteManager institutes={institutes} search="" />);

    await user.click(screen.getByRole("button", { name: "New institute" }));
    expect(screen.getByRole("button", { name: "Create institute" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Kandy Center" }));
    expect(screen.queryByRole("button", { name: "Create institute" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Institute name")).toHaveValue("Kandy Center");
    expect(screen.getByLabelText("Institute code")).toHaveValue("KDY");
  });

  it("deactivate PATCHes isActive:false for that row", async () => {
    const user = userEvent.setup();
    render(<InstituteManager institutes={institutes} search="" />);

    const row = screen.getByText("Kandy Center").closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Deactivate" }));

    expect(patch).toHaveBeenCalledWith("/institutes/1", { isActive: false });
    expect(refresh).toHaveBeenCalled();
  });
});

describe("InstituteManager — empty states", () => {
  it("shows the first-run empty state when there are no institutes and no search", () => {
    render(<InstituteManager institutes={[]} search="" />);
    expect(screen.getByText("No institutes yet. Create the first one.")).toBeInTheDocument();
  });

  it("shows a search-specific empty state when a search returns nothing", () => {
    render(<InstituteManager institutes={[]} search="zzz" />);
    expect(screen.getByText("No institutes match your search.")).toBeInTheDocument();
  });
});
