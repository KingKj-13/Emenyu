import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App';
import { BASE_PATH, RESTAURANT_ID } from './constants/api';

// Tenant-scoped theming (see ARCHITECTURE_DECISIONS.md AD-004): a tenant's own
// stylesheet (e.g. carmella-theme.css) is written entirely under
// `[data-tenant="..."]` so it can never leak onto — or be leaked onto by —
// Trump's default :root tokens. Static per build (RESTAURANT_ID is a
// VITE_RESTAURANT_ID build-time constant), so this is set once, here, not in
// a component. Day-part mode (data-theme) is set separately in AppContext
// once the config fetch resolves.
document.documentElement.dataset.tenant = RESTAURANT_ID;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={BASE_PATH}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
