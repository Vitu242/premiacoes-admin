#!/bin/bash
# Execute este script no Console do Digital Ocean
# Copie e cole o conteúdo completo no terminal e pressione Enter

set -e
echo "=== Criando projeto Premiacoes Admin no servidor ==="

APP_DIR="/var/www/premiacoes-admin"
mkdir -p $APP_DIR
cd $APP_DIR

# 1. Criar package.json
cat > package.json << 'PKG'
{
  "name": "premiacoes-admin",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "16.1.6",
    "react": "19.2.3",
    "react-dom": "19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
PKG

# 2. Criar estrutura de pastas
mkdir -p app/login app/\(admin\)/cambistas app/\(admin\)/gerentes app/\(admin\)/saldo
mkdir -p app/\(admin\)/caixa app/\(admin\)/bilhetes app/\(admin\)/lancamentos
mkdir -p app/\(admin\)/resultados app/\(admin\)/loterias app/\(admin\)/configuracoes
mkdir -p app/components public

# 3. next.config.ts
cat > next.config.ts << 'CFG'
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
CFG

# 4. tsconfig.json (sem pathsBase - causa erro no build)
cat > tsconfig.json << 'TS'
{"compilerOptions":{"target":"ES2017","lib":["dom","dom.iterable","esnext"],"allowJs":true,"skipLibCheck":true,"strict":true,"noEmit":true,"esModuleInterop":true,"module":"esnext","moduleResolution":"bundler","resolveJsonModule":true,"isolatedModules":true,"jsx":"preserve","incremental":true,"plugins":[{"name":"next"}],"paths":{"@/*":["./*"]}},"include":["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],"exclude":["node_modules"]}
TS

# 5. postcss.config.mjs
echo 'const config = { plugins: { "@tailwindcss/postcss": {} } }; export default config;' > postcss.config.mjs

# 6. tailwind.config.ts
echo 'import type { Config } from "tailwindcss"; export default { content: ["./app/**/*.{js,ts,jsx,tsx}"] } satisfies Config;' > tailwind.config.ts

# 7. app/globals.css
cat > app/globals.css << 'CSS'
@import "tailwindcss";
:root { --background: #ffffff; --foreground: #171717; }
@theme inline { --color-background: var(--background); --color-foreground: var(--foreground); }
body { background: var(--background); color: var(--foreground); font-family: Arial, sans-serif; }
CSS

# 8. app/layout.tsx
cat > app/layout.tsx << 'LAY'
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Premiacoes Admin", description: "Sistema administrativo" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
LAY

# 9. app/login/page.tsx - Apenas para admins (clientes usam outro link)
cat > app/login/page.tsx << 'LOG'
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function LoginPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [admin, setAdmin] = useState("");
  const [senha, setSenha] = useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (codigo && admin && senha) {
      localStorage.setItem("premiacoes_admin", JSON.stringify({ codigo, admin }));
      router.push("/");
      router.refresh();
    }
  };
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-56 flex-col bg-gray-800 text-white">
        <div className="flex flex-1 flex-col justify-center p-6">
          <h2 className="text-lg font-semibold">Painel Administrativo</h2>
          <p className="mt-2 text-sm text-gray-400">Acesso restrito aos administradores</p>
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-gray-800">Entrar no painel</h1>
          <p className="mb-6 text-sm text-gray-500">Digite suas credenciais de administrador</p>
          <div className="space-y-4">
            <input type="text" placeholder="Código" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" required />
            <input type="text" placeholder="Admin" value={admin} onChange={(e) => setAdmin(e.target.value)} className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" required />
            <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full rounded border border-gray-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" required />
          </div>
          <button type="submit" className="mt-6 w-full rounded bg-orange-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-orange-600">ENTRAR</button>
        </form>
      </main>
    </div>
  );
}
LOG

# 10. app/components/Sidebar.tsx
cat > app/components/Sidebar.tsx << 'SID'
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const menuItems = [
  { href: "/", label: "Prestar Contas" }, { href: "/cambistas", label: "Cambistas" },
  { href: "/gerentes", label: "Gerentes" }, { href: "/saldo", label: "Saldo" },
  { href: "/caixa", label: "Caixa" }, { href: "/bilhetes", label: "Bilhetes" },
  { href: "/lancamentos", label: "Lançamentos" }, { href: "/resultados", label: "Resultados" },
  { href: "/loterias", label: "Loterias" }, { href: "/configuracoes", label: "Configurações" },
];
export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-56 flex-col bg-gray-800 text-white">
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {menuItems.map((item) => (
          <Link key={item.href} href={item.href} className={`rounded px-4 py-3 text-sm ${pathname === item.href ? "bg-orange-500/90" : "text-gray-300 hover:bg-gray-700"}`}>{item.label}</Link>
        ))}
      </nav>
      <button onClick={() => { localStorage.removeItem("premiacoes_admin"); window.location.href = "/login"; }} className="m-4 rounded px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-700">Sair</button>
    </aside>
  );
}
SID

