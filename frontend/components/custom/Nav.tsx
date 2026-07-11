import Link from "next/link";

const LINKS = [
  { href: "/home", label: "Home" },
  { href: "/about", label: "About us" },
  { href: "/courses", label: "Courses" },
  { href: "/teachers", label: "Teachers" },
  { href: "/contact", label: "Contact us" },
];

export default function Nav() {
  return (
    <nav className="relative z-50 mx-4 mb-8 mt-8 flex w-auto min-w-fit max-w-[50rem] items-center justify-between rounded-full border border-foreground bg-background p-1.5 sm:mx-auto sm:mt-14 sm:w-full">
      <Link
        href="/home"
        aria-label="Home"
        className="flex size-12 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background"
      >
        L
      </Link>

      <ul className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/auth/login"
        className="flex items-center self-stretch rounded-full bg-foreground px-8 text-sm text-background transition hover:opacity-90"
      >
        Login
      </Link>
    </nav>
  );
}
