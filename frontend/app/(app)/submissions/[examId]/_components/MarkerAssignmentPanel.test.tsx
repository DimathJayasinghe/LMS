import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkerAssignmentPanel } from "./MarkerAssignmentPanel";

const { put, refresh } = vi.hoisted(() => ({ put: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { put } };
});

beforeEach(() => {
  vi.clearAllMocks();
  put.mockResolvedValue({ data: [], count: 0 });
});

describe("MarkerAssignmentPanel", () => {
  it("replaces the assigned marker set with an idempotency key", async () => {
    const user = userEvent.setup();
    render(
      <MarkerAssignmentPanel
        examId="exam-1"
        markers={[
          { id: "marker-1", name: "Marker One", role: "MARKER" },
          { id: "marker-2", name: "Marker Two", role: "MARKER" },
        ]}
        assignments={[
          {
            markerId: "marker-1",
            assignedAt: "2026-08-20T00:00:00.000Z",
            marker: { id: "marker-1", name: "Marker One", role: "MARKER" },
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Assigned markers/ }));
    await user.click(screen.getByLabelText("Marker One"));
    await user.click(screen.getByLabelText("Marker Two"));
    await user.click(screen.getByRole("button", { name: "Save markers" }));

    await waitFor(() =>
      expect(put).toHaveBeenCalledWith(
        "/exams/exam-1/markers",
        { markerIds: ["marker-2"] },
        { headers: { "Idempotency-Key": expect.any(String) } },
      ),
    );
    expect(refresh).toHaveBeenCalled();
  });
});
