import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist', '.impeccable', '.cache', 'test-results', 'src/lib/api/generated']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // shadcn primitives and context modules export variants/hooks next to components by design.
    files: ['src/components/ui/**/*.tsx', 'src/contexts/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // coss ui files are vendored unchanged (docs/reference/template-reference.md); they predate the
    // React Compiler rules, so only those rules are relaxed here.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
])
