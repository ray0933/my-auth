# Order/Invoice Tracking — Implementation Record

**Reference:** `order-invoice-tracking-spec.md`
**Branch:** `feature/order-invoice-tracking` (off `master`)
**Status:** Phase 1 complete — implemented, unit + integration tested (142/142 passing), manually verified via `playwright-cli`, committed, pushed to `origin/feature/order-invoice-tracking`. Not yet merged to `master`. One post-ship refactor commit (`298c326`, role-list consolidation) since Phase 1 closed — no behavior change.

---

## Commit History

```
657c8ea Add order/invoice tracking system (Phase 1)
ff81a03 Invoice: manual numbering/date, notes field, order/customer display
55f4037 InvoicePlan: let sales_rep edit estimatedCompletionDate, lock once invoiced
a8082b2 Add supervisor role: global read + limited InvoicePlan write
298c326 Extract order/invoice route role lists into shared src/utils/roles.ts
```

Each of the first four commits is a self-contained, test-passing increment — see `order-invoice-tracking-spec.md` §11 for what changed and why at each step relative to the original design. `298c326` is a pure refactor (no behavior change, no new tests needed) that consolidated the role arrays each route file had been separately declaring; see spec §6.

## Migrations

```
20260822140547_add_order_tracking_and_invoice   — OrderTracking/InvoicePlan/Invoice + NumberSequence + User.employeeCode
20260823023240_remove_number_sequence           — dropped NumberSequence (see spec §11.1: numbering went manual)
20260823031834_add_invoice_notes                — added Invoice.notes
```

---

## File Manifest

### Backend — new files

| Layer | File |
|---|---|
| ERP repository | `src/repositories/erpOrder.repository.ts` |
| OrderTracking | `src/repositories/orderTracking.repository.ts`, `src/services/orderTracking.service.ts`, `src/controllers/orderTracking.controller.ts`, `src/routes/orderTracking.routes.ts` |
| InvoicePlan | `src/repositories/invoicePlan.repository.ts`, `src/services/invoicePlan.service.ts`, `src/controllers/invoicePlan.controller.ts`, `src/routes/invoicePlan.routes.ts` |
| Invoice | `src/repositories/invoice.repository.ts`, `src/services/invoice.service.ts`, `src/controllers/invoice.controller.ts`, `src/routes/invoice.routes.ts` |
| Shared utils | `src/utils/scopeContext.ts` (row/field scoping helpers), `src/utils/rocDate.ts` (`toMonthStart`, `toRocMonthStr`), `src/utils/roles.ts` (`ORDER_TRACKING_READ_ROLES`/`ORDER_TRACKING_FULL_WRITE_ROLES`/`INVOICE_MANAGE_ROLES`, added in `298c326`) |
| Tests | `tests/unit/services/orderTracking.service.test.ts`, `tests/unit/services/invoicePlan.service.test.ts`, `tests/unit/services/invoice.service.test.ts`, `tests/integration/orderTrackings/orderTrackings.test.ts`, `tests/integration/invoicePlans/invoicePlans.test.ts`, `tests/integration/invoices/invoices.test.ts` |

### Backend — modified files

| File | Change |
|---|---|
| `prisma/schema.prisma` | `OrderTracking`/`InvoicePlan`/`Invoice` models; `User.employeeCode` + 3 reverse relations |
| `prisma/seed.ts` | 4 new roles, 15 new permissions, role→permission grants (spec §5.2) |
| `src/types/index.ts` | `OrderTrackingDto`/`InvoicePlanDto`/`InvoiceDto`/`CallerContext`/create-update DTOs; 5 new `ERROR_CODES` |
| `src/utils/validators.ts` | `createOrderTrackingSchema`, `updateOrderTrackingSchema`, `createInvoicePlanSchema`, `updateInvoicePlanSchema`, `issueInvoiceSchema`, `updateInvoiceSchema`, `voidInvoiceSchema`, `ORDER_TYPES` |
| `src/services/audit.service.ts` | `AuditEventType` union extended (spec §8.7) |
| `src/app.ts` | mounts `/api/v1/order-trackings`, `/api/v1/invoice-plans`, `/api/v1/invoices` |
| `tests/integration/setup.ts` | seeds all 4 new roles + permission grants for integration tests |
| `src/routes/orderTracking.routes.ts`, `invoicePlan.routes.ts`, `invoice.routes.ts` | (`298c326`) role-list `const`s replaced with imports from the new `src/utils/roles.ts`, aliased to keep the same local names |

