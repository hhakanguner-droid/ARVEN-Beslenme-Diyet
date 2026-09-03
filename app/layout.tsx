import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/RegisterServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARVEN Beslenme & Diyet",
  description: "Kişiselleştirilmiş beslenme planlama, takip ve ARVEN AI desteği.",
  applicationName: "ARVEN Beslenme & Diyet",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#075a3c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
