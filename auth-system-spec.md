# Authentication & Authorization System
## Requirements · Specifications · Architecture · Design

**Version:** 1.3 | **Date:** April 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Requirements](#2-requirements)
3. [Database Schema](#3-database-schema)
4. [API Specification](#4-api-specification)
5. [System Architecture](#5-system-architecture)
6. [Detailed Design](#6-detailed-design)
7. [Security Design](#7-security-design)
8. [Testing Strategy](#8-testing-strategy)
9. [Implementation Guide](#9-implementation-guide)
10. [Appendix](#10-appendix)
11. [Frontend Specification](#11-frontend-specification)

---

## 1. Executive Summary

This document provides a complete specification for a local-database-backed Authentication and Authorization (AuthN/AuthZ) system. It is structured so that an AI coding assistant (e.g. Claude Code) can implement the system directly from this document without additional clarification.

**The system delivers:**
- Secure user identity management (admin-provisioned accounts, login, password reset)
- Role-Based Access Control (RBAC) with fine-grained permissions
- JWT-based stateless session tokens with refresh-token rotation
- Audit logging for all security events
- RESTful API surface suitable for integration with any frontend or service

> **Target stack:** Node.js / TypeScript + Express + Microsoft SQL Server (dev via local Docker container, prod via hosted instance) + Prisma ORM. Both environments use the `sqlserver` provider — no provider switch between dev and prod.

---

## 2. Requirements

### 2.1 Functional Requirements

#### FR-01 — Admin-Provisioned User Creation

| Field | Detail |
|---|---|
| ID | FR-01 |
| Description | Only administrators can create new user accounts. There is no self-registration endpoint. |
| Inputs | email (unique, validated), display_name (optional), role(s) to assign — all supplied by an admin |
| Password | System generates a cryptographically random temporary password and emails it to the new user |
| Outputs | 201 Created + user object (no password hash); welcome email with temporary password queued |
| Constraints | Email must be unique → 409 if duplicate; requires `admin` or `super_admin` role |
| First login | User is flagged `must_change_password = true`; login succeeds but API returns `PASSWORD_CHANGE_REQUIRED`; user must call `POST /users/me/change-password` before accessing other endpoints |

#### FR-02 — Forced Password Change on First Login

| Field | Detail |
|---|---|
| ID | FR-02 |
| Description | Users provisioned by an admin must set their own password before using the system. |
| Trigger | `must_change_password = true` on the user record |
| Behaviour | Login returns 200 with `access_token` + `{ requiresPasswordChange: true }` in the response body; all routes except `POST /users/me/change-password` return 403 `PASSWORD_CHANGE_REQUIRED` until the password is changed |
| On completion | `must_change_password` set to `false`; all existing refresh tokens revoked; new token pair issued |

#### FR-03 — Login / Authentication

| Field | Detail |
|---|---|
| ID | FR-03 |
| Description | Active users authenticate with email + password. |
| Outputs | `access_token` (JWT, 15 min) + `refresh_token` (opaque, 7 d, HttpOnly cookie) + `{ requiresPasswordChange: bool, user: ClientUser }` |
| Failure | 401 Unauthorized; after 5 consecutive failures → account temporarily locked (15 min) |
| Inactive account | 401 `ACCOUNT_DISABLED` if `is_active = false` |
| MFA (optional) | If MFA enabled, after password check return 202 + `mfa_challenge`; require TOTP code |

#### FR-04 — Token Refresh

| Field | Detail |
|---|---|
| ID | FR-04 |
| Description | Silent re-authentication using the refresh token. |
| Endpoint | `POST /auth/refresh` |
| Behaviour | Validate refresh token → issue new `access_token` + rotate `refresh_token` (old one invalidated); response body includes `{ accessToken, user: ClientUser }` |
| Failure | 401 if token expired, revoked, or family-reuse detected (all tokens in family revoked) |

#### FR-05 — Logout

| Field | Detail |
|---|---|
| ID | FR-05 |
| Description | Invalidate the current session. |
| Endpoint | `POST /auth/logout` |
| Behaviour | Revoke current refresh token; clear HttpOnly cookie; optionally revoke all sessions (`POST /auth/logout-all`) |

#### FR-06 — Password Reset

| Field | Detail |
|---|---|
| ID | FR-06 |
| Description | User-initiated password reset via email link. |
| Flow | 1. `POST /auth/forgot-password` → email with signed 1-hour token link  2. `POST /auth/reset-password { token, newPassword }` → password updated, all refresh tokens revoked |
| Security | Constant-time token comparison; same response body whether email exists or not (anti-enumeration) |

#### FR-07 — Role & Permission Management

| Field | Detail |
|---|---|
| ID | FR-07 |
| Description | Administrators can manage roles and permissions. |
| Operations | CRUD on roles; assign/revoke roles on users; CRUD on permissions; assign/revoke permissions on roles |
| Seeded roles | `super_admin`, `admin`, `user` |
| Access | Only `super_admin` or `admin` may modify roles/permissions |

#### FR-08 — Authorization Middleware

| Field | Detail |
|---|---|
| ID | FR-08 |
| Description | Route-level access control enforced by reusable middleware. |
| Mechanisms | `requireAuth()` — valid JWT required \| `requireRole('admin')` — role check \| `requirePermission('posts:delete')` — permission check |
| Behaviour | Middleware attaches decoded user context to `req.user`; fails with 401 (no token) or 403 (insufficient role/permission) |

#### FR-09 — Audit Logging

| Field | Detail |
|---|---|
| ID | FR-09 |
| Description | All security events are persisted to an audit log table. |
| Events | `user_created`, `login_success`, `login_failure`, `logout`, `token_refresh`, `password_reset_request`, `password_reset_complete`, `password_changed`, `role_change`, `permission_change`, `account_lock`, `account_enabled`, `account_disabled` |
| Fields | id, user_id (nullable), event_type, ip_address, user_agent, metadata (JSON), created_at |
| Retention | 90 days (configurable) |

#### FR-10 — User Profile

| Field | Detail |
|---|---|
| ID | FR-10 |
| Description | Authenticated users can view and update their own profile. |
| GET /me | Returns current user object (id, email, display_name, roles, must_change_password, created_at) |
| PATCH /me | Update display_name; change password (requires current password) |

---

### 2.2 Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-SEC-01 | Security | Passwords hashed with **argon2id** (or bcrypt, cost ≥ 12) |
| NFR-SEC-02 | Security | Password complexity: ≥ 8 chars, upper + lower + digit + symbol |
| NFR-SEC-03 | Security | JWTs signed with **RS256** (asymmetric); keys stored in env vars, never in code |
| NFR-SEC-04 | Security | All refresh tokens stored in DB with issued_at, expires_at, revoked_at |
| NFR-SEC-05 | Security | Rate limiting: 10 req/min per IP on all `/auth/*` routes |
| NFR-SEC-06 | Security | HttpOnly + Secure + SameSite=Strict on refresh token cookie |
| NFR-SEC-07 | Security | No sensitive data (password hash, secrets) in API responses or logs |
| NFR-PERF-01 | Performance | Auth endpoints respond in < 300 ms (p95) under 100 concurrent users |
| NFR-REL-01 | Reliability | Graceful DB connection retry with exponential back-off |
| NFR-REL-02 | Reliability | All DB operations requiring atomicity wrapped in transactions |
| NFR-OPS-01 | Operations | `GET /health` returns 200 + DB connection status |
| NFR-OPS-02 | Operations | Structured JSON logs (pino or winston); level configurable via `LOG_LEVEL` env |
| NFR-TEST-01 | Testing | Unit tests for all service-layer functions; integration tests for all API endpoints |
| NFR-TEST-02 | Testing | Minimum 80% line coverage enforced in CI |

---

## 3. Database Schema

All tables use **snake_case** identifiers, **UUID v4** primary keys, and **TIMESTAMPTZ** for all timestamps.

### Entity Relationships

```
User ──(many-to-many)──► Role ──(many-to-many)──► Permission
User ──(one-to-many)───► RefreshToken
User ──(one-to-many)───► PasswordResetToken
User ──(one-to-many)───► AuditLog
User ──(self-ref)──────► User (created_by)
User ──(self-ref)──────► User (my_boss)
```

### 3.1 users

```sql
CREATE TABLE users (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email                VARCHAR(320) NOT NULL UNIQUE,
  password_hash        TEXT         NOT NULL,
  display_name         VARCHAR(100),
  must_change_password BOOLEAN      NOT NULL DEFAULT TRUE,  -- set false after first password change
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  locked_until         TIMESTAMPTZ,
  failed_attempts      INT          NOT NULL DEFAULT 0,
  mfa_secret           TEXT,                  -- NULL = MFA disabled
  my_boss              UUID         REFERENCES users(id) ON DELETE SET NULL,  -- this user's boss(for data security, boss can see all records created by his members)
  created_by           UUID         REFERENCES users(id) ON DELETE SET NULL,  -- admin who created this user
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### 3.2 roles

```sql
CREATE TABLE roles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL UNIQUE,   -- e.g. 'admin', 'user'
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);
```

### 3.3 permissions

```sql
CREATE TABLE permissions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,  -- e.g. 'posts:delete'
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id)        ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id)  ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
```

### 3.4 refresh_tokens

```sql
CREATE TABLE refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,   -- SHA-256 of raw token
  family_id   UUID        NOT NULL,           -- for rotation reuse detection
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip_address  INET,
  user_agent  TEXT
);
```

> **Never store the raw refresh token.** Always store and compare its SHA-256 hash.

### 3.5 password_reset_tokens

```sql
CREATE TABLE password_reset_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,  -- SHA-256 of raw token
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);
```

### 3.6 audit_logs

```sql
CREATE TABLE audit_logs (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user  ON audit_logs(user_id);
CREATE INDEX idx_audit_event ON audit_logs(event_type);
CREATE INDEX idx_audit_time  ON audit_logs(created_at);
```

---

## 4. API Specification

**Base path:** `/api/v1`  
**Content-Type:** `application/json`  
**Auth header:** `Authorization: Bearer <access_token>`

### 4.1 Authentication Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/login` | No | Login; returns `{ accessToken, requiresPasswordChange, user }` + sets refresh cookie |
| POST | `/auth/refresh` | No | Rotate refresh token; returns `{ accessToken, user }` + rotates refresh cookie |
| POST | `/auth/logout` | Yes | Revoke current session |
| POST | `/auth/logout-all` | Yes | Revoke all sessions |
| POST | `/auth/forgot-password` | No | Request password reset email |
| POST | `/auth/reset-password` | No | Complete password reset |
| POST | `/auth/mfa/setup` | Yes | Generate TOTP secret + QR URI |
| POST | `/auth/mfa/verify` | Yes | Confirm TOTP code to activate MFA |
| POST | `/auth/mfa/disable` | Yes | Disable MFA (requires current password) |

### 4.2 User Profile Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users/me` | Yes | Get current user profile |
| PATCH | `/users/me` | Yes | Update display_name |
| POST | `/users/me/change-password` | Yes | Change own password |

### 4.3 Admin — User Management

| Method | Path | Role Required | Description |
|---|---|---|---|
| POST | `/admin/users` | admin | Create a new user account (admin-provisioned) |
| GET | `/admin/users` | admin | List all users (paginated); `data` is a flat `UserDto[]` array; `roles` field on each user is `string[]` (role names) |
| GET | `/admin/users/:id` | admin | Get user by ID |
| PATCH | `/admin/users/:id` | admin | Update user (is_active, display_name) |
| DELETE | `/admin/users/:id` | super_admin | Hard-delete user |
| POST | `/admin/users/:id/roles` | admin | Assign role to user |
| DELETE | `/admin/users/:id/roles/:roleId` | admin | Revoke role from user |
| POST | `/admin/users/:id/unlock` | admin | Unlock a locked account |
| POST | `/admin/users/:id/force-password-reset` | admin | Force user to change password on next login |

### 4.4 Admin — Roles & Permissions

| Method | Path | Role Required | Description |
|---|---|---|---|
| GET | `/admin/roles` | admin | List all roles; each role includes `rolePermissions: Array<{ permission: { id, name } }>` |
| POST | `/admin/roles` | super_admin | Create role |
| PATCH | `/admin/roles/:id` | super_admin | Update role |
| DELETE | `/admin/roles/:id` | super_admin | Delete role |
| GET | `/admin/permissions` | admin | List all permissions |
| POST | `/admin/permissions` | super_admin | Create permission |
| POST | `/admin/roles/:id/permissions` | super_admin | Assign permission to role |
| DELETE | `/admin/roles/:id/permissions/:permId` | super_admin | Revoke permission from role |

### 4.5 Response Envelopes

```json
// Success
{ "success": true, "data": { ... } }

// Paginated list
{ "success": true, "data": [ ... ], "meta": { "total": 120, "page": 1, "limit": 20 } }

// Error
{ "success": false, "error": { "code": "INVALID_CREDENTIALS", "message": "..." } }
```

### 4.6 Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request body failed validation |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 401 | `TOKEN_EXPIRED` | JWT or refresh token has expired |
| 401 | `TOKEN_REVOKED` | Token has been invalidated |
| 401 | `ACCOUNT_DISABLED` | Account has been deactivated by an admin |
| 401 | `ACCOUNT_LOCKED` | Too many failed attempts |
| 403 | `FORBIDDEN` | Authenticated but insufficient role/permission |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Must change temporary password before proceeding |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `EMAIL_TAKEN` | Email already exists in the system |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## 5. System Architecture

### 5.1 Layered Architecture

```
┌─────────────────────────────────────────┐
│           Routes / Controllers          │  HTTP parsing, response formatting
├─────────────────────────────────────────┤
│              Middleware                 │  Auth guards, rate limit, logging
├─────────────────────────────────────────┤
│               Services                 │  Business logic, domain rules
├─────────────────────────────────────────┤
│             Repositories               │  DB access via Prisma ORM only
├─────────────────────────────────────────┤
│            Database (Prisma)            │  SQL Server (dev container / prod instance)
└─────────────────────────────────────────┘
```

### 5.2 Request Lifecycle

1. Client sends HTTP request
2. Rate-limiter checks IP → 429 if exceeded
3. Request logger records method, path, correlation-id
4. Route matched → controller invoked
5. `requireAuth()` validates Bearer JWT → attaches `req.user`
6. `requireRole()` / `requirePermission()` checks RBAC → 403 if denied
7. Controller calls Service with validated DTO
8. Service executes business logic → calls Repository
9. Repository uses Prisma; wraps multi-step ops in transactions
10. Service returns result → Controller formats response envelope
11. Error handler middleware catches thrown errors → maps to error codes

### 5.3 Token Architecture

**Access Token (JWT):**
- Algorithm: RS256 (private key signs, public key verifies)
- Payload: `{ sub: userId, email, roles: string[], exp, iat, jti }`
- TTL: **15 minutes** — short-lived, NOT stored in DB
- Transport: `Authorization: Bearer <token>` header

**Refresh Token:**
- Format: cryptographically random 48-byte, base64url-encoded
- Storage: SHA-256 hash stored in `refresh_tokens` table
- TTL: **7 days**
- Transport: HttpOnly + Secure + SameSite=Strict cookie
- Rotation: every refresh issues a new token; old token immediately revoked
- Family reuse detection: if a previously-revoked token in a family is presented → revoke all tokens in that family (detects theft)

### 5.4 Directory Structure

```
src/
├── app.ts                   # Express app factory
├── server.ts                # Entry point, DB connect, listen
├── config/
│   ├── env.ts               # Validated env vars (zod)
│   └── prisma.ts            # Prisma client singleton
├── routes/
│   ├── auth.routes.ts
│   ├── user.routes.ts
│   └── admin.routes.ts
├── controllers/
│   ├── auth.controller.ts
│   ├── user.controller.ts
│   └── admin.controller.ts
├── services/
│   ├── auth.service.ts
│   ├── admin.service.ts
│   ├── token.service.ts
│   ├── role.service.ts
│   └── audit.service.ts
├── repositories/
│   ├── user.repository.ts
│   ├── token.repository.ts
│   └── role.repository.ts
├── middleware/
│   ├── authenticate.ts      # requireAuth()
│   ├── authorize.ts         # requireRole(), requirePermission()
│   ├── passwordChanged.ts   # requirePasswordChanged()
│   ├── rateLimiter.ts
│   ├── requestLogger.ts
│   └── errorHandler.ts
├── utils/
│   ├── jwt.ts
│   ├── crypto.ts
│   ├── email.ts
│   └── validators.ts
├── types/
│   ├── express.d.ts         # Augment req.user
│   └── index.ts
└── prisma/
    ├── schema.prisma
    └── seed.ts
```

---

## 6. Detailed Design

### 6.1 AuthService — Method Contracts

```typescript
// auth.service.ts — behaviour contracts

// ── Admin-side ────────────────────────────────────────────────────────────

adminCreateUser(dto: AdminCreateUserDto, actorId: string): Promise<UserDto>
// 1. Validate email uniqueness
// 2. Generate cryptographically random temporary password (24 chars)
// 3. Hash temporary password with argon2id
// 4. Create user record with must_change_password = true, created_by = actorId
// 5. Assign specified role(s) within the same transaction
// 6. Queue welcome email containing the temporary password
// 7. Write audit log (event: user_created, metadata: { createdBy: actorId, roles })

// ── Auth flows ────────────────────────────────────────────────────────────

login(dto: LoginDto, ip: string, ua: string): Promise<LoginResult>
// 1. Find user by email (constant-time path if not found)
// 2. Check is_active → 401 ACCOUNT_DISABLED if false
// 3. Check locked_until → 401 ACCOUNT_LOCKED if still locked
// 4. Compare password with argon2.verify()
// 5. On failure: increment failed_attempts; if ≥ 5 → set locked_until = NOW() + 15 min; audit log; throw 401
// 6. On success: reset failed_attempts; generate TokenPair; audit log (login_success)
// 7. Return { accessToken, refreshToken, requiresPasswordChange, user: ClientUser }

changePassword(userId: string, dto: ChangePasswordDto): Promise<TokenPair>
// 1. Verify current password with argon2.verify()
// 2. Validate new password complexity
// 3. Hash new password
// 4. Update user.password_hash; set must_change_password = false
// 5. Revoke ALL existing refresh tokens for the user
// 6. Issue new TokenPair
// 7. Write audit log (event: password_changed)

refresh(rawToken: string, ip: string, ua: string): Promise<RefreshResult>
// 1. SHA-256 hash the token
// 2. Find in refresh_tokens (not revoked, not expired)
// 3. If already revoked → revoke entire family → throw 401 TOKEN_REVOKED
// 4. Revoke current token (set revoked_at)
// 5. Issue new TokenPair with same family_id
// 6. Return { accessToken, refreshToken, user: ClientUser }

logout(userId: string, rawToken: string): Promise<void>
// Revoke the specific refresh token; write audit log

logoutAll(userId: string): Promise<void>
// Revoke all refresh tokens for the user; write audit log

forgotPassword(email: string): Promise<void>
// Always returns success (anti-enumeration)
// If user found: generate reset token (1 h); store SHA-256 hash in password_reset_tokens; queue email; audit log

resetPassword(token: string, newPassword: string): Promise<void>
// 1. SHA-256 hash the token
// 2. Find unexpired, unused record in password_reset_tokens
// 3. Mark token as used (used_at = NOW())
// 4. Hash new password with argon2id
// 5. Update user.password_hash; set must_change_password = false
// 6. Revoke ALL refresh tokens for the user
// 7. Write audit log (event: password_reset_complete)
```

### 6.2 Authorization Middleware

```typescript
// middleware/authenticate.ts
export function requireAuth(): RequestHandler {
  return async (req, res, next) => {
    const token = extractBearerToken(req);
    if (!token) return next(new AppError('TOKEN_MISSING', 401));
    try {
      const payload = verifyAccessToken(token); // throws if invalid/expired
      req.user = payload;
      next();
    } catch {
      next(new AppError('TOKEN_EXPIRED', 401));
    }
  };
}

// middleware/authorize.ts
export function requireRole(...roles: string[]): RequestHandler {
  return (req, res, next) => {
    const hasRole = roles.some(r => req.user.roles.includes(r));
    if (!hasRole) return next(new AppError('FORBIDDEN', 403));
    next();
  };
}

export function requirePermission(permission: string): RequestHandler {
  return async (req, res, next) => {
    const perms = await roleService.getPermissionsForUser(req.user.sub);
    if (!perms.includes(permission)) return next(new AppError('FORBIDDEN', 403));
    next();
  };
}

// middleware/passwordChanged.ts
// Apply globally after requireAuth() — exempt only POST /users/me/change-password
export function requirePasswordChanged(): RequestHandler {
  return (req, res, next) => {
    if (req.user?.mustChangePassword) {
      return next(new AppError('PASSWORD_CHANGE_REQUIRED', 403));
    }
    next();
  };
}
```

### 6.3 Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Prisma connection string — MSSQL format: `sqlserver://localhost:1433;database=authdev;user=sa;password=…;trustServerCertificate=true` |
| `SHADOW_DATABASE_URL` | Yes (dev) | — | Separate MSSQL database used by Prisma Migrate for schema diffing; same host as `DATABASE_URL`, different `database=` name (e.g. `authdev_shadow`) |
| `JWT_PRIVATE_KEY` | Yes | — | RS256 PEM private key (base64 or raw PEM) |
| `JWT_PUBLIC_KEY` | Yes | — | RS256 PEM public key |
| `JWT_ACCESS_TTL` | No | `900` | Access token TTL in seconds (15 min) |
| `REFRESH_TOKEN_TTL` | No | `604800` | Refresh token TTL in seconds (7 days) |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window in ms |
| `RATE_LIMIT_MAX` | No | `10` | Max requests per window per IP on /auth/* |
| `ACCOUNT_LOCK_THRESHOLD` | No | `5` | Failed login attempts before lock |
| `ACCOUNT_LOCK_DURATION_MIN` | No | `15` | Lock duration in minutes |
| `SMTP_HOST` | Yes | — | SMTP server hostname |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | Yes | — | SMTP username |
| `SMTP_PASS` | Yes | — | SMTP password |
| `FRONTEND_URL` | Yes | — | Used in email verification / reset links |
| `LOG_LEVEL` | No | `info` | pino log level |
| `NODE_ENV` | No | `development` | Controls cookie Secure flag etc. |

### 6.4 Prisma Schema (abbreviated)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider          = "sqlserver"
  url               = env("DATABASE_URL")
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")  // required by Prisma Migrate for SQL Server
}

model User {
  id                   String    @id @default(uuid())
  email                String    @unique
  passwordHash         String
  displayName          String?
  mustChangePassword   Boolean   @default(true)
  isActive             Boolean   @default(true)
  lockedUntil          DateTime?
  failedAttempts       Int       @default(0)
  mfaSecret            String?
  createdBy            String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  roles                UserRole[]
  refreshTokens        RefreshToken[]
  passwordResetTokens  PasswordResetToken[]
  auditLogs            AuditLog[]
  creator              User?     @relation("CreatedBy", fields: [createdBy], references: [id])
  createdUsers         User[]    @relation("CreatedBy")
}

model Role {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  createdAt   DateTime @default(now())

  users       UserRole[]
  permissions RolePermission[]
}

model Permission {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  createdAt   DateTime @default(now())

  roles RolePermission[]
}

model UserRole {
  userId    String
  roleId    String
  grantedAt DateTime @default(now())
  grantedBy String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@id([userId, roleId])
}

model RolePermission {
  roleId       String
  permissionId String

  role       Role       @relation(fields: [roleId],       references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  familyId  String
  issuedAt  DateTime  @default(now())
  expiresAt DateTime
  revokedAt DateTime?
  ipAddress String?
  userAgent String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  usedAt    DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model AuditLog {
  id        BigInt   @id @default(autoincrement())
  userId    String?
  eventType String
  ipAddress String?
  userAgent String?
  metadata  Json?
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([eventType])
  @@index([createdAt])
}
```

---

## 7. Security Design

### 7.1 Threat Model & Mitigations

| Threat | Mitigation |
|---|---|
| Credential stuffing / brute force | Rate limiting (10 req/min/IP) + account lock after 5 failures |
| Password database leak | argon2id with per-user salt; no reversible encoding |
| JWT theft | Short 15-min TTL; RS256 asymmetric signing |
| Refresh token theft | HttpOnly cookie (no JS access); family reuse detection revokes all tokens in family |
| CSRF | SameSite=Strict on cookie; add double-submit CSRF token for extra safety |
| Temporary password interception | Welcome email sent over TLS; user forced to change on first login; temp password not stored in plain text anywhere |
| Unauthorized user creation | `POST /admin/users` restricted to `admin` / `super_admin` roles; all creations audit-logged with actor ID |
| SQL injection | Prisma ORM parameterised queries; no raw SQL |
| Privilege escalation | RBAC checked server-side on every request; JWT role claims never trusted for write operations |
| IDOR | Admin routes verify actor's role; user routes enforce `req.user.sub === param.id` |
| Long-password DoS | Max password length 128 chars (prevents bcrypt complexity DoS) |

### 7.2 Password Policy

- Minimum 8 characters, maximum 128 characters
- At least one uppercase letter `[A-Z]`
- At least one lowercase letter `[a-z]`
- At least one digit `[0-9]`
- At least one special character `[!@#$%^&*()_+\-=\[\]{}|;':\",./<>?]`
- Optional: reject passwords found in breach lists via [haveibeenpwned API](https://haveibeenpwned.com/API/v3#PwnedPasswords) (k-anonymity model, no plaintext sent)

---

## 8. Testing Strategy

### 8.1 Unit Tests (Vitest or Jest)

- `auth.service.ts` — mock repositories; test all happy paths and all error branches
- `token.service.ts` — JWT sign/verify, refresh token hash, rotation, family reuse detection
- `role.service.ts` — permission resolution, RBAC hierarchy
- `validators.ts` — email regex, password complexity rules
- Target: **≥ 80% line coverage** on all service and utility files

### 8.2 Integration Tests (Supertest)

- Spin up the Express app against a dedicated test database on the local MSSQL Docker container (`authdev_test`); run `prisma migrate deploy` in test setup to apply schema
- Test the full HTTP lifecycle for every endpoint in Section 4
- Include negative tests: wrong credentials, expired tokens, insufficient role
- Verify audit log entries are written after each security event

### 8.3 Key Test Scenarios

| Scenario | Expected Result |
|---|---|
| Admin creates user with valid data | 201 + user object; welcome email with temp password queued; `must_change_password = true` |
| Admin creates user with duplicate email | 409 `EMAIL_TAKEN` |
| Non-admin attempts to create a user | 403 `FORBIDDEN` |
| Login with temp password (first login) | 200 + access_token + `{ requiresPasswordChange: true }` |
| Access any route before changing temp password | 403 `PASSWORD_CHANGE_REQUIRED` |
| Change password with correct current password | 200 + new token pair; `must_change_password = false`; old sessions revoked |
| Login with wrong password ×5 | Account locked; subsequent attempts return 401 `ACCOUNT_LOCKED` |
| Login with correct credentials (normal) | 200 + access_token; refresh cookie set |
| Login with disabled account | 401 `ACCOUNT_DISABLED` |
| Access protected route with valid JWT | 200 + resource |
| Access protected route with expired JWT | 401 `TOKEN_EXPIRED` |
| Access admin route with `user` role | 403 `FORBIDDEN` |
| Refresh with valid refresh token | 200 + new access_token; new cookie; old token revoked |
| Refresh with already-used refresh token | 401 `TOKEN_REVOKED`; entire token family revoked |
| Password reset — full flow | Password updated; old sessions revoked; login succeeds with new password |
| MFA — enable then login | Login flow requires TOTP code; rejected if wrong code |
| Admin force-password-reset on a user | User's `must_change_password` set to true; existing sessions revoked |

---

## 9. Implementation Guide

### 9.1 Suggested Build Order

1. Scaffold project: `npm init`, `tsconfig.json`, eslint, `prisma init`
2. Start local SQL Server container: `docker compose up -d` (see `docker-compose.yml` — image `mcr.microsoft.com/mssql/server:2022-latest`, port 1433, `ACCEPT_EULA=Y`, `SA_PASSWORD`)
3. Define Prisma schema (Section 6.4) and run `prisma migrate dev`
3. Implement env validation (`config/env.ts` with zod)
4. Implement repository layer (`user`, `token`, `role`)
5. Implement utilities (`jwt.ts`, `crypto.ts`, `validators.ts`, `tempPassword.ts`)
6. Implement `AdminService.createUser` (generate temp password, hash, queue welcome email)
7. Implement `AuthService.login` + token pair generation + `requiresPasswordChange` flag
8. Implement `AuthService.changePassword` (enforces current password, clears `must_change_password`)
9. Implement `AuthService.refresh` + rotation + family reuse detection
10. Implement `AuthService.logout` + `logoutAll`
11. Implement `AuthService.forgotPassword` + `resetPassword`
12. Implement middleware: `requireAuth`, `requireRole`, `requirePermission`, `requirePasswordChanged`
13. Wire routes + controllers for `/auth/*`
14. Implement `/users/me` GET and PATCH; `POST /users/me/change-password`
15. Implement admin routes (create user, manage users, roles, permissions)
16. Hook audit logging into all security events
17. Add rate limiter middleware to `/auth/*`
18. Write unit tests; write integration tests; verify ≥ 80% coverage
19. Add `GET /health` endpoint

### 9.2 Key Libraries

| Library | Purpose | Install |
|---|---|---|
| `express` | HTTP server | `npm i express` |
| `prisma` | ORM + migrations | `npm i -D prisma && npm i @prisma/client` |
| `argon2` | Password hashing | `npm i argon2` |
| `jsonwebtoken` | JWT sign/verify | `npm i jsonwebtoken` |
| `zod` | Env + DTO validation | `npm i zod` |
| `express-rate-limit` | Rate limiting | `npm i express-rate-limit` |
| `nodemailer` | Email sending | `npm i nodemailer` |
| `pino` + `pino-http` | Structured logging | `npm i pino pino-http` |
| `otplib` | TOTP for MFA | `npm i otplib` |
| `cookie-parser` | Parse HttpOnly cookies | `npm i cookie-parser` |
| `vitest` + `supertest` | Testing | `npm i -D vitest supertest` |
| `shadcn/ui` | Accessible component primitives (Radix UI + Tailwind) | `npx shadcn@latest init` |
| `lucide-react` | Icon set used throughout the UI | auto-installed by shadcn |

> **MSSQL for development:** Run `docker compose up -d` to start the local SQL Server container. Set `DATABASE_URL` and `SHADOW_DATABASE_URL` to point at the container (see Section 6.3). The Prisma provider is `"sqlserver"` in both dev and prod — no switch needed between environments.

---

## 10. Appendix

### 10.1 Default Seeded Roles

| Role | Description |
|---|---|
| `super_admin` | Full system access; can manage all roles, permissions, and users |
| `admin` | Can create users, manage accounts, and view audit logs; cannot modify super_admin or change own role |
| `user` | Standard authenticated user; accesses own profile and application resources |

### 10.2 Default Seeded Permissions

| Permission | Assigned To |
|---|---|
| `users:create` | admin, super_admin |
| `users:read` | admin, super_admin |
| `users:write` | admin, super_admin |
| `users:delete` | super_admin |
| `roles:read` | admin, super_admin |
| `roles:write` | super_admin |
| `permissions:write` | super_admin |
| `audit:read` | admin, super_admin |

### 10.3 JWT Payload Structure

```typescript
interface AccessTokenPayload {
  sub: string;                // user UUID
  email: string;
  roles: string[];            // e.g. ['admin', 'user']
  mustChangePassword: boolean; // drives requirePasswordChanged() middleware
  iat: number;                // issued at (Unix timestamp)
  exp: number;                // expiry (Unix timestamp)
  jti: string;                // unique token ID (UUID)
}
```

### 10.4 AppError Class

```typescript
// utils/AppError.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public statusCode: number,
    message?: string
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

// middleware/errorHandler.ts
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message }
    });
  }
  // Unexpected error — don't leak internals
  logger.error(err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }
  });
}
```

### 10.5 Key DTO Types

```typescript
// Admin creates a user
interface AdminCreateUserDto {
  email: string;          // required, valid email format
  displayName?: string;   // optional
  roles: string[];        // at least one role name, e.g. ['user']
}

// User changes their own password
interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;    // must satisfy password policy
}

// Forgot-password request
interface ForgotPasswordDto {
  email: string;
}

// Complete password reset
interface ResetPasswordDto {
  token: string;
  newPassword: string;
}

// Safe user projection returned to clients (no password hash, no internal fields)
interface ClientUser {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];            // role names, e.g. ['super_admin']
  mustChangePassword: boolean;
}

// Login result shape
interface LoginResult {
  accessToken: string;
  refreshToken: string;       // delivered via HttpOnly cookie AND used internally
  requiresPasswordChange: boolean;
  user: ClientUser;           // included so frontend can hydrate AuthContext immediately
}

// Refresh result shape (extends TokenPair)
interface RefreshResult extends TokenPair {
  user: ClientUser;           // re-hydrates AuthContext after silent refresh on page load
}
```

---

## 11. Frontend Specification

### 11.1 Tech Stack

| Concern | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite |
| Routing | React Router v6 |
| HTTP client | axios (with interceptors) |
| Forms | React Hook Form + Zod |
| State | React Context (`AuthContext`) |
| Styling | Tailwind CSS (via `@tailwindcss/vite`) |
| Component Library | shadcn/ui (Radix UI primitives + class-variance-authority) |
| Icons | lucide-react (bundled with shadcn/ui) |
| QR codes | qrcode.react |
| Dev server port | 3000 (backend on 3001) |

---

### 11.2 Route Inventory

| Route | Page | Auth required | Roles |
|---|---|---|---|
| `/login` | Login | No | — |
| `/forgot-password` | Forgot Password | No | — |
| `/reset-password?token=…` | Reset Password | No | — |
| `/change-password` | Forced Change Password | Yes (`mustChangePassword=true`) | any |
| `/mfa/setup` | MFA Setup | Yes | any |
| `/mfa/verify` | MFA Challenge | Partial (post-login state) | any |
| `/dashboard` | Dashboard | Yes | any |
| `/profile` | Profile / My Account | Yes | any |
| `/admin/users` | User Management | Yes | admin, super_admin |
| `/admin/users/:id` | User Detail | Yes | admin, super_admin |
| `/admin/roles` | Role Management | Yes | super_admin |
| `/admin/permissions` | Permission Management | Yes | super_admin |

---

### 11.3 Auth State & Token Management

- `AuthContext` holds `{ user, accessToken, isLoading }` — **in memory only**, never persisted to localStorage or sessionStorage.
- `refreshToken` lives in an HttpOnly cookie; the frontend cannot read it directly.
- **On app mount**: call `POST /api/v1/auth/refresh` silently. If 200 → populate `AuthContext`. If 401 → set `user = null` (user is logged out).
- **axios instance** (`src/lib/api.ts`): base URL `/api/v1` (proxied by Vite dev server to `http://localhost:3001`), `withCredentials: true`.
  - **Request interceptor**: attach `Authorization: Bearer <accessToken>` header when token is present.
  - **Response interceptor**: on 401 → **skip retry if the failing request URL contains `/auth/refresh`** (prevents a deadlock where the interceptor calls refresh on a failed refresh) → otherwise attempt one silent refresh → retry original request → if still 401 → clear `AuthContext` and redirect to `/login`.
- On app mount (`AuthContext useEffect`): call `POST /auth/refresh` directly (not through the interceptor retry path). If 200 → set `user` and `accessToken` from response body; set `isLoading = false`. If 401 → set `user = null`; set `isLoading = false`. The `isLoading = false` **must** be set in a `finally` block so it is always reached.
- After `POST /api/v1/auth/login`:
  - If `requiresPasswordChange === true` → navigate to `/change-password`.
  - If response is 202 with `mfaChallenge` → navigate to `/mfa/verify`.
- After `POST /api/v1/users/me/change-password`: update access token in `AuthContext`, navigate to `/dashboard`.

---

### 11.4 Route Guards

| Component | Behaviour |
|---|---|
| `<ProtectedRoute>` | Redirects to `/login` if `user` is null |
| `<PasswordChangeGuard>` | Redirects to `/change-password` if `user.mustChangePassword === true`; only `/change-password` itself is exempt |
| `<AdminRoute>` | Redirects to `/dashboard` (with 403 toast) if user lacks `admin` or `super_admin` role |

---

### 11.5 Page Specifications

#### Login (`/login`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Alert`, `AlertDescription`
- **Fields**: email (`<Input type="email">`), password (`<Input type="password">` with `Eye`/`EyeOff` lucide icon toggle), remember-me checkbox (cosmetic — session length is controlled by server-side token TTLs)
- **Submit**: `POST /api/v1/auth/login`
- **Branching**: `requiresPasswordChange` → `/change-password`; MFA challenge → `/mfa/verify`
- **Error map**:
  | Backend code | UI message |
  |---|---|
  | `INVALID_CREDENTIALS` | "Invalid email or password." |
  | `ACCOUNT_LOCKED` | "Account locked. Try again later." |
  | `ACCOUNT_DISABLED` | "Account is disabled. Contact an administrator." |
  | `429` (rate limit) | "Too many attempts. Please wait and try again." |

#### Forgot Password (`/forgot-password`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Alert`, `AlertDescription`
- **Field**: email (`<Input type="email">`)
- **Submit**: `POST /api/v1/auth/forgot-password`
- **Response**: always display "If that email is registered, a reset link has been sent." (backend returns 200 regardless)

#### Reset Password (`/reset-password`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Alert`, `AlertDescription`
- **Fields**: new password, confirm password (`<Input type="password">`); token read from `?token=` query parameter
- **Submit**: `POST /api/v1/auth/reset-password`
- **On success**: redirect to `/login?reset=success`; show a success `<Alert>` on the login page
- **Errors**: `INVALID_TOKEN` or `TOKEN_EXPIRED` → "This reset link is invalid or has expired. Request a new one."

#### Forced Change Password (`/change-password`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`
- **Fields**: current password, new password, confirm new password (`<Input type="password">` with show/hide toggle)
- **Client-side validation** (mirrors backend Zod schema): min 8 chars, at least one uppercase, lowercase, digit, and symbol
- **Submit**: `POST /api/v1/users/me/change-password`
- **On success**: store new `accessToken` in `AuthContext`, redirect to `/dashboard`

#### MFA Verify (`/mfa/verify`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Input`, `Button`
- **Field**: 6-digit TOTP code `<Input>` (auto-focus, auto-submit on 6th digit)
- **Submit**: `POST /api/v1/auth/mfa/verify`
- **On success**: finalise login, redirect to `/dashboard`

#### MFA Setup (`/mfa/setup`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Input`, `Button`, `Separator`
- **Step 1**: call `POST /api/v1/auth/mfa/setup` → receive `otpauthUri` + `secret`
- Display QR code (via `qrcode.react`) and the raw secret for manual entry with a copy `<Button variant="outline">`
- **Step 2**: user enters TOTP code `<Input>` → `POST /api/v1/auth/mfa/verify` to confirm and enable
- **Disable**: `<Button variant="destructive">` on Profile page → `POST /api/v1/auth/mfa/disable` with current TOTP code; requires `<Dialog>` confirmation

#### Profile (`/profile`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Badge`, `Switch`, `Separator`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- Display: email (read-only `<Input disabled>`), `displayName` (editable `<Input>`), assigned roles (read-only `<Badge>` list)
- **Save display name**: `PATCH /api/v1/users/me`
- **MFA section**: `<Badge>` status (Enabled/Disabled) + `<Button>` to launch Setup or Disable flow; Disable uses `<Dialog>` confirmation
- **Password section**: collapsible `<Tabs>` section reusing change-password form fields

#### Admin — User Management (`/admin/users`)
- **shadcn/ui components**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Badge`, `Button`, `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Input`, `Switch`, `Skeleton`
- **Table columns**: email, displayName, roles (`<Badge>` per role), active (`<Badge variant>`), createdAt
- **Filters**: text search `<Input>`, role `<Select>`, active/inactive `<Select>`
- **Per-row actions** (via `<DropdownMenu>`):
  | Action | Endpoint |
  |---|---|
  | Toggle active | `PATCH /api/v1/admin/users/:id` `{ isActive }` |
  | Force password reset | `POST /api/v1/admin/users/:id/force-password-reset` |
  | Unlock | `POST /api/v1/admin/users/:id/unlock` |
  | Delete | `DELETE /api/v1/admin/users/:id` — `<Dialog>` confirmation with `<Button variant="destructive">` |
- **Create User** (`<Button>` → `<Dialog>`): email `<Input>`, displayName `<Input>` (optional), role multi-`<Select>` → `POST /api/v1/admin/users`

#### Admin — User Detail (`/admin/users/:id`)
- **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Badge`, `Switch`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Separator`
- Edit `displayName` (`<Input>`), toggle `isActive` (`<Switch>`)
- **Role management**: list current roles as `<Badge>` with remove `<Button variant="ghost" size="sm">`; `<Select>` to add from available roles
- **Danger zone**: `<Button variant="destructive">` for delete, force password reset, unlock — all guarded by `<Dialog>` confirmation

#### Admin — Role Management (`/admin/roles`)
- **shadcn/ui components**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Button`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Checkbox`, `Badge`, `Input`, `Label`
- Table: name, description, permission count (using `<Table>`)
- Create / edit roles via `<Dialog>` with `<Input>` fields; delete with `<Button variant="destructive">` + confirmation `<Dialog>`
- Assign permissions: `<Checkbox>` list inside a `<Dialog>` modal → `POST`/`DELETE /api/v1/admin/roles/:id/permissions`

#### Admin — Permission Management (`/admin/permissions`)
- **shadcn/ui components**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Button`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Input`, `Label`
- Table: name, description (using `<Table>`)
- Create via inline `<Dialog>` form (`POST /api/v1/admin/permissions`); delete with `<Button variant="destructive">` + confirmation `<Dialog>` (`DELETE /api/v1/admin/permissions/:id`)

---

### 11.6 Error Handling Conventions

- All backend errors follow `{ error: { code, message } }`.
- **Inline field errors**: 400 Zod validation failures map to specific form fields.
- **Toast notifications**: used for 403 (permission denied), 429 (rate limited), 500 (server error).
- **Hard redirects**: 401 after silent refresh failure → `/login`; admin route access denied → `/dashboard`.

---

### 11.7 Security Constraints

- Access tokens stored **in memory only** — no localStorage, sessionStorage, or cookies accessible to JS.
- Refresh token is HttpOnly/SameSite=Strict — not readable by JavaScript.
- All admin actions are gated server-side; client-side checks are UX-only.
- `withCredentials: true` on every axios request ensures the refresh cookie is sent cross-origin in dev.

*— End of Document —*
