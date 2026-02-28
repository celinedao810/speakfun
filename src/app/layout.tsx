import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { AppProvider } from "@/context/AppContext";
import Layout from "@/components/Layout";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const sourceSerif4 = Source_Serif_4({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "SpeakFun - English Pronunciation Coach",
  description: "AI-Powered English Pronunciation Coaching App",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f59e0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} ${sourceSerif4.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(sw=>sw.unregister()))}`,
            }}
          />
        )}
        <AuthProvider>
          <Layout>
            <AppProvider>
              {children}
            </AppProvider>
          </Layout>
        </AuthProvider>
      </body>
    </html>
  );
}
