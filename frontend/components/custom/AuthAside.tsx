import { TextAnimate } from "@/components/ui/text-animate";
import GridBackdrop from "@/components/custom/GridBackdrop";

/**
 * Decorative side panel for the auth screens — shares the landing page's
 * "grid that reacts to you" motif via `GridBackdrop` (see that file for why
 * it isn't 100+ individual hover-tracked boxes anymore).
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
      className="relative hidden w-1/2 overflow-hidden bg-background lg:flex lg:items-center lg:justify-center"
    >
      <GridBackdrop />

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
