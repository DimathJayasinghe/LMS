import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { signupErrorMessage } from "./signup-error";

describe("signupErrorMessage", () => {
  it("asks the user to retry when a generated code is unavailable", () => {
    expect(signupErrorMessage(new ApiError(409, "This code is unavailable.", "CODE_UNAVAILABLE")))
      .toBe("Registration could not be completed. Please try again.");
  });

  it("preserves other API error messages", () => {
    expect(signupErrorMessage(new ApiError(409, "Email already exists.", "EMAIL_ALREADY_EXISTS")))
      .toBe("Email already exists.");
  });
});
