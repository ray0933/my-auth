# Order/Invoice Tracking System (訂單發票追蹤系統)
## Phase 1 — Requirements · Data Model · API · Authorization Design

**Version:** 1.0 (as-built) | **Date:** August 2026
**Branch:** `feature/order-invoice-tracking` | **Builds on:** `auth-system-spec.md` / `auth-impl.md`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope](#2-scope)
3. [External ERP Integration](#3-external-erp-integration)
4. [Data Model](#4-data-model)
5. [Roles & Permissions](#5-roles--permissions)
6. [Authorization Architecture](#6-authorization-architecture)
7. [API Specification](#7-api-specification)
8. [Business Rules](#8-business-rules)
9. [Frontend Specification](#9-frontend-specification)
10. [Testing Strategy](#10-testing-strategy)
11. [Known Deviations from the Original Plan](#11-known-deviations-from-the-original-plan)
12. [Phase 2 Candidates (Out of Scope)](#12-phase-2-candidates-out-of-scope)

---

## 1. Executive Summary

Phase 1 adds an order/invoice tracking module on top of the existing `my-auth` RBAC system (Node/TypeScript/Express/Prisma/SQL Server backend, React/shadcn frontend). It lets accounting staff turn an ERP order number into a locally-tracked **`OrderTracking`** record, break its untaxed amount into a manual month-by-month **`InvoicePlan`**, and record the **`Invoice`**s actually issued against those plan lines — with role- and row-level access control for four operational roles (`sales_rep`, `accounting`, `accounting_supervisor`, `supervisor`) layered on top of the pre-existing `admin`/`super_admin`/`user`.

Customer and order master data live entirely in an external ERP system this app does not own; this system never writes to it and treats it as a read-only lookup at record-creation time.

## 2. Scope

**In scope (Phase 1):**
- `OrderTracking` — local tracking master, keyed by ERP order number, holding a point-in-time ERP snapshot plus local `orderType`/`notes`
- `InvoicePlan` — manual, per-order, per-month breakdown of the untaxed amount to be invoiced
- `Invoice` — record of an invoice actually issued against one `InvoicePlan` line (1:1), with void and permanent-delete paths
- Four new roles with distinct read/write scopes (§5)
- Row-level scoping (a `sales_rep` sees only their own orders) and field-level write restriction (`sales_rep`/`supervisor` may only ever touch `InvoicePlan.notes`/`estimatedCompletionDate`)

**Out of scope (deferred to Phase 2, see §12):** payment/receipt tracking, AR aging, PDF generation, email notifications, multi-currency, splitting one invoice across multiple plan lines.

## 3. External ERP Integration

Customer/order master data is owned by an external ERP system sharing the same SQL Server instance, exposed to this app as a **read-only VIEW**:

```
dbo.vw_ERP_OrderSnapshot(
  orderNumber, orderDate, customerShortName, endUser, projectName,
  salesRepCode, salesRepName, orderAmountUntaxed, estimatedCostUntaxed
)
```

Accessed exclusively through `src/repositories/erpOrder.repository.ts#findOrderSnapshotByNumber(orderNumber)`, a parameterized `prisma.$queryRaw` query. This is the **only** place ERP data enters the system — it fires at `OrderTracking` creation and at explicit "sync" time; `InvoicePlan`/`Invoice` never query the ERP directly, they join through `OrderTracking`.

This VIEW is not Prisma-managed (no migration, no FK) — in dev, it's backed by a hand-seeded stand-in table `dbo.tmp_ERP_Orders` (see `order-invoice-tracking-impl.md` §Dev Data). In tests, `erpOrder.repository` is `vi.mock`ed so nothing depends on a live ERP connection.

## 4. Data Model

Three new Prisma models plus one new field on `User`. Full source of truth: `prisma/schema.prisma`.

### 4.1 `User.employeeCode` (new field)

```prisma
employeeCode String? @unique
```

Matches an ERP `salesRepCode`. Set manually by an admin/accounting_supervisor when provisioning a `sales_rep` account; it is the row-level scoping key (§6). SQL Server needs a filtered unique index (`WHERE employeeCode IS NOT NULL`) since a plain `UNIQUE` constraint rejects more than one `NULL`.

### 4.2 `OrderTracking`

```prisma
model OrderTracking {
  id                   String    @id @default(uuid())
  orderNumber          String    @unique          // ERP order number, user-entered
  orderType            String                     // general | maintenance | installment — local, user-selected
  orderDate            DateTime?                  // ERP snapshot
  customerShortName    String?                    // ERP snapshot
  endUser              String?                    // ERP snapshot
  projectName          String?                    // ERP snapshot
  salesRepCode         String?                    // ERP snapshot — row-scoping key
  salesRepName         String?                    // ERP snapshot
  orderAmountUntaxed   Decimal?  @db.Decimal(18,2) // ERP snapshot
  estimatedCostUntaxed Decimal?  @db.Decimal(18,2) // ERP snapshot
  snapshotAt           DateTime?                  // when the ERP fields above were last (re)fetched
  notes                String?                    // local
  createdById          String?
  createdByUser        User?     @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  invoicePlans InvoicePlan[]
  invoices     Invoice[]

  @@index([orderType])
  @@index([salesRepCode])
}
```

Snapshot fields are read-only day-to-day; only a `POST /:id/sync` call re-fetches and overwrites them. `orderType`/`notes` are always editable via `PATCH`. No delete endpoint exists (Phase 1 decision — financial data hangs off this record).

### 4.3 `InvoicePlan`

```prisma
model InvoicePlan {
  id                          String        @id @default(uuid())
  orderTrackingId             String
  orderTracking               OrderTracking @relation(fields: [orderTrackingId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  plannedMonth                DateTime      // normalized to the 1st of the month
  plannedMonthStr              String        // ROC year-month, e.g. "115-07" (ROC year = AD year − 1911)
  estimatedCompletionDate     DateTime      // normalized to the 1st of the month, same rule as plannedMonth
  estimatedCompletionMonthStr String        // same ROC formatting
  plannedAmount               Decimal       @db.Decimal(18,2) // untaxed
  status                      String        @default("pending") // pending | invoiced | cancelled
  invoiceId                   String?
  invoice                     Invoice?      @relation(fields: [invoiceId], references: [id], onDelete: SetNull, onUpdate: NoAction)
  notes                       String?
  createdById                 String?
  createdByUser               User?         @relation(fields: [createdById], references: [id], onDelete: SetNull)
  createdAt                   DateTime      @default(now())
  updatedAt                   DateTime      @updatedAt

  @@index([orderTrackingId])
  @@index([plannedMonth])
  @@index([estimatedCompletionDate])
  @@index([status])
}
```

`plannedMonthStr`/`estimatedCompletionMonthStr` are always server-derived from `plannedMonth`/`estimatedCompletionDate` via `src/utils/rocDate.ts#toRocMonthStr()` — never accepted directly from the client, to guarantee they can't drift out of sync. Stored (not computed on read) so lists/filters can sort/filter on the ROC string directly.

### 4.4 `Invoice`

```prisma
model Invoice {
  id              String        @id @default(uuid())
  invoiceNumber   String        @unique   // manually entered, not auto-sequenced (see §11)
  orderTrackingId String
  orderTracking   OrderTracking @relation(fields: [orderTrackingId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  invoiceDate     DateTime      @default(now())  // manually entered at issuance
  amount          Decimal       @db.Decimal(18,2) // untaxed, copied from the plan line
  taxAmount       Decimal       @db.Decimal(18,2) // 5% of amount, server-computed
  totalAmount     Decimal       @db.Decimal(18,2) // amount + taxAmount
  status          String        @default("issued") // issued | void
  voidedAt        DateTime?
  voidReason      String?
  notes           String?
  issuedById      String?
  issuedByUser    User?         @relation(fields: [issuedById], references: [id], onDelete: NoAction, onUpdate: NoAction)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  plans InvoicePlan[]

  @@index([orderTrackingId])
  @@index([status])
}
```

`InvoicePlan → Invoice` is many-to-one in the schema (`InvoicePlan.invoiceId`), but Phase 1's service logic only ever attaches exactly **one** plan line per invoice (§8.3) — the shape is intentionally left open so "merge several plan lines into one invoice" is a Phase 2 service-layer change, not a migration.

**Delete strategy:** `OrderTracking → InvoicePlan`/`Invoice` use `onDelete: NoAction` (no delete endpoint exists for `OrderTracking`, and SQL Server rejects multiple cascade paths anyway — same pattern already used for `User`'s self-relations). `InvoicePlan.invoiceId → Invoice` uses `onDelete: SetNull` — voiding or hard-deleting an invoice must not cascade-delete the plan line, only detach it back to `pending`. `createdById`/`issuedById → User` use `SetNull`/`NoAction` (deleting a user must not corrupt financial history).

### 4.5 Remaining Uninvoiced Amount

Not a stored column — computed on every `OrderTracking` read:

```
remainingUninvoicedAmount = orderAmountUntaxed − Σ(plannedAmount of that order's InvoicePlan rows where status = 'invoiced')
```

(`src/services/orderTracking.service.ts#toDto`, backed by `invoicePlanRepo.sumInvoicedPlannedAmount`.)

### 4.6 Currency

Single fixed currency; no `currency` column anywhere. All money fields are `Decimal(18,2)`, serialized to `string` in every DTO (Prisma `Decimal` doesn't survive JSON serialization as a number safely).

---

## 5. Roles & Permissions

Four roles layered on top of the pre-existing `super_admin`/`admin`/`user`:

| Role | Description | OrderTracking | InvoicePlan | Invoice |
|---|---|---|---|---|
| `sales_rep` | 業務 — read-only, own orders only | read (own only) | read (own only) + write `notes`/`estimatedCompletionDate` only | read (own only) |
| `accounting` | 會計 — full invoice lifecycle, read-only elsewhere | read (all) | read (all) | full CRUD incl. void + **hard delete** |
| `accounting_supervisor` | 會計主管 — full control of everything | full CRUD | full CRUD | full CRUD incl. void + delete |
| `supervisor` | 主管 — global oversight, narrow edit | read (all) | read (all) + write `notes`/`estimatedCompletionDate` only, **any** row | read (all) |
| `admin` / `super_admin` | unchanged pre-existing roles | full CRUD (same as `accounting_supervisor`) | full CRUD | full CRUD |
| `user` | unchanged | none | none | none |

`sales_rep` and `supervisor` share the exact same *field-level* restriction on `InvoicePlan` (only `notes`/`estimatedCompletionDate`, never `plannedMonth`/`plannedAmount`, and `estimatedCompletionDate` still locks once the line is `invoiced`) — the only difference is `sales_rep` is additionally **row**-scoped to their own `salesRepCode` while `supervisor` sees every row.

### 5.1 Permissions table

The following permissions exist in `Permission`/`RolePermission` (seeded by `prisma/seed.ts`), matching the project's existing `resource:action` naming convention:

```
order_tracking:create   order_tracking:read   order_tracking:read_own   order_tracking:write
invoice_plans:create    invoice_plans:read    invoice_plans:read_own    invoice_plans:write
invoice_plans:write_own_notes   invoice_plans:write_limited   invoice_plans:delete
invoices:create   invoices:read   invoices:read_own   invoices:void   invoices:delete
```

> **⚠️ Design note — these permissions are recorded, not enforced.** Unlike the pre-existing `users:*`/`roles:*` permissions (checked via `requirePermission()`), no order/invoice route calls `requirePermission()`. Every route uses the coarser `requireRole(...)` gate, and the actual row-level/field-level enforcement lives in hand-written service-layer logic (`src/utils/scopeContext.ts` + per-service branching — see §6). The permission rows exist for consistency with the RBAC data model and for future use (e.g. if a `requirePermission`-based check is added later), but changing `RolePermission` grants today has **no runtime effect** on this module — the roles/scopes below are hardcoded by name.

### 5.2 Role → permission grants (as seeded)

```ts
sales_rep:              ['order_tracking:read_own', 'invoice_plans:read_own',
                          'invoice_plans:write_own_notes', 'invoices:read_own']

accounting:              ['order_tracking:read', 'invoice_plans:read',
                          'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete']

accounting_supervisor:   ['order_tracking:create', 'order_tracking:read', 'order_tracking:write',
                          'invoice_plans:create', 'invoice_plans:read', 'invoice_plans:write', 'invoice_plans:delete',
                          'invoices:create', 'invoices:read', 'invoices:void', 'invoices:delete']

supervisor:              ['order_tracking:read', 'invoice_plans:read',
                          'invoice_plans:write_limited', 'invoices:read']

admin / super_admin:     same 11 grants as accounting_supervisor (order_tracking:create/read/write,
                          invoice_plans:create/read/write/delete, invoices:create/read/void/delete)
```

---

## 6. Authorization Architecture

Two mechanisms, applied in sequence for every request:

**1. Route-level role gate (`requireRole(...)`)** — coarse "can this role even call this endpoint" check, unchanged pattern from the pre-existing auth system. See §7 for the exact role list per route.

The role arrays passed to `requireRole(...)` originally lived as separate local `const`s in each of the three route files (`orderTracking.routes.ts`, `invoicePlan.routes.ts`, `invoice.routes.ts`) — three copies of essentially the same two role sets under different local names (`READ_ROLES`/`READ_WRITE_ROLES`/`FULL_WRITE_ROLES`/`MANAGE_ROLES`). Commit `298c326` consolidated these into `src/utils/roles.ts`:

```ts
export const ORDER_TRACKING_READ_ROLES = ['sales_rep', 'accounting', 'supervisor', 'accounting_supervisor', 'admin', 'super_admin'];
export const ORDER_TRACKING_FULL_WRITE_ROLES = ['accounting_supervisor', 'admin', 'super_admin'];
export const INVOICE_MANAGE_ROLES = ['accounting', 'accounting_supervisor', 'admin', 'super_admin'];
```

Each route file imports these with `as` aliases matching its original local names, so the `requireRole(...)` call sites themselves are unchanged. The names/values are deliberately mirrored in `frontend/src/lib/roles.ts` (§9) — the two files are separately maintained (no shared module across the two projects), and this backend copy is the authoritative one for enforcement; the frontend copy only controls UI show/hide.

**2. Service-level row/field scoping** — new for this module, since this is the first feature needing anything finer than "can vs. can't call the endpoint." Centralized in `src/utils/scopeContext.ts`:

```ts
const UNSCOPED_ROLES = ['accounting', 'accounting_supervisor', 'admin', 'super_admin'];
const FULL_WRITE_ROLES = ['accounting_supervisor', 'admin', 'super_admin'];

// true only when the caller has sales_rep and none of the "sees everything" roles
export function isScopedToOwnRecords(roles: string[]): boolean {
  return roles.includes('sales_rep') && !roles.some((r) => UNSCOPED_ROLES.includes(r));
}

// true for roles that may fully edit OrderTracking/InvoicePlan (not just read or notes-only)
export function hasFullWriteAccess(roles: string[]): boolean {
  return roles.some((r) => FULL_WRITE_ROLES.includes(r));
}
```

Key property: `isScopedToOwnRecords` only ever returns `true` for `sales_rep`. `supervisor` never includes `sales_rep`, so every existing **read** path (`listX`/`getXById`) is automatically unscoped for `supervisor` with **zero code changes** — only the route-level `requireRole` allowlist needed the new role name added. This is why `supervisor` could be added later (commit `a8082b2`) without touching any read function.

**List queries** (`listOrderTrackings`/`listInvoicePlans`/`listInvoices`) call `isScopedToOwnRecords(caller.roles)` and, if true, pass `caller.employeeCode` (falling back to the literal string `'__none__'` if unset, so a `sales_rep` with no `employeeCode` sees nothing rather than everything) down to the repository as a `WHERE salesRepCode = ...` filter.

**Single-record reads** (`getXById`) apply the same scoping and return **404** (not 403) when a scoped caller requests a record outside their scope — deliberately avoids confirming the record's existence to someone who can't see it.

**`InvoicePlan.updateInvoicePlan` — the four-way branch** (the module's most complex authorization logic, `src/services/invoicePlan.service.ts`):

```ts
if (isScopedToOwnRecords(caller.roles)) {
  // sales_rep: must own the row (salesRepCode match, else 404) AND
  // submit only notes/estimatedCompletionDate (else 403)
} else if (hasFullWriteAccess(caller.roles)) {
  // accounting_supervisor/admin/super_admin: any row, any field
} else if (caller.roles.includes('supervisor')) {
  // supervisor: any row, but only notes/estimatedCompletionDate (else 403)
} else {
  // e.g. accounting: no invoice_plans:write* grant at all → always 403
}
// then, regardless of branch: touching plannedMonth/plannedAmount/estimatedCompletionDate
// on a non-pending line → 409 INVOICE_PLAN_NOT_PENDING
```

`LOCKED_ONCE_INVOICED_FIELDS = ['plannedMonth', 'plannedAmount', 'estimatedCompletionDate']` — locked for *everyone*, even `accounting_supervisor`/`admin`, once `status !== 'pending'` (once an invoice exists against a plan line, its timing/amount can't keep moving — void + reissue is the correction path). `LIMITED_EDITABLE_FIELDS = ['notes', 'estimatedCompletionDate']` — the entire field universe `sales_rep`/`supervisor` may ever submit.

---

## 7. API Specification

Base path `/api/v1`. Every route requires `requireAuth` + `requirePasswordChanged()` (pre-existing middleware, unchanged pattern).

### OrderTracking (`orderTracking.routes.ts`)

| Method | Path | Roles | Notes |
|---|---|---|---|
| `POST` | `/order-trackings` | `accounting_supervisor`, `admin`, `super_admin` | body: `{orderNumber, orderType, notes?}`. 404 `ORDER_NOT_FOUND_IN_ERP` / 409 `ORDER_TRACKING_DUPLICATE` |
| `GET` | `/order-trackings` | `sales_rep`, `accounting`, `supervisor`, `accounting_supervisor`, `admin`, `super_admin` | paginated; filters `orderType`/`orderNumber`/`salesRepCode`; row-scoped for `sales_rep` |
| `GET` | `/order-trackings/:id` | same as above | 404 if scoped caller doesn't own it |
| `PATCH` | `/order-trackings/:id` | `accounting_supervisor`, `admin`, `super_admin` | body: `{orderType?, notes?}` only |
| `POST` | `/order-trackings/:id/sync` | `accounting_supervisor`, `admin`, `super_admin` | re-fetches ERP snapshot, overwrites snapshot fields + `snapshotAt` |
| `POST` | `/order-trackings/:id/invoice-plans` | `accounting_supervisor`, `admin`, `super_admin` | create a plan line under this order |

### InvoicePlan (`invoicePlan.routes.ts`)

| Method | Path | Roles | Notes |
|---|---|---|---|
| `GET` | `/invoice-plans` | `sales_rep`, `accounting`, `supervisor`, `accounting_supervisor`, `admin`, `super_admin` | filters `orderTrackingId`/`status`; row-scoped for `sales_rep` |
| `PATCH` | `/invoice-plans/:id` | same as `GET` (service layer narrows further, incl. 403 for `accounting`) | see §6 four-way branch |
| `DELETE` | `/invoice-plans/:id` | `accounting_supervisor`, `admin`, `super_admin` | only `pending` lines; else 409 `INVOICE_PLAN_NOT_PENDING` |

### Invoice (`invoice.routes.ts`)

| Method | Path | Roles | Notes |
|---|---|---|---|
| `POST` | `/invoices` | `accounting`, `accounting_supervisor`, `admin`, `super_admin` | body: `{invoicePlanId, invoiceNumber, invoiceDate, notes?}` |
| `GET` | `/invoices` | `sales_rep`, `accounting`, `supervisor`, `accounting_supervisor`, `admin`, `super_admin` | filters `orderTrackingId`/`status`; row-scoped for `sales_rep` |
| `GET` | `/invoices/:id` | same as `GET /invoices` | |
| `PATCH` | `/invoices/:id` | `accounting`, `accounting_supervisor`, `admin`, `super_admin` | `notes` only — everything else fixed at issuance |
| `POST` | `/invoices/:id/void` | same as `PATCH` | body: `{voidReason}`; 409 `INVOICE_ALREADY_VOID` if already void |
| `DELETE` | `/invoices/:id` | same as `PATCH` | **hard delete**, see §8.5 |

### Error codes (new, `src/types/index.ts`)

| Code | HTTP | Meaning |
|---|---|---|
| `ORDER_NOT_FOUND_IN_ERP` | 404 | The submitted order number has no ERP match |
| `ORDER_TRACKING_DUPLICATE` | 409 | An `OrderTracking` for this order number already exists |
| `INVOICE_PLAN_NOT_PENDING` | 409 | Attempted a change reserved for `pending` lines on a non-pending one |
| `INVOICE_ALREADY_VOID` | 409 | Attempted to void an already-void invoice |
| `INVOICE_NUMBER_TAKEN` | 409 | The manually-entered `invoiceNumber` is already in use |

Plus the pre-existing `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (400).

---

## 8. Business Rules

### 8.1 Creating an `OrderTracking`

1. Reject if `orderNumber` already tracked locally → 409 `ORDER_TRACKING_DUPLICATE`.
2. Query `erpOrder.repository.findOrderSnapshotByNumber` → 404 `ORDER_NOT_FOUND_IN_ERP` if no match.
3. Write the snapshot fields + `snapshotAt = now()` + user-supplied `orderType`/`notes`.

### 8.2 Syncing

`POST /:id/sync` re-runs the ERP lookup and overwrites only the snapshot fields + `snapshotAt`; `orderType`/`notes` are untouched.

### 8.3 InvoicePlan lifecycle

- Create: `plannedAmount` must be `> 0` (zod `.positive()`); `plannedMonth`/`estimatedCompletionDate` normalized to the 1st of their month (`toMonthStart`), and their ROC-string twins derived server-side.
- Update: see §6's four-way branch; any change to `plannedMonth`/`plannedAmount`/`estimatedCompletionDate` on a non-`pending` line → 409.
- Delete: only `pending` lines; else 409.

### 8.4 Issuing an invoice (1 plan line : 1 invoice)

`POST /invoices` with `{invoicePlanId, invoiceNumber, invoiceDate, notes?}`:
1. Plan line must exist and be `pending` (404 / 409 `INVOICE_PLAN_NOT_PENDING`).
2. `invoiceNumber` must be unique (409 `INVOICE_NUMBER_TAKEN`) — **entered manually by the caller**, not auto-sequenced (see §11.1).
3. `amount = plan.plannedAmount`; `taxAmount = round(amount × 5%, 2 dp, half-up)`; `totalAmount = amount + taxAmount`.
4. Plan line flips to `status = 'invoiced'`, `invoiceId` set.

### 8.5 Void vs. permanent delete — two distinct operations

- **Void** (`POST /:id/void`, any `accounting`+ role): status → `void`, `voidedAt`/`voidReason` recorded, **and** the linked `InvoicePlan` is reset to `pending`/`invoiceId = null` so it can be reissued. History is preserved. Already-void → 409 `INVOICE_ALREADY_VOID`.
- **Hard delete** (`DELETE /:id`, same roles): the `Invoice` row is removed from the database entirely — usable on `issued` or `void` invoices, no extra guard. Sequence: (a) write an `invoice_deleted` audit log entry **first**, snapshotting `invoiceNumber`/`orderTrackingId`/`amount`/`taxAmount`/`totalAmount`/`statusAtDeletion` (since after deletion the row — and thus a plain FK join — can no longer show any of this); (b) if the plan line still points at this invoice (i.e. it wasn't already voided), reset it to `pending`/`invoiceId = null`; (c) delete the row.

### 8.6 Remaining uninvoiced amount

See §4.5 — computed on read, never stored.

### 8.7 Audit events

New `AuditEventType` values logged via the pre-existing `audit.service.ts`: `order_tracking_created`, `order_tracking_synced`, `order_tracking_updated`, `invoice_plan_created`, `invoice_plan_updated`, `invoice_plan_deleted`, `invoice_issued`, `invoice_updated`, `invoice_voided`, `invoice_deleted`.

---

## 9. Frontend Specification

**Shared:**
- `frontend/src/lib/roles.ts` — `hasAnyRole()` + `ORDER_TRACKING_READ_ROLES`, `ORDER_TRACKING_FULL_WRITE_ROLES`, `INVOICE_MANAGE_ROLES` (used by both route guards and inline button visibility). Mirrors `src/utils/roles.ts` on the backend (§6) in name and value, but is UI-only — not authoritative.
- `frontend/src/lib/orderType.ts` — `general`/`maintenance`/`installment` ↔ Chinese display labels
- `frontend/src/lib/invoicePlanStatus.ts` — status ↔ display/badge mapping
- `frontend/src/lib/rocDate.ts`, `frontend/src/lib/format.ts` — ROC date + currency formatting (mirrors backend `rocDate.ts`, since the API returns raw ISO dates/decimal strings)
- `RouteGuards.tsx` — `OrderTrackingRoute` (all six roles above `user`) wrapping `OrderTrackingManageRoute` (the `ORDER_TRACKING_FULL_WRITE_ROLES` subset, gating `/order-trackings/new`)

**Pages:**
- `pages/orderTracking/OrderTrackingsPage.tsx` — list + filters; "New" button only for full-write roles
- `pages/orderTracking/OrderTrackingFormPage.tsx` — order number + type → ERP lookup preview → create
- `pages/orderTracking/OrderTrackingDetailPage.tsx` — ERP snapshot (read-only) + `orderType`/`notes` (editable by full-write roles) + "sync" button + remaining-amount display + `InvoicePlan` table + `Invoice` list. The plan table's editability is driven by `canManageOrderTracking` (full CRUD) vs. `canEditLimitedFieldsOnly` (`sales_rep` **or** `supervisor`, `notes` always editable inline, `estimatedCompletionDate` editable only while `status === 'pending'`) vs. neither (`accounting`: read-only here, but can open "issue invoice" on a `pending` line)
- `pages/invoices/InvoicesPage.tsx`, `InvoiceDetailPage.tsx` — list/detail; void dialog (`voidReason` textarea) and permanent-delete confirmation dialog for `INVOICE_MANAGE_ROLES`

---

## 10. Testing Strategy

- **Unit** (`tests/unit/services/`): `orderTracking.service.test.ts` (7 cases — ERP mock hit/miss/duplicate), `invoicePlan.service.test.ts` (19 cases — ROC string derivation, the four-way authorization branch incl. `supervisor`, status locking), `invoice.service.test.ts` (13 cases — issue/void/delete, 5% tax math, audit snapshot on delete)
- **Integration** (`tests/integration/`, real DB via supertest): `orderTrackings/orderTrackings.test.ts` (7), `invoicePlans/invoicePlans.test.ts` (8), `invoices/invoices.test.ts` (10) — role-boundary coverage for all six roles, status-transition error codes, 404-vs-403 scoping behavior
- `tests/integration/setup.ts#setupTestDb` seeds all six roles + the full permission set for integration tests, mirroring `prisma/seed.ts`
- `erpOrder.repository` is `vi.mock`ed everywhere — no test depends on a live ERP connection
- As of this branch: **142 test cases total** across the whole repo, all passing

---

## 11. Known Deviations from the Original Plan

The original design doc (superseded by this one) called for a few things that changed during implementation:

### 11.1 Manual invoice numbering, not an auto-incrementing sequence

The plan specified a `NumberSequence` table + `UPDATE ... OUTPUT`-based atomic counter producing `INV-{year}-{6 digits}`. The as-built system instead has the caller supply `invoiceNumber` and `invoiceDate` directly in the `POST /invoices` body (uniqueness enforced by a DB constraint + 409 `INVOICE_NUMBER_TAKEN`). No `NumberSequence` model, `sequence.repository.ts`, or `sequence.service.ts` exist. Rationale (per commit `ff81a03`): invoice numbers in this org are assigned by the accounting workflow/paper trail, not generated by this system.

### 11.2 `Invoice.notes` and `PATCH /invoices/:id`

Not in the original plan; added alongside §11.1 so accounting can annotate an invoice without voiding it. Only `notes` is mutable post-issuance — `invoiceNumber`/`invoiceDate`/amounts are fixed at creation (void + reissue is the correction path for those).

### 11.3 `supervisor` role (entirely new, added after initial Phase 1 ship)

Not present in the original plan at all — added afterward as a fourth operational role: global read across all three models, plus the narrow ability to edit any `InvoicePlan`'s `notes`/`estimatedCompletionDate` (never row-scoped, unlike `sales_rep`). Required no changes to any existing read function (see §6) — only new route allowlist entries and the third branch of `updateInvoicePlan`'s authorization logic.

### 11.4 `sales_rep` gained `estimatedCompletionDate` write access

Originally `sales_rep` could only edit `InvoicePlan.notes`. Commit `55f4037` extended this to include `estimatedCompletionDate` as well (still locked once the line is `invoiced`), and `supervisor` was designed from the start to match this same field set.

### 11.5 Permission rows are unenforced (see §5.1)

The plan implied the seeded `order_tracking:*`/`invoice_plans:*`/`invoices:*` permissions would gate access the way `users:*`/`roles:*` do elsewhere. In practice every route uses `requireRole(...)` and the service-layer branches in `scopeContext.ts`; `requirePermission()` is never called for this module.

---

## 12. Phase 2 Candidates (Out of Scope)

- Payment/receipt registration against issued invoices
- Accounts-receivable aging report
- PDF invoice generation
- Email notifications (plan-line due soon, invoice issued, etc.)
- Splitting one invoice across multiple `InvoicePlan` lines (schema already supports it — `InvoicePlan.invoiceId` is many-to-one — only service logic would need to change)
- Multi-currency support