### Frontend — new files

| Layer | File |
|---|---|
| Shared | `frontend/src/lib/roles.ts`, `frontend/src/lib/orderType.ts`, `frontend/src/lib/invoicePlanStatus.ts`, `frontend/src/lib/rocDate.ts`, `frontend/src/lib/format.ts` |
| Pages | `frontend/src/pages/orderTracking/OrderTrackingsPage.tsx`, `OrderTrackingFormPage.tsx`, `OrderTrackingDetailPage.tsx`, `frontend/src/pages/invoices/InvoicesPage.tsx`, `InvoiceDetailPage.tsx` |

### Frontend — modified files

| File | Change |
|---|---|
| `frontend/src/components/RouteGuards.tsx` | `OrderTrackingRoute`, `OrderTrackingManageRoute` |
| `frontend/src/components/Layout.tsx` | nav links for order tracking / invoices |
| `frontend/src/App.tsx` | routes: `/order-trackings`, `/order-trackings/new`, `/order-trackings/:id`, `/invoices`, `/invoices/:id` |

---

## Build Order (as actually followed)

1. Prisma schema (`OrderTracking`/`InvoicePlan`/`Invoice`, `User.employeeCode`) + migration
2. `types/index.ts` (DTOs/error codes) → `audit.service.ts` (event types)
3. `validators.ts` new schemas
4. `erpOrder.repository.ts` (mocked in all tests — no live ERP dependency)
5. OrderTracking four layers + unit/integration tests → mounted in `app.ts`
6. InvoicePlan four layers (incl. `plannedMonthStr`/`estimatedCompletionMonthStr` derivation) + tests
7. Invoice four layers (issue/void/hard-delete) + tests
8. `seed.ts` + `tests/integration/setup.ts` updated for the 4 new roles
9. Frontend: `lib/roles.ts` → `OrderTrackingRoute`/`OrderTrackingManageRoute` → pages → `App.tsx`/`Layout.tsx` wiring
10. Follow-up commits: manual invoice numbering (`ff81a03`), `sales_rep` gains `estimatedCompletionDate` (`55f4037`), `supervisor` role (`a8082b2`) — each re-ran the full test suite + a manual `playwright-cli` pass before commit

---

## Dev Environment / Local ERP Stand-in

The real `dbo.vw_ERP_OrderSnapshot` VIEW doesn't exist outside of a real ERP-connected environment. Locally, it's backed by a hand-seeded stand-in table in the `authdev` database on the project's `my-auth-sqlserver` Docker container:

```sql
-- one-time dev setup (not a Prisma migration — this table/view stands in for the real ERP)
dbo.tmp_ERP_Orders(orderNumber, orderDate, customerShortName, endUser, projectName,
                    salesRepCode, salesRepName, orderAmountUntaxed, estimatedCostUntaxed)
-- dbo.vw_ERP_OrderSnapshot is a VIEW over this table with matching column names
```

Current seed data (as of this branch) — two sales reps, three `OrderTracking` records each, all created through the real `POST /order-trackings` API path (not raw DB inserts, so `snapshotAt`/`createdById` are correctly populated):

| Sales rep | Order | Customer | 接單金額未稅 |
|---|---|---|---|
| S001 業務一號 | ORD-1001 | ACME 公司 | 500,000 |
| S001 業務一號 | ORD-1003 | 台塑石化 | 850,000 |
| S001 業務一號 | ORD-1004 | 中鋼公司 | 620,000 |
| S002 業務二號 | ORD-1002 | 大同科技 | 1,200,000 |
| S002 業務二號 | ORD-1005 | 台達電子 | 950,000 |
| S002 業務二號 | ORD-1006 | 鴻海精密 | 1,500,000 |

`S001` is the `employeeCode` of the `salesrep@example.com` test account.

---

## Test Users (dev DB)

