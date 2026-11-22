"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { CHANGEABLE_ROLES, needsActorPassword } from "@/lib/account-actions";
import { readHandoverBlock, type HandoverBlock, type HandoverCourse } from "@/lib/handover";
import { roleLabel } from "@/lib/roles";
import type { AcademicStaff, ApiList, Role, User } from "@/lib/types";
import { HandoverSection } from "./HandoverSection";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

interface Props {
  kind: "role" | "deactivate";
  user: User;
}

/**
 * One confirmation for the two changes that end a person's access: a role change (reason, your password, from-to role) and
 * a deactivation. A teacher with classes, or a marker with marking, is told what is in the way and, for classes, picks who
 * takes over; the change and the hand-over are then sent together and happen together.
 */
export function AccountChangeDialog({ kind, user }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [block, setBlock] = useState<HandoverBlock | null>(null);
  const [courses, setCourses] = useState<HandoverCourse[]>([]);
  const [teachers, setTeachers] = useState<AcademicStaff[] | null>(null);
  const [receiverId, setReceiverId] = useState("");
  const [nextRole, setNextRole] = useState<Role | "">("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const askPassword = needsActorPassword(kind, user);
  const isRole = kind === "role";

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      setBlock(null);
      setReceiverId("");
      setPassword("");
    }
  }

  async function loadTeachers() {
    if (teachers) return;
    try {
      setTeachers((await api.get<ApiList<AcademicStaff>>("/users/academic-staff?role=TEACHER")).data);
    } catch {
      setError("Could not load the list of teachers. Close this and try again.");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch(
        `/users/${user.id}/${isRole ? "role" : "status"}`,
        {
          ...(isRole ? { role: nextRole } : { isActive: false }),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(askPassword ? { currentPassword: password } : {}),
          ...(block && block.kind !== "marking" && receiverId ? { handoverAllTo: receiverId } : {}),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      onOpenChange(false);
      router.refresh();
    } catch (cause) {
      const found = readHandoverBlock(cause);
      if (found) {
        setBlock(found);
        if (found.kind === "classes") setCourses(found.courses);
        if (found.kind !== "marking") await loadTeachers();
      } else {
        setError(cause instanceof ApiError ? cause.message : "Could not save the change. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const needsReceiver = block !== null && block.kind !== "marking";
  const blocked = block?.kind === "marking" || (needsReceiver && !receiverId);
  const title = isRole ? `Change role of ${user.name}` : `Deactivate ${user.name}`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="ghost" aria-label={isRole ? `Change role for ${user.name}` : `Deactivate ${user.name}`}>
          {isRole ? "Change role" : "Deactivate"}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-lg">
          <Dialog.Title className="font-semibold">{title}</Dialog.Title>
          <form onSubmit={submit} className="mt-3 space-y-3">
            <Dialog.Description className="text-sm text-muted-foreground">
              {isRole
                ? `${user.name} is a ${roleLabel(user.role)} now. They are signed out everywhere and sign in again with the new role.`
                : `${user.name} is signed out everywhere and cannot sign in until you activate the account again.`}
            </Dialog.Description>
            {isRole && (
              <label className="block text-sm">New role
                <select value={nextRole} onChange={(event) => setNextRole(event.target.value as Role)} required className={field}>
                  <option value="" disabled>Select a role</option>
                  {CHANGEABLE_ROLES.filter((role) => role !== user.role).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                </select>
              </label>
            )}
            <label className="block text-sm">{isRole ? "Reason" : "Reason (optional)"}
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} required={isRole} minLength={isRole ? 3 : undefined} maxLength={300} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            </label>
            {block && <HandoverSection block={block} courses={courses} teachers={teachers} receiverId={receiverId} onReceiver={setReceiverId} leaverId={user.id} />}
            {askPassword && (
              <label className="block text-sm">Your password
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required className={field} />
              </label>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
              <Button type="submit" disabled={busy || blocked}>
                {needsReceiver ? (isRole ? "Hand over and change role" : "Hand over and deactivate") : isRole ? "Change role" : "Deactivate"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
