import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const FACES = [
  { src: "https://github.com/shadcn.png", fallback: "AB" },
  { src: "https://github.com/shadcn.png", fallback: "CD" },
  { src: "https://github.com/shadcn.png", fallback: "EF" },
];

/**
 * Small social-proof cluster shown above the hero headline — overlapping
 * student avatars followed by a headline count. Design-token only so it holds
 * up in dark mode.
 */
export default function StudentReviews() {
  return (
    <div className="relative z-50 mx-auto mt-16 flex justify-center sm:mt-24">
      <div className="flex items-center">
        <div className="flex">
          {FACES.map((face, i) => (
            <Avatar
              key={i}
              className="size-10 border-2 border-background [&:not(:first-child)]:-ml-3"
            >
              <AvatarImage src={face.src} alt="" className="grayscale" />
              <AvatarFallback>{face.fallback}</AvatarFallback>
            </Avatar>
          ))}
        </div>

        <p className="ml-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">1,200+</span> students
        </p>
      </div>
    </div>
  );
}
