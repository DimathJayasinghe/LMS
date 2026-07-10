import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** "SUPER_ADMIN" -> "Super Admin" for display. */
export function formatRole(role: string): string {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ")
}

/**
 * Format an LKR amount for display. The API sends money as a decimal string
 * (e.g. "2500.00"); we render "Rs 2,500" (whole) or "Rs 2,500.50" (with cents).
 */
export function formatCurrency(amount: string | number): string {
  const value = typeof amount === "string" ? Number(amount) : amount
  if (!Number.isFinite(value)) return "Rs —"
  const hasCents = Math.round(value * 100) % 100 !== 0
  return `Rs ${value.toLocaleString("en-LK", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  })}`
}
