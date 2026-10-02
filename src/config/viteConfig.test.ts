// @vitest-environment node
import type { ConfigEnv, UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import viteConfig from '../../vite.config';

function resolveConfig(env: ConfigEnv): UserConfig {
  if (typeof viteConfig !== 'function') throw new Error('vite.config.ts must export a config function');
  return viteConfig(env) as UserConfig;
}

function resolveBase(env: ConfigEnv): string | undefined {
  return resolveConfig(env).base;
}

describe('vite.config base', () => {
  it.each<[string, ConfigEnv, string]>([
    ['dev server', { command: 'serve', mode: 'development' }, '/'],
    ['e2e dev server', { command: 'serve', mode: 'e2e' }, '/'],
    ['production build', { command: 'build', mode: 'production' }, '/trumpet-trainer/'],
    ['production preview', { command: 'serve', mode: 'production', isPreview: true }, '/trumpet-trainer/'],
  ])('%s', (_label, env, expected) => {
    expect(resolveBase(env)).toBe(expected);
  });
});

// The dev server and the e2e-mode dev server run side by side (create-environment.sh). Vite hashes
// both to the same optimizer config, so a shared cacheDir lets them overwrite each other's
// pre-bundled deps and the page can load two copies of React.
describe('vite.config cacheDir', () => {
  it.each<[string, ConfigEnv, string | undefined]>([
    ['dev server', { command: 'serve', mode: 'development' }, undefined],
    ['e2e dev server', { command: 'serve', mode: 'e2e' }, 'node_modules/.vite-e2e'],
    ['production build', { command: 'build', mode: 'production' }, undefined],
  ])('%s', (_label, env, expected) => {
    expect(resolveConfig(env).cacheDir).toBe(expected);
  });
});
