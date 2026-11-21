"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Plus, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { api, ApiError } from "@/lib/api";
import type { Subject } from "@/lib/types";

interface Props {
  subjects: Subject[];
  search: string;
}

type StatusFilter = "active" | "inactive" | "all";

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

const NAME_MIN = 2;

export function SubjectManager({ subjects, search }: Props) {
  const router = useRouter();
  const [term, setTerm] = useState(search);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  // Only one editing context at a time: the create form OR one row.
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [busy, setBusy] = useState(false);
  // Inline error scoped to the create form ("create") or a specific row id.
  const [error, setError] = useState<{ scope: string; msg: string } | null>(null);

  const pushSearch = (value: string): void => {
    const q = value.trim();
    router.push(q ? `/admin/subjects?search=${encodeURIComponent(q)}` : "/admin/subjects");
  };

  const openCreate = (): void => {
    setEditingId(null);
    setName("");
    setDescription("");
    setIsActive(true);
    setError(null);
    setCreating(true);
  };

  const openEdit = (s: Subject): void => {
    setCreating(false);
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description ?? "");
    setError(null);
  };

  const closeForms = (): void => {
    setCreating(false);
    setEditingId(null);
    setError(null);
  };

  const mutate = async (scope: string, fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setCreating(false);
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError({ scope, msg: e instanceof ApiError ? e.message : "Something went wrong, try again." });
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = (): Promise<void> =>
    mutate("create", () =>
      api.post("/subjects", {
        name: name.trim(),
        description: description.trim() || undefined,
        isActive,
      }),
    );

  const submitEdit = (id: string): Promise<void> =>
    mutate(id, () =>
      api.patch(`/subjects/${id}`, {
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    );

  const nameValid = name.trim().length >= NAME_MIN;

  const visible = subjects.filter((s) =>
    statusFilter === "all" ? true : statusFilter === "active" ? s.isActive : !s.isActive,
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            pushSearch(term);
          }}
          className="relative min-w-[14rem] flex-1"
        >
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search subjects…"
            aria-label="Search subjects"
            className={`${inputClass} w-full pl-9`}
          />
        </form>

        <div className="flex rounded-lg border border-border p-0.5 text-sm">
          {(["active", "inactive", "all"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={`rounded-md px-3 py-1.5 capitalize transition-colors ${
                statusFilter === f
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <Button onClick={creating ? closeForms : openCreate} variant={creating ? "outline" : "default"}>
          {creating ? (
            <>
              <X className="size-4" aria-hidden />
              Cancel
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden />
              New subject
            </>
          )}
        </Button>
      </div>

      {creating && (
        <div className="mb-4 rounded-2xl border border-border bg-card p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (nameValid && !busy) void submitCreate();
            }}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="new-subject-name" className="text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  id="new-subject-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Combined Maths"
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="new-subject-desc"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Description <span className="font-normal">(optional)</span>
                </label>
                <input
                  id="new-subject-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description"
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch id="new-subject-active" checked={isActive} onCheckedChange={setIsActive} />
              <label htmlFor="new-subject-active" className="text-sm text-muted-foreground">
                Active
              </label>
            </div>

            {error?.scope === "create" && <p className="text-xs text-destructive">{error.msg}</p>}

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!nameValid || busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Create subject"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={closeForms} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center text-sm text-muted-foreground">
          {subjects.length === 0
            ? search
              ? "No subjects match your search."
              : "No subjects yet. Create the first one."
            : `No ${statusFilter} subjects.`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((s) => {
                const editing = editingId === s.id;
                return (
                  <tr key={s.id} className="bg-card align-top">
                    <td className="px-4 py-3">
                      {editing ? (
                        <div className="space-y-2">
                          <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            aria-label="Subject name"
                            className={`${inputClass} w-full`}
                          />
                          <input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Description (optional)"
                            aria-label="Subject description"
                            className={`${inputClass} w-full`}
                          />
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-foreground">{s.name}</p>
                          {s.description && (
                            <p className="text-xs text-muted-foreground">{s.description}</p>
                          )}
                        </>
                      )}
                      {error?.scope === s.id && (
                        <p className="mt-1 text-xs text-destructive">{error.msg}</p>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          s.isActive
                            ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                            : "border-border text-muted-foreground"
                        }
                      >
                        {s.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {editing ? (
                          <>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              disabled={busy || !nameValid}
                              onClick={() => void submitEdit(s.id)}
                              aria-label="Save"
                            >
                              {busy ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                              ) : (
                                <Check className="size-4" aria-hidden />
                              )}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              disabled={busy}
                              onClick={closeForms}
                              aria-label="Cancel"
                            >
                              <X className="size-4" aria-hidden />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button asChild size="icon" variant="ghost" className="size-8">
                              <Link href={`/admin/subjects/${s.id}/teachers`} aria-label={`Assign teachers to ${s.name}`}>
                                <Users className="size-4" aria-hidden />
                              </Link>
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => openEdit(s)}
                              aria-label={`Edit ${s.name}`}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                mutate(s.id, () =>
                                  api.patch(`/subjects/${s.id}`, { isActive: !s.isActive }),
                                )
                              }
                            >
                              {s.isActive ? "Deactivate" : "Activate"}
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
