import GridBackdrop from "@/components/custom/GridBackdrop";

/**
 * The graph-paper backdrop behind the hero. See `GridBackdrop` for the
 * pattern/spotlight implementation — this just sizes and positions it.
 *
 * `-z-10` is load-bearing, not decoration: any sibling that gets a CSS
 * `transform` (from framer-motion or otherwise) is promoted into its own
 * stacking context and paints *above* plain static-positioned content
 * regardless of DOM order. Without a hard negative z-index here, this grid
 * — which itself always carries a transform for the parallax — could end up
 * stacking on top of the hero text instead of behind it.
 */
export default function Grid() {
  return (
    <div className="absolute inset-x-0 top-0 -z-10 h-[80vh] overflow-hidden">
      <GridBackdrop parallax />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
