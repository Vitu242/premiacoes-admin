import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SupabaseSyncProvider } from "./SupabaseSyncProvider";
import { SupabaseStatus } from "./components/SupabaseStatus";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import { UpdateChecker } from "./components/UpdateChecker";
import { ThemeProvider } from "./components/ThemeProvider";
import { BrandingProvider } from "./components/BrandingProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Premiações Admin",
    template: "%s · Premiações Admin",
  },
  description:
    "Painel administrativo e app cliente para gestão de banca, bilhetes, cambistas, resultados e prêmios.",
  applicationName: "Premiações Admin",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Premiações",
    statusBarStyle: "default",
    startupImage: ["/icons/icon-512.png"],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192" }],
  },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f97316" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/*
          Captura cedo o evento `beforeinstallprompt` do Chrome.
          Esse evento dispara só UMA vez quando a página carrega — se o
          componente que mostra o botão "Instalar" só montar depois disso, o
          evento se perde. Aqui salvamos no window para o InstallAppButton
          poder usá-lo a qualquer momento, em qualquer rota (inclusive na
          tela de login do cliente).
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  window.__deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    window.__deferredInstallPrompt = e;
    try { window.dispatchEvent(new CustomEvent('pwa-install-available')); } catch(_){}
  });
  window.addEventListener('appinstalled', function(){
    window.__deferredInstallPrompt = null;
    try { window.dispatchEvent(new CustomEvent('pwa-installed')); } catch(_){}
  });
})();`.trim(),
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <BrandingProvider>
            <SupabaseSyncProvider>
              {children}
              <SupabaseStatus />
              <ServiceWorkerRegister />
              <UpdateChecker />
            </SupabaseSyncProvider>
          </BrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
