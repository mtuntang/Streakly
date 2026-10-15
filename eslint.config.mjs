import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  // Architecture boundary: the web app is an HTTP-only client.
  // All database access lives in apps/api (the sole Prisma owner).
  files: ["src/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@prisma/client", "@prisma/client/*"],
            message: "Database access is owned by apps/api. The web app must use HTTP APIs only.",
          },
        ],
      },
    ],
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;