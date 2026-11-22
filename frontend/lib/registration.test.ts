import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { ageOn, colomboToday, isMinorBirthDate, looksLikeMobile, needsGuardian, readPossibleDuplicates, registrationBody } from "./registration";

const apiError = (code: string, details?: unknown) => new ApiError(409, "x", code, undefined, undefined, details);

describe("colomboToday", () => {
  it("is already tomorrow in Colombo late in the UTC evening", () => {
    expect(colomboToday(new Date("2026-11-21T20:00:00.000Z"))).toBe("2026-11-22");
    expect(colomboToday(new Date("2026-11-21T10:00:00.000Z"))).toBe("2026-11-21");
  });
});

describe("age", () => {
  it("counts the birthday on the day", () => {
    expect(ageOn("2008-11-22", "2026-11-22")).toBe(18);
    expect(ageOn("2008-11-23", "2026-11-22")).toBe(17);
  });

  it("treats the day before the 18th birthday as a minor and the day itself as an adult", () => {
    expect(isMinorBirthDate("2008-11-23", "2026-11-22")).toBe(true);
    expect(isMinorBirthDate("2008-11-22", "2026-11-22")).toBe(false);
  });

  it("does not call a half-typed or future date a minor", () => {
    expect(isMinorBirthDate("", "2026-11-22")).toBe(false);
    expect(isMinorBirthDate("2012-1", "2026-11-22")).toBe(false);
    expect(isMinorBirthDate("2030-01-01", "2026-11-22")).toBe(false);
  });

  it("follows another adult age when given one", () => {
    expect(isMinorBirthDate("2008-11-22", "2026-11-22", 21)).toBe(true);
  });
});

describe("looksLikeMobile", () => {
  it.each(["0771234567", "077 123 4567", "+94771234567", "+94 77 123 4567", "077-123-4567"])("accepts %s", (value) => {
    expect(looksLikeMobile(value)).toBe(true);
  });
  it.each(["", "0112345678", "771234567", "07712345", "abc"])("refuses %s", (value) => {
    expect(looksLikeMobile(value)).toBe(false);
  });
});

describe("registrationBody", () => {
  const empty = { name: "  Kasun Silva ", dateOfBirth: "2005-03-04", phone: "", guardianName: "", guardianMobile: "", guardianConsent: false };

  it("sends only what was filled in, trimmed", () => {
    expect(registrationBody({ ...empty, phone: " 077 123 4567 " })).toEqual({ name: "Kasun Silva", dateOfBirth: "2005-03-04", phone: "077 123 4567" });
  });

  it("includes the guardian block and the consent tick for a minor", () => {
    expect(registrationBody({ ...empty, guardianName: "Nimal Silva", guardianMobile: "0712345678", guardianConsent: true })).toEqual({
      name: "Kasun Silva", dateOfBirth: "2005-03-04", guardianName: "Nimal Silva", guardianMobile: "0712345678", guardianConsent: true,
    });
  });

  it("never sends a NIC or an empty optional field", () => {
    const body = registrationBody(empty);
    expect(Object.keys(body)).toEqual(["name", "dateOfBirth"]);
  });
});

describe("server answers the form acts on", () => {
  it("reads the students a registration stopped on", () => {
    const matches = [{ id: "a", name: "Kasun Silva", indexNumber: 7 }];
    expect(readPossibleDuplicates(apiError("POSSIBLE_DUPLICATE", { matches }))).toEqual(matches);
  });

  it("ignores any other failure and an empty match list", () => {
    expect(readPossibleDuplicates(apiError("EMAIL_ALREADY_EXISTS"))).toBeNull();
    expect(readPossibleDuplicates(apiError("POSSIBLE_DUPLICATE", { matches: [] }))).toBeNull();
    expect(readPossibleDuplicates(new Error("x"))).toBeNull();
  });

  it("recognises a missing guardian", () => {
    expect(needsGuardian(apiError("GUARDIAN_REQUIRED"))).toBe(true);
    expect(needsGuardian(apiError("GUARDIAN_CONSENT_REQUIRED"))).toBe(true);
    expect(needsGuardian(apiError("EMAIL_ALREADY_EXISTS"))).toBe(false);
  });
});
