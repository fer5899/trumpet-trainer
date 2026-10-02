/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'true' only in the e2e dev build (`.env.e2e`); enables the `?melody=` test hook. */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
