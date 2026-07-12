import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Nav from "@/components/custom/Nav";
import Footer from "@/components/custom/Footer";
import Grid from "@/app/home/_components/Grid";
import FadeIn from "@/app/home/_components/FadeIn";
import Magnetic from "@/app/home/_components/Magnetic";

export const metadata = { title: "Page not found · LMS" };

export default function NotFound() {
  return (
    <>
      <main className="relative flex min-h-screen flex-col overflow-hidden">
        <Grid />
        <Nav />

        <FadeIn className="relative z-50 m-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">404</p>
          <h1 className="mt-4 text-4xl font-medium text-foreground sm:text-5xl">Page not found</h1>
          <p className="mt-4 text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
          </p>
          <Magnetic>
            <Link
              href="/home"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-foreground px-8 py-4 text-background transition hover:opacity-90"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to home
            </Link>
          </Magnetic>
        </FadeIn>
      </main>

      <Footer />
    </>
  );
}
