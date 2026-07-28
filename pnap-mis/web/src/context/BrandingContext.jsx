import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { fetchPublicBranding } from '../api/branding';
import { applyTheme, applyTypography } from '../utils/applyCssVars';
import { swapFavicon } from '../utils/swapFavicon';

// PKNAP_DEFAULT — code-side baseline. The provider initializes
// state with this so the first paint renders correctly even before
// the public branding fetch returns. Matches the server's
// themePresets.PKNAP_DEFAULT shape exactly.
const DEFAULT_STATE = {
  loading: true,
  error: null,
  identity: {
    systemName: 'PNAP-MIS',
    shortName: 'PKNAP',
    organizationName: 'PKNAP',
    loginTitle: 'Welcome to PKNAP',
    browserTabTitle: 'PNAP-MIS',
    metaDescription: 'Hierarchical organization management for PKNAP.',
    copyrightText: '© PKNAP',
    footerText: '© PKNAP. All rights reserved.',
  },
  logos: {},
  loginPage: {
    backgroundUrl: '',
    heroText: '',
    welcomeMessage: 'Sign in to continue',
    slogan: '',
    cardStyle: 'SOLID',
  },
  theme: {
    activeMode: 'LIGHT',
    light: null,
    dark: null,
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    headingFontFamily: 'Inter, system-ui, sans-serif',
    baseFontSize: 14,
    headingScale: 1.2,
    borderRadius: 8,
    spacingScale: 1.0,
  },
  dashboard: {
    enableAnimations: true,
    enableCountUpKpis: true,
    chartStyle: 'MODERN',
    compactMode: false,
    glassmorphism: false,
    sidebarDefaultCollapsed: false,
  },
};

// applyDashboardAttrs — projects the dashboard preferences onto
// :root as data-* attributes so CSS can react via selectors like
// `[data-compact="true"] .row { ... }`. Mutates document directly so
// rules apply uniformly regardless of which React subtree mounts.
function applyDashboardAttrs(d) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-compact', d?.compactMode ? 'true' : 'false');
  root.setAttribute('data-glass', d?.glassmorphism ? 'true' : 'false');
  root.setAttribute('data-animations', d?.enableAnimations !== false ? 'true' : 'false');
  root.setAttribute('data-chart-style', d?.chartStyle || 'MODERN');
}

const BrandingContext = createContext({ ...DEFAULT_STATE, refresh: () => {} });

// useBranding — read the current branding state. Components consume
// identity strings (systemName, footerText), logo URLs, login-page
// customizations, etc. Theme tokens are typically NOT read here —
// CSS reads them directly via `var(--primary)` etc., applied to
// :root by this provider on every refresh.
export function useBranding() {
  return useContext(BrandingContext);
}

export function BrandingProvider({ children }) {
  const [state, setState] = useState(DEFAULT_STATE);

  const load = useCallback(async () => {
    try {
      const data = await fetchPublicBranding();
      if (!data) return;

      // Update React state — components consuming useBranding rerender.
      setState({
        loading: false,
        error: null,
        identity: data.identity || DEFAULT_STATE.identity,
        logos: data.logos || {},
        loginPage: data.loginPage || DEFAULT_STATE.loginPage,
        theme: data.theme || DEFAULT_STATE.theme,
        typography: data.typography || DEFAULT_STATE.typography,
        dashboard: data.dashboard || DEFAULT_STATE.dashboard,
      });

      // Apply the visual side-effects: CSS variables on :root,
      // <title>, favicon. These run outside React's rendering tree
      // because they target document.* directly.
      if (data.theme) applyTheme(data.theme);
      if (data.typography) applyTypography(data.typography);
      applyDashboardAttrs(data.dashboard || DEFAULT_STATE.dashboard);
      if (data.identity?.browserTabTitle) {
        document.title = data.identity.browserTabTitle;
      }
      if (data.logos?.favicon?.url) {
        swapFavicon(data.logos.favicon.url);
      }
    } catch (e) {
      // Soft-fail: keep the defaults rather than blanking the UI.
      // Admins see the failure via the Settings landing page; end
      // users see the fallback theme — never a broken page.
      setState((s) => ({
        ...s,
        loading: false,
        error: e?.message || 'Failed to load branding',
      }));
    }
  }, []);

  // Initial load on mount.
  useEffect(() => {
    // Apply defaults right away so :root attributes are set before
    // the public-branding fetch returns.
    applyDashboardAttrs(DEFAULT_STATE.dashboard);
    load();
  }, [load]);

  // Refetch on tab focus (parity with AuthContext.refreshMe pattern)
  // so admin edits in another tab propagate to this one without a
  // hard reload.
  useEffect(() => {
    function onFocus() { load(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  // Live-update document.title even when state changes due to a
  // refresh — covers the case where admin renames the system.
  useEffect(() => {
    if (state.identity?.browserTabTitle && !state.loading) {
      document.title = state.identity.browserTabTitle;
    }
  }, [state.identity?.browserTabTitle, state.loading]);

  return (
    <BrandingContext.Provider value={{ ...state, refresh: load }}>
      {children}
    </BrandingContext.Provider>
  );
}

export default BrandingContext;
