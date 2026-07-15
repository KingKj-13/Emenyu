/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string;
  readonly VITE_RESTAURANT_ID?: string;
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_QR_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
