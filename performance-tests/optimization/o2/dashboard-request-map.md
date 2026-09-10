# Phase O2 — Dashboard Request Map

## 1. Executive Summary

When the primary PNAP-MIS Executive Dashboard (`CommandCenter`) is accessed by an authorized executive persona (such as `SUPER_ADMIN` or approved Central Cabinet officer), the client generates **16 HTTP requests** across **13 unique endpoints**, containing **3 duplicate requests**.

Of these:
- **3 requests** belong to application shell initialization (`unread-count`, `branding`, `auth/me`).
- **4 requests** target `/api/org/provinces` (a **4x duplicate** caused by independent component fetches in `UnitContext`, `AnalyticsFilters`, and `UnitReportDownloads`).
- **9 requests** represent dedicated analytics sections (Acts 1 through 7 of the Command Center).

---

## 2. Comprehensive Dashboard Request Inventory

| # | Method | Endpoint | Source Component / Hook | Trigger Timing | Purpose | Auth Required | Scope Parameters | Payload Size | Backend Controller | Backend Service / Helper | DB Ops | Blocking | Duplicate? | Data Overlap |
| :- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `GET` | `/api/notifications/unread-count` | `NotificationBell` | Shell mount | Unread notification count badge | Yes | User ID (`req.user._id`) | 35 B | `notificationController.getUnreadCount` | `Notification.countDocuments` | 2 | No | No | None |
| **2** | `GET` | `/api/public/branding` | `BrandingContext` | Shell mount | App title, logo, themes | No | Global | 1,883 B | `publicBrandingController.getBranding` | `SystemSettings.findOne` | 1 | No | No | None |
| **3** | `GET` | `/api/auth/me` | `AuthContext` (`refreshMe`) | Shell mount | Refresh active session permissions & flags | Yes | User ID (`req.user._id`) | 2,229 B | `authController.getMe` | `User.findById` | 2 | No | No | None |
| **4** | `GET` | `/api/org/provinces` | `UnitContext` (L54) | User load | Hydrate territorial context | Yes | Active status | 776 B | `orgController.getProvinces` | `Province.find` | 2 | No | **Primary** | Overlaps #5, #6, #7 |
| **5** | `GET` | `/api/org/provinces` | `UnitContext` (L52) | User update | Redundant re-trigger on user object change | Yes | Active status | 776 B | `orgController.getProvinces` | `Province.find` | 2 | No | **YES (Dup #4)** | 100% duplicate of #4 |
| **6** | `GET` | `/api/org/provinces` | `AnalyticsFilters` (L36) | Filter bar mount | Populate filter dropdown | Yes | Active status | 776 B | `orgController.getProvinces` | `Province.find` | 2 | No | **YES (Dup #4)** | 100% duplicate of #4 |
| **7** | `GET` | `/api/org/provinces` | `UnitReportDownloads` (L85) | Act 6 mount | Populate export cascading dropdown | Yes | Active status | 776 B | `orgController.getProvinces` | `Province.find` | 2 | No | **YES (Dup #4)** | 100% duplicate of #4 |
| **8** | `GET` | `/api/dashboard/summary?days=365` | `CommandCenter` (L133) | Act 1 mount | National headline counts (members & units) | Yes | `days=365`, territorial | 696 B | `dashboardController.executiveSummary` | `analyticsService.summary` | 16 | Skeleton | No | High-level summary of Acts 3, 4, 5, 6 |
| **9** | `GET` | `/api/dashboard/scope?days=365` | `CommandCenter` (L134) | Masthead mount | Breadcrumb trail of current unit scope | Yes | `days=365`, territorial | 128 B | `dashboardController.scope` | `analyticsService.scopePath` | 1 | No | No | None |
| **10** | `GET` | `/api/dashboard/org-breakdown?days=365` | `CommandCenter` (L135) | Act 2 mount | Province/tier comparison cards | Yes | `days=365`, territorial | 1,648 B | `dashboardController.orgBreakdown` | `analyticsService.orgBreakdown` | 11 | Skeleton | No | Sub-unit active metrics |
| **11** | `GET` | `/api/dashboard/membership?days=365` | `MembershipAnalytics` | Act 3 mount | Registration 12m trend & tier distribution | Yes | `days=365`, territorial | 9,670 B | `dashboardController.membership` | `analyticsService.membershipAnalytics` | 12 | Skeleton | No | Member counts by tier |
| **12** | `GET` | `/api/dashboard/campaigns?days=365` | `CampaignsAnalytics` | Act 4 mount | Campaign progress, 12m trend & reach | Yes | `days=365`, territorial | 1,510 B | `dashboardController.campaigns` | `analyticsService.campaignsAnalytics` | 13 | Skeleton | No | Campaign activity stats |
| **13** | `GET` | `/api/dashboard/meetings?days=365&yearBasis=CALENDAR&years=5` | `MeetingsAnalytics` | Act 5 mount | Meeting planned vs held, 5yr matrix, trend | Yes | `days=365`, `years=5` | 5,376 B | `dashboardController.meetings` | `analyticsService.meetingsAnalytics` | 6 | Skeleton | No | Meeting execution stats |
| **14** | `GET` | `/api/dashboard/reports?days=365` | `ReportsAnalytics` | Act 6 mount | Report filing rate & unit ranking | Yes | `days=365`, territorial | 316 B | `dashboardController.reports` | `analyticsService.reportsAnalytics` | 12 | Skeleton | No | Meeting filing status |
| **15** | `GET` | `/api/dashboard/inactive-units?days=365&level=BASIC_UNIT&page=1&limit=10` | `InactiveUnitsTable` | Act 7 mount | Dormant basic units & responsible officers | Yes | `days=365`, `page=1`, `limit=10` | 874 B | `dashboardController.inactiveUnits` | `analyticsService.inactiveUnits` | 9 | Skeleton | No | Dormant units list |
| **16** | `GET` | `/api/dashboard/inactive-members?days=365&page=1&limit=10` | `InactiveMembersTable` | Act 7 mount | Inactive member roster & contacts | Yes | `days=365`, `page=1`, `limit=10` | 2,917 B | `dashboardController.inactiveMembers` | `analyticsService.inactiveMembers` | 7 | Skeleton | No | Dormant members list |

---

## 3. Analysis of Request Patterns & Overhead

### 3.1 Duplicate Requests
- `/api/org/provinces` is executed **four times** concurrently upon dashboard mount.
- Root Cause:
  1. `UnitContext.jsx`: Line 54 fetches provinces on mount.
  2. `UnitContext.jsx`: Dependency on `user` re-executes the effect when `user` identity changes following `auth/me` resolution.
  3. `AnalyticsFilters.jsx`: Line 36 initiates its own fetch on mount, bypassing the existing `UnitContext`.
  4. `UnitReportDownloads.jsx`: Line 85 initiates its own fetch on mount, bypassing the existing `UnitContext`.
- Solution: `AnalyticsFilters` and `UnitReportDownloads` can consume `provinces` from `useUnit()`, and `UnitContext` can guard against re-fetching when `provinces` are already loaded.

### 3.2 Backend Query Overhead
- Three distinct endpoints (`membership`, `campaigns`, and `reports`) invoke `orgSnapshot(f)`.
- `orgSnapshot(f)` executes 4 separate aggregations across `RoleAssignment` and `Member` (`officeBearerActivity` for BASIC_UNIT, AREA, DISTRICT, PROVINCE).
- None of these three endpoints utilize the office bearer activity results; they solely require unit names and IDs (`_id`, `name`, `code`).
- Consequently, **12 costly database queries** (4 per endpoint) are executed unnecessarily during cold evaluation.
