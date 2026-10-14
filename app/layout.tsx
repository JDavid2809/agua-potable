import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "sileo/styles.css";
import { Toaster } from "sileo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Control de Agua Potable",
  description: "Sistema de control de pagos de agua potable comunitaria",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900">
        <Toaster
          position="top-right"
          options={{
            styles: {
              title: "!text-black !font-medium !opacity-100",
              description: "!text-black !font-normal !opacity-100",
              button: "!text-black !font-medium",
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
