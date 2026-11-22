import { PanelSkeleton } from "./_components/PanelShell";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 space-y-2">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {["Cash today", "Who owes", "Marking", "Attendance today", "Setup problems", "SMS"].map((title) => (
          <PanelSkeleton key={title} title={title} />
        ))}
      </div>
    </div>
  );
}
