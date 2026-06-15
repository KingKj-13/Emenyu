/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Display name of the in-app AI waiter (drives the "X RECOMMENDS" header). */
  readonly VITE_ASSISTANT_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
