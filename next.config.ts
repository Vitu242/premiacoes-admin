import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content Security Policy.
 * - Permitimos 'unsafe-inline' e 'unsafe-eval' em dev (Next/HMR).
 * - Em produção, mantemos 'unsafe-inline' por ora porque o app usa hidratação
 *   Next 16 (alguns inline necessários). Recomendado endurecer com nonces
 *   em uma próxima onda.
 */
function buildCsp(supabaseUrl: string | undefined): string {
  const supabaseHost = (() => {
    try {
      return supabaseUrl ? new URL(supabaseUrl).host : "*.supabase.co";
    } catch {
      return "*.supabase.co";
    }
  })();

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "connect-src": [
      "'self'",
      `https://${supabaseHost}`,
      `wss://${supabaseHost}`,
      ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : []),
    ],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "form-action": ["'self'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'", "blob:"],
  };

  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: buildCsp(supabaseUrl),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(), bluetooth=(self), usb=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // HTML/páginas: NUNCA cachear no navegador, para que após cada deploy o
      // bundle JS novo seja carregado de imediato. Os assets de /_next/static
      // já têm hash no nome e podem ser cacheados (Next gerencia).
      {
        source: "/((?!_next/static|_next/image|icons/).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
