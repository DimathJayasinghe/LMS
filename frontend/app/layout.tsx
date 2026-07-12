import type { Metadata } from "next";
import { Poppins } from 'next/font/google';
import "./globals.css";
import { AuthProvider } from "@/lib/hooks/useAuth";


// app/layout.tsx

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '700'], // Specify the weights you need
  variable: '--font-poppins', // Optional: for Tailwind CSS
});
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
    <html
      lang="en"
      className={`${poppins.variable} h-full antialiased`}
    >
      <body className={`min-h-full flex flex-col ${poppins.className}`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
