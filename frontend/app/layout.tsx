import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/hooks/useAuth";

export const metadata: Metadata = {
  title: "LMS",
  description: "A simple learning management system built with Next.js and Tailwind CSS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
