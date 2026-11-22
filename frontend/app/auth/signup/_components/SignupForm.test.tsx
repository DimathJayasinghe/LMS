import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SignupForm } from "./SignupForm";
import { ApiError } from "@/lib/api";

const { post, push, refresh } = vi.hoisted(() => ({ post: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ refresh }) }));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: { post } };
});

beforeEach(() => { post.mockReset().mockResolvedValue({ data: {} }); push.mockReset(); refresh.mockReset().mockResolvedValue(undefined); });

type UI = ReturnType<typeof userEvent.setup>;
async function fillCommon(ui: UI, birthDate: string) {
  await ui.type(screen.getByLabelText("Full name"), "Kasun Silva");
  await ui.type(screen.getByLabelText("Email"), "kasun@example.com");
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: birthDate } });
  await ui.type(screen.getByLabelText("Password"), "Passw0rd!x");
  await ui.type(screen.getByLabelText("Confirm password"), "Passw0rd!x");
}

describe("SignupForm", () => {
  it("has a date of birth and no NIC field", () => {
    render(<SignupForm />);
    expect(screen.getByLabelText("Date of birth")).toBeInTheDocument();
    expect(screen.queryByLabelText(/NIC/i)).toBeNull();
    expect(screen.queryByText("Parent or guardian")).toBeNull();
  });

  it("registers an adult with only the fields the API accepts", async () => {
    const ui = userEvent.setup();
    render(<SignupForm />);
    await fillCommon(ui, "2000-03-04");
    await ui.type(screen.getByLabelText(/Your mobile number/), "0771234567");
    await ui.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/auth/register", {
      name: "Kasun Silva", dateOfBirth: "2000-03-04", phone: "0771234567", email: "kasun@example.com", password: "Passw0rd!x",
    }));
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("asks a minor for a guardian and sends the guardian and the agreement", async () => {
    const ui = userEvent.setup();
    render(<SignupForm />);
    await fillCommon(ui, "2014-06-01");
    await ui.type(screen.getByLabelText("Guardian's full name"), "Nimal Silva");
    await ui.type(screen.getByLabelText("Guardian's mobile number"), "0712345678");
    await ui.click(screen.getByRole("checkbox"));
    await ui.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(post.mock.calls[0]![1]).toEqual({
      name: "Kasun Silva", dateOfBirth: "2014-06-01", guardianName: "Nimal Silva", guardianMobile: "0712345678", guardianConsent: true,
      email: "kasun@example.com", password: "Passw0rd!x",
    }));
  });

  it("will not send a minor without the guardian's agreement", async () => {
    const ui = userEvent.setup();
    render(<SignupForm />);
    await fillCommon(ui, "2014-06-01");
    await ui.type(screen.getByLabelText("Guardian's full name"), "Nimal Silva");
    await ui.type(screen.getByLabelText("Guardian's mobile number"), "0712345678");
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("The guardian must agree")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("needs a mobile for the student or the guardian", async () => {
    const ui = userEvent.setup();
    render(<SignupForm />);
    await fillCommon(ui, "2000-03-04");
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("Enter your mobile number, or a guardian's")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses a landline before calling the API", async () => {
    const ui = userEvent.setup();
    render(<SignupForm />);
    await fillCommon(ui, "2000-03-04");
    await ui.type(screen.getByLabelText(/Your mobile number/), "0112345678");
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText(/Enter a Sri Lankan mobile number/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("shows the guardian block when the server says one is needed", async () => {
    post.mockRejectedValue(new ApiError(400, "A student under 21 needs a guardian's name and mobile number.", "GUARDIAN_REQUIRED"));
    const ui = userEvent.setup();
    render(<SignupForm />);
    await fillCommon(ui, "2000-03-04");
    await ui.type(screen.getByLabelText(/Your mobile number/), "0771234567");
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByLabelText("Guardian's full name")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("needs a guardian");
  });

  it("tells the visitor when registration is closed", async () => {
    post.mockRejectedValue(new ApiError(403, "Online registration is closed. Please register at the front desk.", "SELF_REGISTRATION_DISABLED"));
    const ui = userEvent.setup();
    render(<SignupForm />);
    await fillCommon(ui, "2000-03-04");
    await ui.type(screen.getByLabelText(/Your mobile number/), "0771234567");
    await ui.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Online registration is closed");
  });
});
