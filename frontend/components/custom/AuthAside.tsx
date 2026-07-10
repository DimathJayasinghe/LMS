import { TextAnimate } from "@/components/ui/text-animate";

/**
 * Decorative side panel for the auth screens — the signature "grid that lights
 * up" motif from the landing page, migrated off styled-components to Tailwind
 * (see context/frontend/02-component-architecture.md §5).
 *
 * Purely presentational; hidden below `lg` so the form takes the full width on
 * mobile/tablet.
 */
interface AuthAsideProps {
  /** Optional short italic quote shown above the animated tagline. */
  quote?: string;
  /** The larger animated line. */
  tagline: string;
}

export default function AuthAside({ quote, tagline }: AuthAsideProps) {
  return (
    <aside
      aria-hidden
      className="relative hidden w-1/2 overflow-hidden bg-background lg:flex lg:flex-wrap lg:content-center"
    >
      {/* The grid texture — CSS-only hover, so no client JS and no hydration risk. */}
      <div className="pointer-events-none absolute inset-0 flex flex-wrap content-center">
        {Array.from({ length: 120 }).map((_, i) => (
          <span
            key={i}
            className="pointer-events-auto aspect-square w-[10%] border border-border/30 transition-colors duration-500 hover:bg-foreground/[0.06] hover:duration-100 motion-reduce:transition-none"
          />
        ))}
      </div>

      {/* Top & bottom fade masks. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent" />

      {/* Centered tagline with a soft radial glow behind it. */}
      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center gap-6 px-10 text-center">
        <div className="absolute inset-0 -z-10 [background:radial-gradient(ellipse_320px_220px_at_50%_50%,var(--background)_45%,transparent_80%)]" />
        {quote && (
          <p className="flex items-start gap-1 text-xl italic text-muted-foreground/70">
            <span className="text-4xl leading-none opacity-20">&ldquo;</span>
            {quote}
            <span className="self-end text-4xl leading-none opacity-20">&rdquo;</span>
          </p>
        )}
        <TextAnimate
          animation="blurInUp"
          by="word"
          once
          className="text-3xl font-medium leading-tight text-foreground"
        >
          {tagline}
        </TextAnimate>
      </div>
    </aside>
  );
}
