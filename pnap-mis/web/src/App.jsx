import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { DialogHost } from './components/dialog';
import { BrandingProvider } from './context/BrandingContext';
import CommandPalette from './components/CommandPalette';
import MemberRegisterModal from './components/MemberRegisterModal';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import ResendVerificationPage from './pages/auth/ResendVerificationPage';
import DashboardPage from './pages/DashboardPage';
import MemberListPage from './pages/MemberListPage';
import MemberDetailPage from './pages/MemberDetailPage';
import PendingApprovalPage from './pages/PendingApprovalPage';
import UnitDashboardPage from './pages/unit/UnitDashboardPage';
import CabinetPage from './pages/unit/CabinetPage';
import MeetingsPage from './pages/unit/MeetingsPage';
import ActivitiesPage from './pages/unit/ActivitiesPage';
import FinancePage from './pages/unit/FinancePage';
import BreakdownPage from './pages/unit/BreakdownPage';
import CommitteePage from './pages/unit/CommitteePage';
import JirgaPage from './pages/unit/JirgaPage';
import UnitProposalsPage from './pages/admin/UnitProposalsPage';
import TransfersPage from './pages/unit/TransfersPage';
import NationalPage from './pages/central/NationalPage';
import ResponsibilitiesPage from './pages/unit/ResponsibilitiesPage';
import PerformancePage from './pages/unit/PerformancePage';
import PendingRoleApprovalsPage from './pages/unit/PendingRoleApprovalsPage';
import ReportsPage from './pages/unit/ReportsPage';
import ManageProvincesPage from './pages/admin/ManageProvincesPage';
import ManageOrgPage from './pages/admin/ManageOrgPage';
import GlobalPendingApprovalsPage from './pages/admin/GlobalPendingApprovalsPage';
import UsersPage from './pages/admin/UsersPage';
import AuditLogPage from './pages/admin/AuditLogPage';
import FinanceOverviewPage from './pages/admin/FinanceOverviewPage';
import RolesPage from './pages/admin/RolesPage';
import RolePermissionsPage from './pages/admin/RolePermissionsPage';
import MeetingTypesPage from './pages/admin/events/MeetingTypesPage';
import ActivityTypesPage from './pages/admin/events/ActivityTypesPage';
import EventTypeEditorPage from './pages/admin/events/EventTypeEditorPage';
import FieldLibraryPage from './pages/admin/events/FieldLibraryPage';
import UnitManagementLandingPage from './pages/admin/units/UnitManagementLandingPage';
import UnitTierConfigsPage from './pages/admin/units/UnitTierConfigsPage';
import CabinetTemplatesPage from './pages/admin/units/CabinetTemplatesPage';
import UnitPoliciesPage from './pages/admin/units/UnitPoliciesPage';
import WorkflowsPage from './pages/admin/units/WorkflowsPage';
import ResponsibilityTemplatesPage from './pages/admin/units/ResponsibilityTemplatesPage';
import PerformanceRuleSetsPage from './pages/admin/units/PerformanceRuleSetsPage';
import ReportTemplatesPage from './pages/admin/units/ReportTemplatesPage';
import SettingsLandingPage from './pages/admin/settings/SettingsLandingPage';
import SystemIdentityPage from './pages/admin/settings/SystemIdentityPage';
import LoginCustomizationPage from './pages/admin/settings/LoginCustomizationPage';
import LogoManagerPage from './pages/admin/settings/LogoManagerPage';
import ThemeManagerPage from './pages/admin/settings/ThemeManagerPage';
import TypographyPage from './pages/admin/settings/TypographyPage';
import DashboardAppearancePage from './pages/admin/settings/DashboardAppearancePage';
import ReportBrandingPage from './pages/admin/settings/ReportBrandingPage';
import SettingsHistoryPage from './pages/admin/settings/SettingsHistoryPage';
import NotificationsPage from './pages/NotificationsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';

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
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onRequestRegisterMember={() => setRegisterOpen(true)}
      />
      <MemberRegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSuccess={() => {}}
      />
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
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Account recovery. These MUST sit outside ProtectedRoute —
              someone following a reset link has no session by
              definition, and the catch-all redirect below lives inside
              the guard, so an unguarded route registered there would
              bounce every one of these visitors to /login and discard
              the token. */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
          <Route path="/verify-email/:token" element={<VerifyEmailPage />} />
          <Route path="/resend-verification" element={<ResendVerificationPage />} />
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
            <Route path="/" element={<DashboardPage />} />
            <Route path="/members" element={<MemberListPage />} />
            <Route path="/members/new" element={<Navigate to="/members" replace />} />
            <Route path="/members/pending" element={<PendingApprovalPage />} />
            <Route path="/members/:id" element={<MemberDetailPage />} />
            <Route path="/unit" element={<UnitDashboardPage />} />
            <Route path="/unit/cabinet" element={<CabinetPage />} />
            <Route path="/unit/meetings" element={<MeetingsPage />} />
            <Route path="/unit/activities" element={<ActivitiesPage />} />
            <Route path="/unit/finance" element={<FinancePage />} />
            <Route path="/unit/breakdown" element={<BreakdownPage />} />
            <Route path="/unit/committee" element={<CommitteePage />} />
            <Route path="/unit/jirga" element={<JirgaPage />} />
            <Route path="/admin/unit-proposals" element={<UnitProposalsPage />} />
            <Route path="/unit/transfers" element={<TransfersPage />} />
            <Route path="/unit/responsibilities" element={<ResponsibilitiesPage />} />
            <Route path="/unit/performance" element={<PerformancePage />} />
            <Route path="/unit/role-approvals" element={<PendingRoleApprovalsPage />} />
            <Route path="/unit/reports" element={<ReportsPage />} />
            <Route path="/admin/provinces" element={<ManageProvincesPage />} />
            <Route path="/admin/manage-org" element={<ManageOrgPage />} />
            <Route path="/admin/pending-approvals" element={<GlobalPendingApprovalsPage />} />
            <Route path="/admin/users" element={<UsersPage />} />
            <Route path="/admin/audit" element={<AuditLogPage />} />
            <Route path="/admin/finance-overview" element={<FinanceOverviewPage />} />
            <Route path="/admin/roles" element={<RolesPage />} />
            <Route path="/admin/roles/:id/permissions" element={<RolePermissionsPage />} />
            <Route path="/admin/events/meeting-types" element={<MeetingTypesPage />} />
            <Route path="/admin/events/activity-types" element={<ActivityTypesPage />} />
            <Route path="/admin/events/types/:id" element={<EventTypeEditorPage />} />
            <Route path="/admin/events/fields" element={<FieldLibraryPage />} />
            <Route path="/admin/units" element={<UnitManagementLandingPage />} />
            <Route path="/admin/units/tier-configs" element={<UnitTierConfigsPage />} />
            <Route path="/admin/units/cabinet-templates" element={<CabinetTemplatesPage />} />
            <Route path="/admin/units/policies" element={<UnitPoliciesPage />} />
            <Route path="/admin/units/workflows" element={<WorkflowsPage />} />
            <Route path="/admin/units/responsibility-templates" element={<ResponsibilityTemplatesPage />} />
            <Route path="/admin/units/performance-rulesets" element={<PerformanceRuleSetsPage />} />
            <Route path="/admin/units/report-templates" element={<ReportTemplatesPage />} />
            <Route path="/admin/settings" element={<SettingsLandingPage />} />
            <Route path="/admin/settings/identity" element={<SystemIdentityPage />} />
            <Route path="/admin/settings/login" element={<LoginCustomizationPage />} />
            <Route path="/admin/settings/logos" element={<LogoManagerPage />} />
            <Route path="/admin/settings/theme" element={<ThemeManagerPage />} />
            <Route path="/admin/settings/typography" element={<TypographyPage />} />
            <Route path="/admin/settings/dashboard" element={<DashboardAppearancePage />} />
            <Route path="/admin/settings/reports" element={<ReportBrandingPage />} />
            <Route path="/admin/settings/history" element={<SettingsHistoryPage />} />
            <Route path="/national" element={<NationalPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
      </BrandingProvider>
    </ErrorBoundary>
  );
}
