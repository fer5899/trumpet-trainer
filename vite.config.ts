import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `base` assumes the GitHub repository is named `trumpet-trainer`
// (Pages URL https://<user>.github.io/trumpet-trainer/). Change it if the repo name differs.
// `vite preview` runs with command 'serve' + isPreview, and must serve the build at the same base.
// The e2e-mode dev server gets its own dep cache: it runs next to the normal dev server
// (create-environment.sh), both hash to the same optimizer config, and a shared node_modules/.vite
// lets them overwrite each other's pre-bundled deps (two copies of React in the page).
export default defineConfig(({ command, mode, isPreview }) => ({
  base: command === 'build' || isPreview ? '/trumpet-trainer/' : '/',
  cacheDir: mode === 'e2e' ? 'node_modules/.vite-e2e' : undefined,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
}));
