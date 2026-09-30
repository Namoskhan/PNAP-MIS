import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { DialogHost } from './components/dialog';
import { BrandingProvider } from './context/BrandingContext';
import { SkeletonCard } from './components/Skeleton';

const CommandPalette = lazy(() => import('./components/CommandPalette'));
const MemberRegisterModal = lazy(() => import('./components/MemberRegisterModal'));

// Keep LoginPage eager for immediate, zero-delay authentication screen
import LoginPage from './pages/LoginPage';

// Auth recovery pages - code split
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const ResendVerificationPage = lazy(() => import('./pages/auth/ResendVerificationPage'));

// Core application pages - code split
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MemberListPage = lazy(() => import('./pages/MemberListPage'));
const MemberDetailPage = lazy(() => import('./pages/MemberDetailPage'));
const PendingApprovalPage = lazy(() => import('./pages/PendingApprovalPage'));
const UnitDashboardPage = lazy(() => import('./pages/unit/UnitDashboardPage'));
const CabinetPage = lazy(() => import('./pages/unit/CabinetPage'));
const MeetingsPage = lazy(() => import('./pages/unit/MeetingsPage'));
const ActivitiesPage = lazy(() => import('./pages/unit/ActivitiesPage'));
const FinancePage = lazy(() => import('./pages/unit/FinancePage'));
const BreakdownPage = lazy(() => import('./pages/unit/BreakdownPage'));
const CommitteePage = lazy(() => import('./pages/unit/CommitteePage'));
const JirgaPage = lazy(() => import('./pages/unit/JirgaPage'));
const CongressPage = lazy(() => import('./pages/unit/CongressPage'));
const UnitProposalsPage = lazy(() => import('./pages/admin/UnitProposalsPage'));
const TransfersPage = lazy(() => import('./pages/unit/TransfersPage'));
const NationalPage = lazy(() => import('./pages/central/NationalPage'));
const ResponsibilitiesPage = lazy(() => import('./pages/unit/ResponsibilitiesPage'));
const PerformancePage = lazy(() => import('./pages/unit/PerformancePage'));
const PendingRoleApprovalsPage = lazy(() => import('./pages/unit/PendingRoleApprovalsPage'));
const ReportsPage = lazy(() => import('./pages/unit/ReportsPage'));

