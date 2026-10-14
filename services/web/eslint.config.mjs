import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * ANIMA web ESLint flat config.
 * Extends the Next.js core-web-vitals + TypeScript presets so the build-time
 * linter and the editor agree on the same rules. `next build` runs this on
 * every compile — keep it green.
 */
const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'next-env.d.ts'],
  },
  {
    // App pages consume loosely-typed Apollo payloads (no codegen in this
    // project); allow explicit `any` annotations there only.
    files: ['app/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default eslintConfig;
