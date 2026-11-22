import type { PossibleDuplicate } from "@/lib/registration";

/** Shown once when the server found students who look the same; the clerk goes ahead only with a reason. */
export function DuplicateWarning({ matches }: { matches: PossibleDuplicate[] }) {
  return (
    <div role="alert" className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">This looks like a student who is already registered.</p>
      <ul className="list-disc pl-5">
        {matches.map((match) => <li key={match.id}>{match.name} (#{match.indexNumber})</li>)}
      </ul>
      <p className="text-muted-foreground">Check their card first. If this is a different person, say why and register anyway.</p>
      <label className="block">Reason for registering anyway
        <input name="duplicateOverrideReason" required minLength={3} maxLength={300} autoComplete="off" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
      </label>
    </div>
  );
}
