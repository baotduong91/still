import type { Metadata, Viewport } from "next";
import { Provider } from "@/components/provider";
import { Shell } from "@/components/shell";
import "./globals.css";
export const metadata: Metadata = {
  title: "Still · A little closer, every day",
  description:
    "A quiet place for Scripture, prayer, and your next faithful step.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Still" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f7f1",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Provider>
          <Shell>{children}</Shell>
        </Provider>
      </body>
    </html>
  );
}
