import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Em client components do Next 16 é padrão (e correto) hidratar estado a
      // partir do localStorage/auth dentro de useEffect — não há SSR de dados
      // do usuário. A regra é mantida como aviso para destacar o padrão sem
      // bloquear builds/CI.
      "react-hooks/set-state-in-effect": "warn",
      // Avisos do React Compiler que não indicam bug em runtime; mantemos
      // apenas como sugestão de otimização.
      "react-hooks/preserve-manual-memoization": "warn",
      // Permite variáveis/argumentos intencionalmente não usados quando
      // prefixados com "_". Útil para destructuring com descarte.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
