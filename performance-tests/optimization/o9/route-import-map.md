# Phase O9 — Route Import Map (Baseline)

## Overview
All routes in `pnap-mis/web/src/App.jsx` are currently **eagerly imported** at the top of the file. No dynamic `import()` or `React.lazy()` is currently utilized anywhere in routing.

## Route Inventory & Loading Characteristics

| Route Path | Component File | Current Import Type | Source Size (Bytes) | Included in Entry Bundle? |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `pages/LoginPage.jsx` | **Eager** | 12,658 | Yes |
| `/forgot-password` | `pages/auth/ForgotPasswordPage.jsx` | **Eager** | 4,210 | Yes |
| `/reset-password/:token` | `pages/auth/ResetPasswordPage.jsx` | **Eager** | 5,120 | Yes |
| `/verify-email/:token` | `pages/auth/VerifyEmailPage.jsx` | **Eager** | 3,840 | Yes |
| `/resend-verification` | `pages/auth/ResendVerificationPage.jsx` | **Eager** | 4,110 | Yes |
| `/` (Dashboard) | `pages/DashboardPage.jsx` | **Eager** | 8,125 | Yes |
| `/members` | `pages/MemberListPage.jsx` | **Eager** | 21,800 | Yes |
| `/members/pending` | `pages/PendingApprovalPage.jsx` | **Eager** | 11,400 | Yes |
| `/members/:id` | `pages/MemberDetailPage.jsx` | **Eager** | 18,900 | Yes |
| `/unit` | `pages/unit/UnitDashboardPage.jsx` | **Eager** | 48,620 | Yes |
| `/unit/cabinet` | `pages/unit/CabinetPage.jsx` | **Eager** | 35,929 | Yes |
| `/unit/meetings` | `pages/unit/MeetingsPage.jsx` | **Eager** | 78,963 | Yes |
| `/unit/activities` | `pages/unit/ActivitiesPage.jsx` | **Eager** | 22,443 | Yes |
| `/unit/finance` | `pages/unit/FinancePage.jsx` | **Eager** | 46,708 | Yes |
| `/unit/breakdown` | `pages/unit/BreakdownPage.jsx` | **Eager** | 15,200 | Yes |
| `/unit/committee` | `pages/unit/CommitteePage.jsx` | **Eager** | 18,300 | Yes |
| `/unit/jirga` | `pages/unit/JirgaPage.jsx` | **Eager** | 34,793 | Yes |
| `/unit/congress` | `pages/unit/CongressPage.jsx` | **Eager** | 36,946 | Yes |
| `/unit/transfers` | `pages/unit/TransfersPage.jsx` | **Eager** | 26,491 | Yes |
| `/unit/responsibilities` | `pages/unit/ResponsibilitiesPage.jsx` | **Eager** | 14,800 | Yes |
| `/unit/performance` | `pages/unit/PerformancePage.jsx` | **Eager** | 19,200 | Yes |
| `/unit/role-approvals` | `pages/unit/PendingRoleApprovalsPage.jsx` | **Eager** | 12,100 | Yes |
| `/unit/reports` | `pages/unit/ReportsPage.jsx` | **Eager** | 26,274 | Yes |
| `/admin/unit-proposals` | `pages/admin/UnitProposalsPage.jsx` | **Eager** | 16,500 | Yes |
| `/admin/provinces` | `pages/admin/ManageProvincesPage.jsx` | **Eager** | 14,300 | Yes |
| `/admin/manage-org` | `pages/admin/ManageOrgPage.jsx` | **Eager** | 22,938 | Yes |
| `/admin/pending-approvals` | `pages/admin/GlobalPendingApprovalsPage.jsx` | **Eager** | 13,800 | Yes |
| `/admin/users` | `pages/admin/UsersPage.jsx` | **Eager** | 34,474 | Yes |
| `/admin/audit` | `pages/admin/AuditLogPage.jsx` | **Eager** | 11,200 | Yes |
| `/admin/finance-overview` | `pages/admin/FinanceOverviewPage.jsx` | **Eager** | 17,600 | Yes |
| `/admin/roles` | `pages/admin/RolesPage.jsx` | **Eager** | 14,500 | Yes |
| `/admin/roles/:id/permissions`| `pages/admin/RolePermissionsPage.jsx` | **Eager** | 19,800 | Yes |
| `/admin/events/meeting-types` | `pages/admin/events/MeetingTypesPage.jsx` | **Eager** | 15,200 | Yes |
| `/admin/events/activity-types`| `pages/admin/events/ActivityTypesPage.jsx` | **Eager** | 14,900 | Yes |
| `/admin/events/types/:id` | `pages/admin/events/EventTypeEditorPage.jsx` | **Eager** | 23,853 | Yes |
| `/admin/events/fields` | `pages/admin/events/FieldLibraryPage.jsx` | **Eager** | 12,400 | Yes |
| `/admin/units` | `pages/admin/units/UnitManagementLandingPage.jsx` | **Eager** | 16,800 | Yes |
| `/admin/units/tier-configs` | `pages/admin/units/UnitTierConfigsPage.jsx` | **Eager** | 18,200 | Yes |
| `/admin/units/cabinet-templates`| `pages/admin/units/CabinetTemplatesPage.jsx` | **Eager** | 19,500 | Yes |
| `/admin/units/policies` | `pages/admin/units/UnitPoliciesPage.jsx` | **Eager** | 22,434 | Yes |
| `/admin/units/workflows` | `pages/admin/units/WorkflowsPage.jsx` | **Eager** | 17,300 | Yes |
| `/admin/units/responsibility-templates`| `pages/admin/units/ResponsibilityTemplatesPage.jsx`| **Eager** | 15,600 | Yes |
| `/admin/units/performance-rulesets`| `pages/admin/units/PerformanceRuleSetsPage.jsx` | **Eager** | 24,085 | Yes |
| `/admin/units/report-templates`| `pages/admin/units/ReportTemplatesPage.jsx` | **Eager** | 27,940 | Yes |
| `/admin/settings` | `pages/admin/settings/SettingsLandingPage.jsx` | **Eager** | 11,200 | Yes |
| `/admin/settings/identity` | `pages/admin/settings/SystemIdentityPage.jsx` | **Eager** | 14,500 | Yes |
| `/admin/settings/login` | `pages/admin/settings/LoginCustomizationPage.jsx` | **Eager** | 18,300 | Yes |
| `/admin/settings/logos` | `pages/admin/settings/LogoManagerPage.jsx` | **Eager** | 16,700 | Yes |
| `/admin/settings/theme` | `pages/admin/settings/ThemeManagerPage.jsx` | **Eager** | 26,203 | Yes |
| `/admin/settings/typography` | `pages/admin/settings/TypographyPage.jsx` | **Eager** | 12,400 | Yes |
| `/admin/settings/dashboard` | `pages/admin/settings/DashboardAppearancePage.jsx`| **Eager** | 17,900 | Yes |
| `/admin/settings/reports` | `pages/admin/settings/ReportBrandingPage.jsx` | **Eager** | 13,800 | Yes |
| `/admin/settings/history` | `pages/admin/settings/SettingsHistoryPage.jsx` | **Eager** | 11,900 | Yes |
| `/national` | `pages/central/NationalPage.jsx` | **Eager** | 15,200 | Yes |
| `/notifications` | `pages/NotificationsPage.jsx` | **Eager** | 12,100 | Yes |
| `/announcements` | `pages/AnnouncementsPage.jsx` | **Eager** | 14,600 | Yes |

## Impact
A visitor arriving at `/login` downloads and compiles all 56 routes, including heavy unit operational workflows (`MeetingsPage` 79 KB, `FinancePage` 47 KB), all admin management systems, and report template builders.
