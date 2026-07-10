/**
 * The signature graph-paper backdrop behind the hero. Migrated off
 * styled-components to Tailwind (CSS-only hover — no client JS).
 */
export default function Grid() {
  return (
    <div className="absolute inset-x-0 top-0 flex h-[80vh] flex-wrap items-center overflow-hidden">
      {Array.from({ length: 100 }).map((_, i) => (
        <span
          key={i}
          className="aspect-square w-[8%] rounded-lg border border-border/40 bg-background transition-colors duration-100 hover:border-primary/20 hover:bg-muted/50"
        />
      ))}
    </div>
  );
}