// Admin pages - code split
const ManageProvincesPage = lazy(() => import('./pages/admin/ManageProvincesPage'));
const ManageOrgPage = lazy(() => import('./pages/admin/ManageOrgPage'));
const GlobalPendingApprovalsPage = lazy(() => import('./pages/admin/GlobalPendingApprovalsPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'));
const FinanceOverviewPage = lazy(() => import('./pages/admin/FinanceOverviewPage'));
const RolesPage = lazy(() => import('./pages/admin/RolesPage'));
const RolePermissionsPage = lazy(() => import('./pages/admin/RolePermissionsPage'));
const MeetingTypesPage = lazy(() => import('./pages/admin/events/MeetingTypesPage'));
const ActivityTypesPage = lazy(() => import('./pages/admin/events/ActivityTypesPage'));
const EventTypeEditorPage = lazy(() => import('./pages/admin/events/EventTypeEditorPage'));
const FieldLibraryPage = lazy(() => import('./pages/admin/events/FieldLibraryPage'));
const UnitManagementLandingPage = lazy(() => import('./pages/admin/units/UnitManagementLandingPage'));
const UnitTierConfigsPage = lazy(() => import('./pages/admin/units/UnitTierConfigsPage'));
const CabinetTemplatesPage = lazy(() => import('./pages/admin/units/CabinetTemplatesPage'));
const UnitPoliciesPage = lazy(() => import('./pages/admin/units/UnitPoliciesPage'));
const WorkflowsPage = lazy(() => import('./pages/admin/units/WorkflowsPage'));
const ResponsibilityTemplatesPage = lazy(() => import('./pages/admin/units/ResponsibilityTemplatesPage'));
const PerformanceRuleSetsPage = lazy(() => import('./pages/admin/units/PerformanceRuleSetsPage'));
const ReportTemplatesPage = lazy(() => import('./pages/admin/units/ReportTemplatesPage'));
const SettingsLandingPage = lazy(() => import('./pages/admin/settings/SettingsLandingPage'));
const SystemIdentityPage = lazy(() => import('./pages/admin/settings/SystemIdentityPage'));
const LoginCustomizationPage = lazy(() => import('./pages/admin/settings/LoginCustomizationPage'));
const LogoManagerPage = lazy(() => import('./pages/admin/settings/LogoManagerPage'));
const ThemeManagerPage = lazy(() => import('./pages/admin/settings/ThemeManagerPage'));
const TypographyPage = lazy(() => import('./pages/admin/settings/TypographyPage'));
const DashboardAppearancePage = lazy(() => import('./pages/admin/settings/DashboardAppearancePage'));
const ReportBrandingPage = lazy(() => import('./pages/admin/settings/ReportBrandingPage'));
const SettingsHistoryPage = lazy(() => import('./pages/admin/settings/SettingsHistoryPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));

function PageFallback() {
  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <SkeletonCard lines={5} />
    </div>
  );
}

function GlobalShortcuts() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  useEffect(() => {
    function onKey(e) {
      const isPaletteShortcut = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
      if (isPaletteShortcut) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            open={paletteOpen}
            onClose={() => setPaletteOpen(false)}
            onRequestRegisterMember={() => setRegisterOpen(true)}
          />
        </Suspense>
      )}
      {registerOpen && (
        <Suspense fallback={null}>
          <MemberRegisterModal
            open={registerOpen}
            onClose={() => setRegisterOpen(false)}
            onSuccess={() => { }}
          />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrandingProvider>
        <ToastProvider>
          {/* One host for every dialog.confirm/prompt/alert in the app. */}
          <DialogHost />
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              {/* Account recovery. These MUST sit outside ProtectedRoute —
                someone following a reset link has no session by
                definition, and the catch-all redirect below lives inside
                the guard, so an unguarded route registered there would
                bounce every one of these visitors to /login and discard
                the token. */}
              <Route path="/forgot-password" element={<Suspense fallback={<PageFallback />}><ForgotPasswordPage /></Suspense>} />
              <Route path="/reset-password/:token" element={<Suspense fallback={<PageFallback />}><ResetPasswordPage /></Suspense>} />
              <Route path="/verify-email/:token" element={<Suspense fallback={<PageFallback />}><VerifyEmailPage /></Suspense>} />
              <Route path="/resend-verification" element={<Suspense fallback={<PageFallback />}><ResendVerificationPage /></Suspense>} />
              <Route
                element={
                  <ProtectedRoute>
                    <>
                      <Layout />
                      <GlobalShortcuts />
                    </>
                  </ProtectedRoute>
                }
              >
                <Route path="/" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
                <Route path="/members" element={<Suspense fallback={<PageFallback />}><MemberListPage /></Suspense>} />
                <Route path="/members/new" element={<Navigate to="/members" replace />} />
                <Route path="/members/pending" element={<Suspense fallback={<PageFallback />}><PendingApprovalPage /></Suspense>} />
                <Route path="/members/:id" element={<Suspense fallback={<PageFallback />}><MemberDetailPage /></Suspense>} />
                <Route path="/unit" element={<Suspense fallback={<PageFallback />}><UnitDashboardPage /></Suspense>} />
                <Route path="/unit/cabinet" element={<Suspense fallback={<PageFallback />}><CabinetPage /></Suspense>} />
                <Route path="/unit/meetings" element={<Suspense fallback={<PageFallback />}><MeetingsPage /></Suspense>} />
                <Route path="/unit/activities" element={<Suspense fallback={<PageFallback />}><ActivitiesPage /></Suspense>} />
                <Route path="/unit/finance" element={<Suspense fallback={<PageFallback />}><FinancePage /></Suspense>} />
                <Route path="/unit/breakdown" element={<Suspense fallback={<PageFallback />}><BreakdownPage /></Suspense>} />
                <Route path="/unit/committee" element={<Suspense fallback={<PageFallback />}><CommitteePage /></Suspense>} />
                <Route path="/unit/jirga" element={<Suspense fallback={<PageFallback />}><JirgaPage /></Suspense>} />
                <Route path="/unit/congress" element={<Suspense fallback={<PageFallback />}><CongressPage /></Suspense>} />
                <Route path="/admin/unit-proposals" element={<Suspense fallback={<PageFallback />}><UnitProposalsPage /></Suspense>} />
                <Route path="/unit/transfers" element={<Suspense fallback={<PageFallback />}><TransfersPage /></Suspense>} />
                <Route path="/unit/responsibilities" element={<Suspense fallback={<PageFallback />}><ResponsibilitiesPage /></Suspense>} />
                <Route path="/unit/performance" element={<Suspense fallback={<PageFallback />}><PerformancePage /></Suspense>} />
                <Route path="/unit/role-approvals" element={<Suspense fallback={<PageFallback />}><PendingRoleApprovalsPage /></Suspense>} />
                <Route path="/unit/reports" element={<Suspense fallback={<PageFallback />}><ReportsPage /></Suspense>} />
                <Route path="/admin/provinces" element={<Suspense fallback={<PageFallback />}><ManageProvincesPage /></Suspense>} />
                <Route path="/admin/manage-org" element={<Suspense fallback={<PageFallback />}><ManageOrgPage /></Suspense>} />
                <Route path="/admin/pending-approvals" element={<Suspense fallback={<PageFallback />}><GlobalPendingApprovalsPage /></Suspense>} />
                <Route path="/admin/users" element={<Suspense fallback={<PageFallback />}><UsersPage /></Suspense>} />
                <Route path="/admin/audit" element={<Suspense fallback={<PageFallback />}><AuditLogPage /></Suspense>} />
                <Route path="/admin/finance-overview" element={<Suspense fallback={<PageFallback />}><FinanceOverviewPage /></Suspense>} />
                <Route path="/admin/roles" element={<Suspense fallback={<PageFallback />}><RolesPage /></Suspense>} />
                <Route path="/admin/roles/:id/permissions" element={<Suspense fallback={<PageFallback />}><RolePermissionsPage /></Suspense>} />
                <Route path="/admin/events/meeting-types" element={<Suspense fallback={<PageFallback />}><MeetingTypesPage /></Suspense>} />
                <Route path="/admin/events/activity-types" element={<Suspense fallback={<PageFallback />}><ActivityTypesPage /></Suspense>} />
                <Route path="/admin/events/types/:id" element={<Suspense fallback={<PageFallback />}><EventTypeEditorPage /></Suspense>} />
                <Route path="/admin/events/fields" element={<Suspense fallback={<PageFallback />}><FieldLibraryPage /></Suspense>} />
                <Route path="/admin/units" element={<Suspense fallback={<PageFallback />}><UnitManagementLandingPage /></Suspense>} />
                <Route path="/admin/units/tier-configs" element={<Suspense fallback={<PageFallback />}><UnitTierConfigsPage /></Suspense>} />
                <Route path="/admin/units/cabinet-templates" element={<Suspense fallback={<PageFallback />}><CabinetTemplatesPage /></Suspense>} />
                <Route path="/admin/units/policies" element={<Suspense fallback={<PageFallback />}><UnitPoliciesPage /></Suspense>} />
                <Route path="/admin/units/workflows" element={<Suspense fallback={<PageFallback />}><WorkflowsPage /></Suspense>} />
                <Route path="/admin/units/responsibility-templates" element={<Suspense fallback={<PageFallback />}><ResponsibilityTemplatesPage /></Suspense>} />
                <Route path="/admin/units/performance-rulesets" element={<Suspense fallback={<PageFallback />}><PerformanceRuleSetsPage /></Suspense>} />
                <Route path="/admin/units/report-templates" element={<Suspense fallback={<PageFallback />}><ReportTemplatesPage /></Suspense>} />
                <Route path="/admin/settings" element={<Suspense fallback={<PageFallback />}><SettingsLandingPage /></Suspense>} />
                <Route path="/admin/settings/identity" element={<Suspense fallback={<PageFallback />}><SystemIdentityPage /></Suspense>} />
                <Route path="/admin/settings/login" element={<Suspense fallback={<PageFallback />}><LoginCustomizationPage /></Suspense>} />
                <Route path="/admin/settings/logos" element={<Suspense fallback={<PageFallback />}><LogoManagerPage /></Suspense>} />
                <Route path="/admin/settings/theme" element={<Suspense fallback={<PageFallback />}><ThemeManagerPage /></Suspense>} />
                <Route path="/admin/settings/typography" element={<Suspense fallback={<PageFallback />}><TypographyPage /></Suspense>} />
                <Route path="/admin/settings/dashboard" element={<Suspense fallback={<PageFallback />}><DashboardAppearancePage /></Suspense>} />
                <Route path="/admin/settings/reports" element={<Suspense fallback={<PageFallback />}><ReportBrandingPage /></Suspense>} />
                <Route path="/admin/settings/history" element={<Suspense fallback={<PageFallback />}><SettingsHistoryPage /></Suspense>} />
                <Route path="/national" element={<Suspense fallback={<PageFallback />}><NationalPage /></Suspense>} />
                <Route path="/notifications" element={<Suspense fallback={<PageFallback />}><NotificationsPage /></Suspense>} />
                <Route path="/announcements" element={<Suspense fallback={<PageFallback />}><AnnouncementsPage /></Suspense>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </ToastProvider>
      </BrandingProvider>
    </ErrorBoundary>
  );
}