| Email | Role | Notes |
|---|---|---|
| `admin@example.com` | `super_admin` | seeded by `prisma/seed.ts`, password from `SEED_ADMIN_PASSWORD` env (default `Admin@12345!`) |
| `salesrep@example.com` | `sales_rep` | `employeeCode = S001` |
| `supervisor@example.com` | `supervisor` | created manually during verification; **watch for accidental extra roles** — this email was reused from earlier `accounting_supervisor` testing once, which silently granted full write access on top and masked the supervisor-only restrictions until caught by inspecting the JWT payload. Always confirm a test account's actual `roles` claim before relying on it for permission verification. |

(`accounting`/`accounting_supervisor` test accounts were created ad hoc during verification and not preserved as fixtures — recreate via the `POST /api/v1/users` flow as `super_admin` if needed again.)

---

## Testing

```bash
npm test              # vitest run — unit + integration (needs the SQL Server container up)
npm run test:coverage # with coverage
```

- 142 test cases total across the repo (unit: 7+19+13 = 39 for this module; integration: 7+8+10 = 25 for this module; remainder pre-existing auth suite)
- Integration tests spin up against a real test database (`tests/integration/global-setup.ts` runs `prisma migrate deploy` against `TEST_DATABASE_URL`); requires the `my-auth-sqlserver` Docker container running
- `erpOrder.repository` is `vi.mock`ed in every test file that touches `OrderTracking` creation/sync — no test has a live-ERP dependency

## Manual End-to-End Verification (completed)

Performed via `curl` + `playwright-cli` against locally-running dev servers (backend `npm run dev` :3001, frontend `cd frontend && npm run dev` :3000):

1. Created `accounting_supervisor`, `accounting`, `sales_rep` (with `employeeCode`), and `supervisor` test users, each through the forced-password-change flow
2. Created an `OrderTracking` from a seeded ERP stand-in order number; confirmed ERP snapshot fields populated correctly and `salesRepCode` matched the `sales_rep` test user's `employeeCode`
3. Repeat-created the same order number → 409 `ORDER_TRACKING_DUPLICATE`
4. Added 2 `InvoicePlan` lines in different months; confirmed `plannedMonthStr`/`estimatedCompletionMonthStr` ROC conversion (e.g. AD 2026-07 → `115-07`)
5. As `accounting`: confirmed read access to `OrderTracking`/`InvoicePlan` with no edit controls, issued an invoice against a `pending` line (invoice number format, 5% tax math, plan line flips to `invoiced`), and confirmed `PATCH /order-trackings/:id` / `POST .../invoice-plans` → 403
6. Attempted edit/delete on an `invoiced` plan line → 409 `INVOICE_PLAN_NOT_PENDING`
7. Voided the invoice as `accounting`; confirmed the plan line reset to `pending`; reissued a new invoice against it
8. Hard-deleted the reissued invoice as `accounting`; confirmed an `invoice_deleted` audit row with the amount/status snapshot, the plan line reset to `pending`, and `GET /invoices/:id` → 404 for the deleted invoice
9. Confirmed `OrderTracking` detail page's remaining-uninvoiced-amount reflected invoiced vs. pending lines correctly
10. As `sales_rep`: `GET /order-trackings` returned only their own row; `PATCH /invoice-plans/:id` with `{notes}` succeeded, with `{plannedAmount}` → 403; write/delete endpoints on `OrderTracking`/`Invoice` → 403 at the route gate
11. Confirmed a `sales_rep` requesting a different rep's `OrderTracking` by ID → 404 (not 403)
12. Confirmed plain `user` role → 403 `FORBIDDEN` on all order/invoice endpoints
13. Checked `AuditLog` via `npx prisma studio` for all new event types, including `invoice_deleted`
14. Walked the frontend as `accounting_supervisor`, `accounting`, `sales_rep`, and `supervisor` via `playwright-cli`, confirming visible buttons/data scope matched each role
15. **`supervisor` role specifically:** confirmed global read across all three models, `notes`/`estimatedCompletionDate` edits succeeding on plan lines belonging to *other* sales reps, all other field edits → 403, and the same `INVOICE_PLAN_NOT_PENDING` lock as every other role once a line is invoiced

All 15 checks passed as designed. No open defects.
