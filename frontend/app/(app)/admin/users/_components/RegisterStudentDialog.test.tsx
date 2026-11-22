import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterStudentDialog } from "./RegisterStudentDialog";
import { ApiError } from "@/lib/api";

const { post, refresh } = vi.hoisted(() => ({ post: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post } };
});

const created = {
  data: {
    user: { id: "u1", indexNumber: 12, name: "Kasun Silva", email: "kasun@example.com", barcode: "LMS-000012" },
    temporaryPassword: "Temp-Pass-9xK",
    mustChangePassword: true,
  },
};

beforeEach(() => { post.mockReset(); refresh.mockReset(); });

async function open() {
  const ui = userEvent.setup();
  render(<RegisterStudentDialog />);
  await ui.click(screen.getByRole("button", { name: "Register student" }));
  return ui;
}
async function fillAdult(ui: ReturnType<typeof userEvent.setup>) {
  await ui.type(screen.getByLabelText("Full name"), "Kasun Silva");
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2000-03-04" } });
  await ui.type(screen.getByLabelText(/Student's mobile/), "0771234567");
  await ui.type(screen.getByLabelText(/^Email/), "kasun@example.com");
}

describe("RegisterStudentDialog", () => {
  it("asks for no NIC and no password, and shows no guardian block for an adult", async () => {
    const ui = await open();
    await fillAdult(ui);
    expect(screen.queryByLabelText(/NIC/i)).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByText("Guardian")).toBeNull();
  });

  it("registers the walk-in with a fresh idempotency key and shows the slip once", async () => {
    post.mockResolvedValue(created);
    const ui = await open();
    await fillAdult(ui);
    await ui.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/users/students",
      { name: "Kasun Silva", dateOfBirth: "2000-03-04", phone: "0771234567", email: "kasun@example.com" },
      expect.objectContaining({ headers: expect.objectContaining({ "Idempotency-Key": expect.stringMatching(/^[0-9a-f-]{36}$/) }) }),
    ));
    expect(await screen.findByTestId("temporary-password")).toHaveTextContent("Temp-Pass-9xK");
    expect(screen.getByText("LMS-000012")).toBeInTheDocument();
    expect(document.body.dataset.printSlip).toBe("true");
  });

  it("prints the slip and refreshes the list behind when closed, dropping the password", async () => {
    post.mockResolvedValue(created);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const ui = await open();
    await fillAdult(ui);
    await ui.click(screen.getByRole("button", { name: "Register" }));
    await ui.click(await screen.findByRole("button", { name: "Print slip" }));
    expect(print).toHaveBeenCalled();

    await ui.click(screen.getByRole("button", { name: "Done" }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByText("Temp-Pass-9xK")).toBeNull();
    expect(document.body.dataset.printSlip).toBeUndefined();
  });

  it("shows the guardian block for a minor and sends the guardian and the consent", async () => {
    post.mockResolvedValue(created);
    const ui = await open();
    await ui.type(screen.getByLabelText("Full name"), "Dinuka Silva");
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2014-06-01" } });
    await ui.type(screen.getByLabelText(/^Email/), "dinuka@example.com");
    await ui.type(screen.getByLabelText("Guardian's name"), "Nimal Silva");
    await ui.type(screen.getByLabelText("Guardian's mobile"), "0712345678");
    await ui.click(screen.getByRole("checkbox"));
    await ui.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(post.mock.calls[0]![1]).toEqual({
      name: "Dinuka Silva", dateOfBirth: "2014-06-01", guardianName: "Nimal Silva", guardianMobile: "0712345678", guardianConsent: true, email: "dinuka@example.com",
    }));
  });

  it("shows the guardian block when the server says one is needed, even if the date looked adult", async () => {
    post.mockRejectedValue(new ApiError(400, "A student under 21 needs a guardian's name and mobile number.", "GUARDIAN_REQUIRED"));
    const ui = await open();
    await fillAdult(ui);
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText(/needs a guardian/)).toBeInTheDocument();
    expect(screen.getByLabelText("Guardian's name")).toBeInTheDocument();
  });

  it("stops on a possible duplicate, then registers anyway with a reason and a new idempotency key", async () => {
    post.mockRejectedValueOnce(new ApiError(409, "Looks like a duplicate.", "POSSIBLE_DUPLICATE", undefined, undefined, { matches: [{ id: "old", name: "Kasun Silva", indexNumber: 7 }] }));
    post.mockResolvedValueOnce(created);
    const ui = await open();
    await fillAdult(ui);
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("Kasun Silva (#7)")).toBeInTheDocument();
    await ui.type(screen.getByLabelText("Reason for registering anyway"), "Twin brother");
    await ui.click(screen.getByRole("button", { name: "Register anyway" }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]![1]).toMatchObject({ duplicateOverrideReason: "Twin brother" });
    expect(post.mock.calls[1]![2].headers["Idempotency-Key"]).not.toBe(post.mock.calls[0]![2].headers["Idempotency-Key"]);
    expect(await screen.findByTestId("temporary-password")).toBeInTheDocument();
  });

  it("shows any other refusal in the dialog and keeps what was typed", async () => {
    post.mockRejectedValue(new ApiError(409, "An account with this email already exists.", "EMAIL_ALREADY_EXISTS"));
    const ui = await open();
    await fillAdult(ui);
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("An account with this email already exists.");
    expect(screen.getByLabelText("Full name")).toHaveValue("Kasun Silva");
  });
});
