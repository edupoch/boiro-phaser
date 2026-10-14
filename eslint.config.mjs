// Configuración plana de ESLint 9 (sustituye a .eslintrc.cjs, que ESLint 9 ya no lee).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'public', 'e2e/screenshots'] },
    {
        files: ['src/**/*.{ts,tsx}'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            // Un `_` delante marca un parámetro que se recibe pero no se usa a propósito.
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    // Scripts de Node: export de sprites, pruebas de navegador, configuración de Vite y log.js.
    {
        files: ['**/*.{js,mjs,cjs}'],
        extends: [js.configs.recommended],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node,
        },
    },
    // Las pruebas de navegador pasan funciones a page.evaluate, que se ejecutan en la página.
    {
        files: ['e2e/**/*.mjs'],
        languageOptions: {
            globals: { ...globals.node, ...globals.browser },
        },
    },
);
