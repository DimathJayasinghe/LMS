import { ApiError } from "@/lib/api";

export function signupErrorMessage(error: ApiError): string {
  return error.code === "CODE_UNAVAILABLE"
    ? "Registration could not be completed. Please try again."
    : error.message;
}
