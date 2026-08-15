/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Display name of the in-app AI waiter (drives the "X RECOMMENDS" header). */
  readonly VITE_ASSISTANT_NAME?: string;
  // Build-time overrides that let this same client be rebuilt once more for
  // the public "Demo Steakhouse" tenant (see Sites/Demo/) without touching
  // Trump's own default build. All optional; unset = Trump's current values.
  readonly VITE_BASE_PATH?: string;
  readonly VITE_RESTAURANT_ID?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_TAGLINE?: string;
  readonly VITE_QR_BASE?: string;
  readonly VITE_MAINS_CATEGORY_TITLE?: string;
  readonly VITE_PASTAS_CATEGORY_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
