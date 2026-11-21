"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import type { ClassSession } from "@/lib/types";

const field = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

export function SessionEditDialog({ classId, session }: { classId: string; session: ClassSession }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colomboDate = new Date(new Date(session.date).getTime() + 330 * 60_000).toISOString().slice(0, 16);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/classes/${classId}/sessions/${session.id}`, {
        classType: data.get("classType") === "SIMULCAST" ? null : data.get("classType"),
        date: new Date(`${data.get("date")}:00+05:30`).toISOString(),
        durationMinutes: Number(data.get("durationMinutes")),
      }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><Button size="sm" variant="outline">Edit session</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-card p-5 shadow-lg">
          <Dialog.Title className="font-semibold">Edit session</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">Times are in Colombo time.</Dialog.Description>
          <form onSubmit={save} className="mt-4 space-y-3">
            <label className="block text-sm">Mode<select name="classType" required defaultValue={session.classType ?? "SIMULCAST"} className={field}>
              <option value="PHYSICAL">In hall</option><option value="ONLINE">Online only</option><option value="SIMULCAST">In hall + live stream</option>
            </select></label>
            <label className="block text-sm">Date and time<input name="date" type="datetime-local" required defaultValue={colomboDate} className={field} /></label>
            <label className="block text-sm">Duration (minutes)<input name="durationMinutes" type="number" min={1} required defaultValue={session.durationMinutes} className={field} /></label>
            {session.liveScheduled && <p className="text-sm text-muted-foreground">Changing the date does not move the existing Zoom meeting.</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild><Button type="button" variant="outline">Cancel</Button></Dialog.Close>
              <Button type="submit" disabled={busy}>Save session</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