# 11. app/components/AuthGuard.tsx
cat > app/components/AuthGuard.tsx << 'AUTH'
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("premiacoes_admin")) router.replace("/login");
  }, [router]);
  return <>{children}</>;
}
AUTH

# 12. app/(admin)/layout.tsx
cat > 'app/(admin)/layout.tsx' << 'ADML'
"use client";
import AuthGuard from "../components/AuthGuard";
import Sidebar from "../components/Sidebar";
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><div className="flex min-h-screen bg-gray-50"><Sidebar /><main className="flex-1 overflow-auto p-6">{children}</main></div></AuthGuard>;
}
ADML

# 13. app/(admin)/page.tsx - Prestar Contas
cat > 'app/(admin)/page.tsx' << 'PAGE'
"use client";
const dados = [
  { id: "1", nome: "Alana Santos", entrada: 895, saidas: 0, comissao: 153.26, lancamentos: -569.9, ultima: "18/02/2026, 23:33" },
  { id: "2", nome: "Carvalho Premiações", entrada: 152, saidas: 700, comissao: 25.9, lancamentos: 0, ultima: "15/02/2026, 16:37" },
  { id: "3", nome: "Aline Carvalho", entrada: 389, saidas: 300, comissao: 66.13, lancamentos: -115.74, ultima: "17/02/2026, 23:20" },
];
function fm(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function total(c: typeof dados[0]) { return c.entrada - c.saidas - c.comissao + c.lancamentos; }
export default function Page() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Prestar Contas</h1>
      <div className="mb-4 flex gap-4">
        <select className="rounded border px-4 py-2"> <option>Todos os Gerentes</option> </select>
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Prestar conta com todos</button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white shadow">
        <table className="min-w-full">
          <thead className="bg-gray-50"><tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Cambista</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Entrada</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Saídas</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Comissão</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Lançamentos</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Total</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Última Prestação</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Prestação</th>
          </tr></thead>
          <tbody className="divide-y">
            {dados.map((c) => {
              const t = total(c);
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm">{c.nome}</td>
                  <td className="px-6 py-4 text-sm">{fm(c.entrada)}</td>
                  <td className="px-6 py-4 text-sm">{fm(c.saidas)}</td>
                  <td className="px-6 py-4 text-sm">{fm(c.comissao)}</td>
                  <td className="px-6 py-4 text-sm">{fm(c.lancamentos)}</td>
                  <td className={`px-6 py-4 font-semibold ${t > 0 ? "text-green-600" : t < 0 ? "text-red-600" : ""}`}>{fm(t)}</td>
                  <td className="px-6 py-4 text-sm">{c.ultima}</td>
                  <td><button className="rounded bg-green-600 px-3 py-1.5 text-sm text-white">Prestar contas</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
PAGE

# 14. Páginas placeholder
for dir in cambistas gerentes saldo caixa bilhetes lancamentos resultados loterias configuracoes; do
  mkdir -p "app/(admin)/$dir"
  echo 'export default function Page() { return <div><h1 className="text-2xl font-bold mb-4">'"$dir"'</h1><p>Em breve.</p></div>; }' > "app/(admin)/$dir/page.tsx"
done

# 15. Instalar Node.js
if ! command -v node &> /dev/null; then
  echo "Instalando Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# 16. Build e PM2
echo "Instalando dependências..."
npm install
echo "Gerando build..."
npm run build
npm install -g pm2
pm2 delete premiacoes-admin 2>/dev/null || true
pm2 start npm --name "premiacoes-admin" -- start
pm2 save

echo ""
echo "=== PRONTO! Acesse: http://167.71.168.183:3000 ==="
echo "Se não funcionar, libere a porta: ufw allow 3000 && ufw allow 80 && ufw --force enable"
echo ""
