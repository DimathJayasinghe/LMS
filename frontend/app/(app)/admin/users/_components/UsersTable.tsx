"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError } from "@/lib/api";
import { roleLabel } from "@/lib/roles";
import { canResetPassword } from "@/lib/password-reset";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import type { Role, User } from "@/lib/types";

interface Props {
  users: User[];
  canChangeRole: boolean;
  viewerId: string;
  viewerRole: Role;
  roles: Role[];
}

export function UsersTable({ users, canChangeRole, viewerId, viewerRole, roles }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const mutate = async (id: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError({ id, msg: e instanceof ApiError ? e.message : "Update failed. Try again." });
    } finally {
      setBusyId(null);
    }
  };

  if (users.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
        No users match these filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[46rem] text-sm">
        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Index</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Entrance code</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => {
            const active = u.deletedAt == null;
            const isSelf = u.id === viewerId;
            const busy = busyId === u.id;
            return (
              <tr key={u.id} className="bg-card align-middle">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  {error?.id === u.id && (
                    <p className="mt-1 text-xs text-destructive">{error.msg}</p>
                  )}
                </td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">#{u.indexNumber}</td>

                <td className="px-4 py-3">
                  {canChangeRole && !isSelf ? (
                    <select
                      value={u.role}
                      disabled={busy}
                      onChange={(e) => mutate(u.id, () => api.patch(`/users/${u.id}/role`, { role: e.target.value }, { headers: { "Idempotency-Key": crypto.randomUUID() } }))}
                      aria-label={`Role for ${u.name}`}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="outline">{roleLabel(u.role)}</Badge>
                  )}
                </td>

                <td className="px-4 py-3">
                  {editingId === u.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="A-0001"
                        className="w-28 rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={busy || draft.trim().length < 3}
                        onClick={() => mutate(u.id, () => api.patch(`/users/${u.id}/barcode`, { barcode: draft.trim() }, { headers: { "Idempotency-Key": crypto.randomUUID() } }))}
                        aria-label="Save code"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingId(null)} aria-label="Cancel">
                        <X className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(u.id);
                        setDraft(u.barcode ?? "");
                        setError(null);
                      }}
                      className="inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <span className={u.barcode ? "font-mono text-foreground" : ""}>{u.barcode ?? "—"}</span>
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  )}
                </td>

                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        active
                          ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                          : "border-border text-muted-foreground"
                      }
                    >
                      {active ? "Active" : "Inactive"}
                    </Badge>
                    {canResetPassword({ id: viewerId, role: viewerRole }, u) && <ResetPasswordDialog user={u} />}
                    {!isSelf && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => mutate(u.id, () => api.patch(`/users/${u.id}/status`, { isActive: !active }, { headers: { "Idempotency-Key": crypto.randomUUID() } }))}
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : active ? "Deactivate" : "Activate"}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
