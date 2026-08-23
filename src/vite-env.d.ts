/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USD_TO_ZAR_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
