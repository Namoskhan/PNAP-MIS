// Re-export the useBranding hook so importers can `from '../hooks/useBranding'`
// matching the convention of useAuth, useUnit, etc. Keeps consumer
// imports flat and discoverable.
export { useBranding } from '../context/BrandingContext';
