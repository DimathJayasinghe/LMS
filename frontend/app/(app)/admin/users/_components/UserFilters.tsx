"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/types";

interface Props {
  search: string;
  role: Role | "all";
  status: string;
  roles: Role[];
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

export function UserFilters({ search, role, status, roles }: Props) {
  const router = useRouter();
  const [term, setTerm] = useState(search);

  // Rebuild the query from the current controls; any filter change resets page.
  const go = (next: { search?: string; role?: string; status?: string }): void => {
    const q = new URLSearchParams();
    const s = next.search ?? term;
    const r = next.role ?? role;
    const st = next.status ?? status;
    if (s) q.set("search", s);
    if (r && r !== "all") q.set("role", r);
    if (st && st !== "active") q.set("status", st);
    const qs = q.toString();
    router.push(qs ? `/admin/users?${qs}` : "/admin/users");
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go({ search: term });
        }}
        className="relative flex-1 min-w-[14rem]"
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search name, email, NIC, barcode…"
          aria-label="Search users"
          className={`${inputClass} w-full pl-9`}
        />
      </form>

      <select
        value={role}
        onChange={(e) => go({ role: e.target.value })}
        aria-label="Filter by role"
        className={inputClass}
      >
        <option value="all">All roles</option>
        {roles.map((r) => (
          <option key={r} value={r}>
            {roleLabel(r)}
          </option>
        ))}
      </select>

      <select
        value={status}
        onChange={(e) => go({ status: e.target.value })}
        aria-label="Filter by status"
        className={inputClass}
      >
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="all">All</option>
      </select>
    </div>
  );
}
