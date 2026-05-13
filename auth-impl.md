# Auth System — Implementation Plan & Todo Checklist

**Spec version:** 1.3 | **Date:** April 2026  
**Stack:** Node.js / TypeScript · Express · Prisma ORM · MSSQL (dev, local Docker container) / MSSQL (prod)  
**Reference:** `auth-system-spec.md`

---

## How to Use This File

- Work through phases in order — each phase builds on the previous.
- Check off each item as you complete it.
- File paths shown are relative to the project root.
- All functional requirements (FR-01 → FR-10) and non-functional requirements (NFR-*) are cross-referenced.

---

## Phase 1 — Project Scaffold & Configuration

### 1.1 npm & TypeScript

- [ ] Run `npm init -y` to create `package.json`
- [ ] Install runtime dependencies:
  ```
  npm i express cookie-parser argon2 jsonwebtoken zod express-rate-limit nodemailer pino pino-http otplib @prisma/client uuid
  ```
- [ ] Install dev dependencies:
  ```
  npm i -D typescript ts-node @types/express @types/node @types/jsonwebtoken @types/nodemailer @types/cookie-parser @types/uuid prisma vitest supertest @vitest/coverage-v8 @types/supertest
  ```
- [ ] Create `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "lib": ["ES2022"],
      "outDir": "./dist",
      "rootDir": "./src",
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "resolveJsonModule": true
    },
    "include": ["src/**/*"],
    "exclude": ["node_modules", "dist"]
  }
  ```
- [ ] Add `package.json` scripts:
  ```json
  {
    "dev": "ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "db:migrate": "prisma migrate dev",
    "db:seed": "ts-node prisma/seed.ts",
    "db:studio": "prisma studio"
  }
  ```
- [ ] Create `.gitignore` (node_modules, dist, .env, coverage)
- [ ] Create `vitest.config.ts` with coverage thresholds set to 80%

### 1.2 Environment Configuration

- [ ] Create `.env.example` with all variables from spec Section 6.3:
  - `DATABASE_URL` — e.g. `sqlserver://localhost:1433;database=authdev;user=sa;password=YourStrong@Password1;trustServerCertificate=true`
  - `SHADOW_DATABASE_URL` — e.g. `sqlserver://localhost:1433;database=authdev_shadow;user=sa;password=YourStrong@Password1;trustServerCertificate=true`
  - `JWT_PRIVATE_KEY` (RS256 PEM, base64 or raw)
  - `JWT_PUBLIC_KEY`
  - `JWT_ACCESS_TTL` (default: 900)
  - `REFRESH_TOKEN_TTL` (default: 604800)
  - `RATE_LIMIT_WINDOW_MS` (default: 60000)
  - `RATE_LIMIT_MAX` (default: 10)
  - `ACCOUNT_LOCK_THRESHOLD` (default: 5)
  - `ACCOUNT_LOCK_DURATION_MIN` (default: 15)
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
  - `FRONTEND_URL`
  - `LOG_LEVEL` (default: info)
  - `NODE_ENV` (default: development)
- [ ] Create `.env` for local development (copy from `.env.example`; fill in `DATABASE_URL` and `SHADOW_DATABASE_URL` pointing at the local MSSQL container)
- [ ] Generate RS256 key pair for local dev:
  ```bash
  openssl genrsa -out private.pem 2048
  openssl rsa -in private.pem -pubout -out public.pem
  ```
- [ ] Create `src/config/env.ts` — zod schema that parses and validates all env vars; throw at startup if invalid *(NFR-SEC-03)*

### 1.3 ESLint

- [ ] Install ESLint + TypeScript plugin: `npm i -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin`
- [ ] Create `eslint.config.js` (or `.eslintrc.js`) with TypeScript rules

---

## Phase 2 — Prisma Schema & Database

> **Reference:** spec Section 3 (Database Schema) and Section 6.4 (Prisma Schema)

### 2.1 Local SQL Server Container

- [ ] Create `docker-compose.yml` in the project root:
  ```yaml
  version: '3.8'
  services:
    sqlserver:
      image: mcr.microsoft.com/mssql/server:2022-latest
      environment:
        ACCEPT_EULA: "Y"
        SA_PASSWORD: "YourStrong@Password1"
      ports:
        - "1433:1433"
      volumes:
        - sqlserver_data:/var/opt/mssql
  volumes:
    sqlserver_data:
  ```
- [ ] Run `docker compose up -d` and wait for the container to be healthy (allow ~15 s for SQL Server to start)
- [ ] Create the two databases manually or via init script:
  ```bash
  docker exec -it <container> /opt/mssql-tools/bin/sqlcmd \
    -S localhost -U sa -P 'YourStrong@Password1' \
    -Q "CREATE DATABASE authdev; CREATE DATABASE authdev_shadow; CREATE DATABASE authdev_test;"
  ```
- [ ] Add `docker-compose.yml` to the project (not to `.gitignore`)

### 2.2 Prisma Init

- [ ] Run `npx prisma init` (creates `prisma/schema.prisma` and `.env` placeholder)
- [ ] Set datasource provider to `"sqlserver"` and configure `DATABASE_URL` + `SHADOW_DATABASE_URL` from `.env`

### 2.3 Define Models in `prisma/schema.prisma`

- [ ] **User** model with fields:
  - `id` (UUID, PK)
  - `email` (String, unique)
  - `passwordHash` (String)
  - `displayName` (String?)
  - `mustChangePassword` (Boolean, default true) *(FR-02)*
  - `isActive` (Boolean, default true) *(FR-03)*
  - `lockedUntil` (DateTime?) *(FR-03)*
  - `failedAttempts` (Int, default 0) *(FR-03)*
  - `mfaSecret` (String?) *(FR-03)*
  - `myBoss` (self-ref, nullable) — boss can see subordinates' records
  - `createdBy` (self-ref, nullable) *(FR-01)*
  - `createdAt`, `updatedAt`
  - Relations: `roles UserRole[]`, `refreshTokens RefreshToken[]`, `passwordResetTokens PasswordResetToken[]`, `auditLogs AuditLog[]`
- [ ] **Role** model: `id`, `name` (unique), `description`, `createdAt`
- [ ] **Permission** model: `id`, `name` (unique), `description`, `createdAt`
- [ ] **UserRole** join model: `userId`, `roleId`, `grantedAt`, `grantedBy`; composite PK `[userId, roleId]`
- [ ] **RolePermission** join model: `roleId`, `permissionId`; composite PK `[roleId, permissionId]`
- [ ] **RefreshToken** model:
  - `id`, `userId`, `tokenHash` (unique), `familyId`, `issuedAt`, `expiresAt`, `revokedAt?`, `ipAddress?`, `userAgent?` *(NFR-SEC-04)*
- [ ] **PasswordResetToken** model: `id`, `userId`, `tokenHash` (unique), `expiresAt`, `usedAt?`
- [ ] **AuditLog** model:
  - `id` (BigInt, autoincrement), `userId?`, `eventType`, `ipAddress?`, `userAgent?`, `metadata` (Json?), `createdAt`
  - Indexes: `@@index([userId])`, `@@index([eventType])`, `@@index([createdAt])` *(FR-09)*

### 2.4 Migrate & Seed

- [ ] Run `npx prisma migrate dev --name init` to apply schema (Prisma uses `SHADOW_DATABASE_URL` internally for diffing — ensure both databases exist before running)
- [ ] Create `prisma/seed.ts`:
  - Seed **3 roles**: `super_admin`, `admin`, `user` *(spec Section 10.1)*
  - Seed **8 permissions** from spec Section 10.2: `users:create`, `users:read`, `users:write`, `users:delete`, `roles:read`, `roles:write`, `permissions:write`, `audit:read`
  - Assign permissions to roles as per spec Section 10.2
  - Create initial `super_admin` user (email/password from env or hardcoded for seed only)
- [ ] Add seed script to `package.json` and run it: `npm run db:seed`
- [ ] Create `src/config/prisma.ts` — exports Prisma client singleton

---

## Phase 3 — Types, Utilities & Validators

### 3.1 Shared Types — `src/types/index.ts`

- [ ] Define `AccessTokenPayload` interface *(spec Section 10.3)*:
  ```typescript
  { sub, email, roles: string[], mustChangePassword, iat, exp, jti }
  ```
- [ ] Define DTO interfaces from spec Section 10.5:
  - `AdminCreateUserDto` — `{ email, displayName?, roles: string[] }`
  - `ChangePasswordDto` — `{ currentPassword, newPassword }`
  - `ForgotPasswordDto` — `{ email }`
  - `ResetPasswordDto` — `{ token, newPassword }`
  - `LoginDto` — `{ email, password }`
  - `ClientUser` — `{ id, email, displayName, roles: string[], mustChangePassword }` — safe projection for frontend *(NFR-SEC-07)*
  - `LoginResult` — `{ accessToken, refreshToken, requiresPasswordChange, user: ClientUser }` *(FR-03)*
  - `TokenPair` — `{ accessToken, refreshToken }`
  - `RefreshResult` — extends `TokenPair` with `user: ClientUser` *(FR-04)*
  - `UserDto` — full admin-facing user projection (no password hash) *(NFR-SEC-07)*
- [ ] Define response envelope types: `SuccessResponse<T>`, `ErrorResponse`, `PaginatedResponse<T>` *(spec Section 4.5)*
- [ ] Define `AppError` class in `src/utils/AppError.ts` *(spec Section 10.4)*:
  ```typescript
  class AppError extends Error { constructor(code, statusCode, message?) }
  ```
- [ ] Define all error codes as constants (VALIDATION_ERROR, INVALID_CREDENTIALS, TOKEN_EXPIRED, TOKEN_REVOKED, ACCOUNT_DISABLED, ACCOUNT_LOCKED, FORBIDDEN, PASSWORD_CHANGE_REQUIRED, NOT_FOUND, EMAIL_TAKEN, RATE_LIMITED, INTERNAL_ERROR) *(spec Section 4.6)*

### 3.2 Express Type Augmentation — `src/types/express.d.ts`

- [ ] Augment `Express.Request` to add `user: AccessTokenPayload`

### 3.3 JWT Utility — `src/utils/jwt.ts`

> **NFR-SEC-03:** RS256 asymmetric; keys from env only, never hardcoded

- [ ] `signAccessToken(payload: Omit<AccessTokenPayload, 'iat'|'exp'|'jti'>): string`
  - Sign with RS256 private key
  - Set `exp = JWT_ACCESS_TTL` (default 15 min)
  - Include `jti` (UUID v4)
- [ ] `verifyAccessToken(token: string): AccessTokenPayload`
  - Verify with RS256 public key
  - Throw `AppError('TOKEN_EXPIRED', 401)` on expiry
  - Throw `AppError('TOKEN_EXPIRED', 401)` on invalid signature

### 3.4 Crypto Utility — `src/utils/crypto.ts`

> **NFR-SEC-01:** argon2id hashing

- [ ] `hashPassword(password: string): Promise<string>` — argon2id with default params
- [ ] `verifyPassword(hash: string, password: string): Promise<boolean>` — argon2.verify()
- [ ] `hashToken(rawToken: string): string` — SHA-256 hex digest (for refresh tokens and reset tokens)
- [ ] `generateRefreshToken(): string` — 48 cryptographically random bytes, base64url-encoded
- [ ] `generateResetToken(): string` — 32 cryptographically random bytes, hex-encoded
- [ ] `generateTempPassword(): string` — 24 cryptographically random chars (alphanumeric + symbols) *(FR-01)*

### 3.5 Validators — `src/utils/validators.ts`

> **NFR-SEC-02:** password complexity rules

- [ ] `validateEmail(email: string): boolean` — RFC 5321 format check
- [ ] `validatePasswordComplexity(password: string): { valid: boolean; errors: string[] }`:
  - Min 8 chars, max 128 chars *(Section 7.2, prevents bcrypt DoS)*
  - At least one uppercase `[A-Z]`
  - At least one lowercase `[a-z]`
  - At least one digit `[0-9]`
  - At least one special character `[!@#$%^&*()_+\-=\[\]{}|;':\",./<>?]`
- [ ] Zod schemas for each DTO (AdminCreateUserDto, LoginDto, ChangePasswordDto, etc.) used in controllers

### 3.6 Email Utility — `src/utils/email.ts`

- [ ] Create nodemailer transporter from SMTP env vars
- [ ] `sendWelcomeEmail(to: string, displayName: string, tempPassword: string): Promise<void>` *(FR-01)*
- [ ] `sendPasswordResetEmail(to: string, resetLink: string): Promise<void>` *(FR-06)*
- [ ] All emails sent over TLS *(spec Section 7.1)*

---

## Phase 4 — Repository Layer

> Pure Prisma data access — no business logic. All multi-step ops use transactions.  
> **NFR-REL-02:** Wrap atomic operations in Prisma transactions.

### 4.1 User Repository — `src/repositories/user.repository.ts`

- [ ] `findByEmail(email: string): Promise<User | null>`
- [ ] `findById(id: string): Promise<User | null>`
- [ ] `create(data: CreateUserData): Promise<User>` — includes transaction for user + roles assignment *(FR-01)*
- [ ] `update(id: string, data: Partial<User>): Promise<User>`
- [ ] `incrementFailedAttempts(id: string): Promise<User>`
- [ ] `lockAccount(id: string, until: Date): Promise<User>`
- [ ] `resetFailedAttempts(id: string): Promise<User>`
- [ ] `findAll(page: number, limit: number): Promise<{ users: User[]; total: number }>` — paginated *(spec Section 4.3)*
- [ ] `deleteById(id: string): Promise<void>` — hard delete, `super_admin` only *(spec Section 4.3)*

### 4.2 Token Repository — `src/repositories/token.repository.ts`

- [ ] `createRefreshToken(data: CreateRefreshTokenData): Promise<RefreshToken>` — stores SHA-256 hash, never raw *(NFR-SEC-04)*
- [ ] `findRefreshToken(tokenHash: string): Promise<RefreshToken | null>`
- [ ] `revokeRefreshToken(id: string): Promise<void>` — sets `revokedAt = NOW()`
- [ ] `revokeTokenFamily(familyId: string): Promise<void>` — revokes all tokens with matching `familyId` *(FR-04)*
- [ ] `revokeAllUserTokens(userId: string): Promise<void>` — used on logout-all, password change *(FR-05, FR-02)*
- [ ] `createPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken>`
- [ ] `findPasswordResetToken(tokenHash: string): Promise<PasswordResetToken | null>` — only unexpired, unused
- [ ] `markResetTokenUsed(id: string): Promise<void>` — sets `usedAt = NOW()`

### 4.3 Role Repository — `src/repositories/role.repository.ts`

- [ ] `findAllRoles()` — include `rolePermissions: { include: { permission: true } }` so callers receive permission data without a second query; return type inferred from Prisma (not bare `Role[]`)
- [ ] `findRoleByName(name: string): Promise<Role | null>`
- [ ] `findRoleById(id: string): Promise<Role | null>`
- [ ] `createRole(name: string, description?: string): Promise<Role>`
- [ ] `updateRole(id: string, data: Partial<Role>): Promise<Role>`
- [ ] `deleteRole(id: string): Promise<void>`
- [ ] `assignRoleToUser(userId: string, roleId: string, grantedBy: string): Promise<void>`
- [ ] `revokeRoleFromUser(userId: string, roleId: string): Promise<void>`
- [ ] `getPermissionsForUser(userId: string): Promise<string[]>` — joins user_roles → role_permissions → permissions
- [ ] `findAllPermissions(): Promise<Permission[]>`
- [ ] `createPermission(name: string, description?: string): Promise<Permission>`
- [ ] `assignPermissionToRole(roleId: string, permissionId: string): Promise<void>`
- [ ] `revokePermissionFromRole(roleId: string, permissionId: string): Promise<void>`
- [ ] `getUserRoles(userId: string): Promise<Role[]>` — used to populate JWT claims

---

## Phase 5 — Service Layer

> Business logic only — calls repositories, throws `AppError` on violations.

### 5.1 Audit Service — `src/services/audit.service.ts`

> Implement first so all other services can call it.  
> **FR-09:** Events: user_created, login_success, login_failure, logout, token_refresh, password_reset_request, password_reset_complete, password_changed, role_change, permission_change, account_lock, account_enabled, account_disabled

- [ ] `log(event: AuditEventType, opts: { userId?, ip?, ua?, metadata? }): Promise<void>`
  - Insert into `audit_logs` table
  - Never throw — wrap in try/catch, log errors to pino
- [ ] Export `AuditEventType` union type with all 13 event strings

### 5.2 Token Service — `src/services/token.service.ts`

- [ ] `generateTokenPair(user: User, roles: string[], ip: string, ua: string): Promise<TokenPair>`
  - Sign access token (RS256) with payload: `{ sub, email, roles, mustChangePassword, jti }` *(spec Section 10.3)*
  - Generate raw refresh token (48 bytes, base64url)
  - Store SHA-256 hash of refresh token in `refresh_tokens` with new `familyId` (UUID v4) *(NFR-SEC-04)*
  - Return `{ accessToken, refreshToken: rawToken }`
- [ ] `rotateRefreshToken(rawToken: string, ip: string, ua: string): Promise<RefreshResult>` *(FR-04)*
  - Hash input token → lookup in DB
  - If **revoked**: call `revokeTokenFamily(familyId)` → throw `AppError('TOKEN_REVOKED', 401)` (theft detected)
  - If **expired**: throw `AppError('TOKEN_EXPIRED', 401)`
  - Revoke current token record (`revokedAt = NOW()`)
  - Fetch user + roles from DB (already available from the stored token's `userId`)
  - Issue new token pair with **same** `familyId`
  - Write audit log `token_refresh`
  - Return `{ accessToken, refreshToken, user: ClientUser }` so callers can hydrate `AuthContext`

### 5.3 Auth Service — `src/services/auth.service.ts`

> Implements FR-01 through FR-06 and FR-10.

- [ ] `login(dto: LoginDto, ip: string, ua: string): Promise<LoginResult>` *(FR-03)*
  - Find user by email (constant-time path — always run `argon2.verify` even if user not found, to prevent timing attacks)
  - Check `is_active` → 401 `ACCOUNT_DISABLED`
  - Check `locked_until` → 401 `ACCOUNT_LOCKED`
  - `argon2.verify(hash, password)`
  - **On failure:**
    - Increment `failed_attempts`
    - If `failed_attempts >= ACCOUNT_LOCK_THRESHOLD` (default 5): set `locked_until = NOW() + ACCOUNT_LOCK_DURATION_MIN`
    - Audit log `login_failure` (or `account_lock`)
    - Throw 401 `INVALID_CREDENTIALS`
  - **On success:**
    - Reset `failed_attempts = 0`, clear `locked_until`
    - Call `tokenService.generateTokenPair(user, roles, ip, ua)`
    - Audit log `login_success`
    - Return `{ accessToken, refreshToken, requiresPasswordChange, user: ClientUser }`
- [ ] `changePassword(userId: string, dto: ChangePasswordDto): Promise<TokenPair>` *(FR-02)*
  - Verify `currentPassword` with `argon2.verify`; throw 401 `INVALID_CREDENTIALS` if wrong
  - Validate `newPassword` complexity *(NFR-SEC-02)*
  - Hash new password with argon2id *(NFR-SEC-01)*
  - Update `password_hash`; set `must_change_password = false`
  - Revoke ALL refresh tokens for user *(tokenRepo.revokeAllUserTokens)*
  - Issue new `TokenPair`
  - Audit log `password_changed`
  - Return new `TokenPair`
- [ ] `refresh(rawToken: string, ip: string, ua: string): Promise<RefreshResult>` *(FR-04)*
  - Delegate to `tokenService.rotateRefreshToken(rawToken, ip, ua)` and return its `RefreshResult` (includes `user`)
- [ ] `logout(userId: string, rawToken: string): Promise<void>` *(FR-05)*
  - Hash token → revoke in DB
  - Audit log `logout`
- [ ] `logoutAll(userId: string): Promise<void>` *(FR-05)*
  - `tokenRepo.revokeAllUserTokens(userId)`
  - Audit log `logout`
- [ ] `forgotPassword(email: string): Promise<void>` *(FR-06)*
  - Always return void regardless of whether email exists (anti-enumeration) *(spec Section 7.1)*
  - If user found:
    - Generate reset token (32 random bytes hex)
    - Store SHA-256 hash with `expiresAt = NOW() + 1h`
    - Queue `sendPasswordResetEmail(email, ${FRONTEND_URL}/reset-password?token=<rawToken>)`
    - Audit log `password_reset_request`
- [ ] `resetPassword(token: string, newPassword: string): Promise<void>` *(FR-06)*
  - SHA-256 hash the token
  - Find unexpired, unused record — throw 401 if not found (constant-time)
  - Mark token as used (`used_at = NOW()`)
  - Validate `newPassword` complexity
  - Hash new password with argon2id
  - Update `password_hash`; set `must_change_password = false`
  - Revoke ALL refresh tokens for user
  - Audit log `password_reset_complete`

### 5.4 Admin Service — `src/services/admin.service.ts`

- [ ] `createUser(dto: AdminCreateUserDto, actorId: string): Promise<UserDto>` *(FR-01)*
  - Validate email uniqueness → 409 `EMAIL_TAKEN`
  - Generate 24-char temp password (`generateTempPassword()`)
  - Hash with argon2id
  - Create user with `must_change_password = true`, `created_by = actorId` — in a **single transaction** with role assignment
  - Queue `sendWelcomeEmail(email, displayName, tempPassword)`
  - Audit log `user_created` with `{ createdBy: actorId, roles }`
  - Return `UserDto` (no password hash) *(NFR-SEC-07)*
- [ ] `listUsers(page: number, limit: number): Promise<PaginatedResponse<UserDto>>`
- [ ] `getUserById(id: string): Promise<UserDto>` — 404 if not found
- [ ] `updateUser(id: string, data: { isActive?: boolean; displayName?: string }): Promise<UserDto>` *(spec Section 4.3)*
  - If `isActive` changes: audit log `account_enabled` or `account_disabled`
- [ ] `deleteUser(id: string): Promise<void>` — hard delete, `super_admin` only *(spec Section 4.3)*
- [ ] `assignRole(userId: string, roleId: string, actorId: string): Promise<void>` *(FR-07)*
  - Audit log `role_change`
- [ ] `revokeRole(userId: string, roleId: string, actorId: string): Promise<void>` *(FR-07)*
  - Audit log `role_change`
- [ ] `unlockAccount(userId: string): Promise<void>` — clear `locked_until`, `failed_attempts`; audit log `account_enabled`
- [ ] `forcePasswordReset(userId: string, actorId: string): Promise<void>` — set `must_change_password = true`; revoke all sessions; audit log

### 5.5 Role Service — `src/services/role.service.ts`

- [ ] `getPermissionsForUser(userId: string): Promise<string[]>` — used by `requirePermission()` middleware *(FR-08)*
- [ ] `listRoles(): Promise<Role[]>`
- [ ] `createRole(name: string, description?: string): Promise<Role>` *(FR-07)* — audit log `permission_change`
- [ ] `updateRole(id: string, data: Partial<Role>): Promise<Role>`
- [ ] `deleteRole(id: string): Promise<void>`
- [ ] `listPermissions(): Promise<Permission[]>`
- [ ] `createPermission(name: string, description?: string): Promise<Permission>`
- [ ] `assignPermissionToRole(roleId: string, permissionId: string): Promise<void>` — audit log `permission_change`
- [ ] `revokePermissionFromRole(roleId: string, permissionId: string): Promise<void>` — audit log `permission_change`

---

## Phase 6 — Middleware

### 6.1 Authentication — `src/middleware/authenticate.ts`

> **FR-08:** `requireAuth()`

- [ ] Extract Bearer token from `Authorization` header
- [ ] Call `verifyAccessToken(token)` → attach result to `req.user`
- [ ] On missing token: `next(new AppError('TOKEN_MISSING', 401))`
- [ ] On invalid/expired: `next(new AppError('TOKEN_EXPIRED', 401))`

### 6.2 Authorization — `src/middleware/authorize.ts`

> **FR-08:** `requireRole()`, `requirePermission()`

- [ ] `requireRole(...roles: string[]): RequestHandler`
  - Check `req.user.roles` contains any of the required roles
  - Throw 403 `FORBIDDEN` if not
- [ ] `requirePermission(permission: string): RequestHandler`
  - Call `roleService.getPermissionsForUser(req.user.sub)`
  - Throw 403 `FORBIDDEN` if permission not in set

### 6.3 Password Change Enforcement — `src/middleware/passwordChanged.ts`

> **FR-02:** Applied globally after `requireAuth()`, exempt only `POST /users/me/change-password`

- [ ] `requirePasswordChanged(): RequestHandler`
  - If `req.user.mustChangePassword === true` → `next(new AppError('PASSWORD_CHANGE_REQUIRED', 403))`

### 6.4 Rate Limiter — `src/middleware/rateLimiter.ts`

> **NFR-SEC-05:** 10 req/min per IP on all `/auth/*` routes

- [ ] Configure `express-rate-limit`:
  - `windowMs = RATE_LIMIT_WINDOW_MS` (default 60000)
  - `max = RATE_LIMIT_MAX` (default 10)
  - Custom handler: respond 429 `RATE_LIMITED` in error envelope format
- [ ] Export `authRateLimiter` for use on auth router

### 6.5 Request Logger — `src/middleware/requestLogger.ts`

> **NFR-OPS-02:** Structured JSON logs with pino

- [ ] Configure `pino-http` with `LOG_LEVEL` from env
- [ ] Add correlation ID (UUID v4) to each request and include in log
- [ ] Ensure no sensitive data (passwords, tokens) leaked in logs *(NFR-SEC-07)*

### 6.6 Error Handler — `src/middleware/errorHandler.ts`

> **spec Section 10.4**

- [ ] `errorHandler(err, req, res, next)` — 4-arg Express error middleware
  - If `AppError`: respond `{ success: false, error: { code, message } }` with `err.statusCode`
  - Else: log with pino, respond 500 `INTERNAL_ERROR`
  - Never include stack traces or internal details in response *(NFR-SEC-07)*

---

## Phase 7 — Auth Routes & Controllers

### 7.1 Express App — `src/app.ts`

- [ ] Create Express app factory function
- [ ] Register `cookie-parser` middleware
- [ ] Register `requestLogger` middleware
- [ ] Register `authRateLimiter` on `/api/v1/auth/*`
- [ ] Mount routes: `/api/v1/auth`, `/api/v1/users`, `/api/v1/admin`
- [ ] Register `errorHandler` middleware last
- [ ] `GET /health` → `{ status: 'ok', db: 'connected' | 'error' }` *(NFR-OPS-01)*

### 7.2 Server Entry Point — `src/server.ts`

- [ ] Connect Prisma client with exponential back-off retry *(NFR-REL-01)*
- [ ] Listen on configured PORT
- [ ] Graceful shutdown on SIGTERM/SIGINT

### 7.3 Auth Controller — `src/controllers/auth.controller.ts`

- [ ] `POST /auth/login` *(FR-03)*
  - Parse `LoginDto`; call `authService.login(dto, ip, ua)`
  - Set refresh token as HttpOnly + Secure + SameSite=Strict cookie *(NFR-SEC-06)*
  - Return `{ success: true, data: { accessToken, requiresPasswordChange, user: ClientUser } }`
- [ ] `POST /auth/refresh` *(FR-04)*
  - Read refresh token from cookie
  - Call `authService.refresh(rawToken, ip, ua)`
  - Rotate cookie; return `{ success: true, data: { accessToken, user: ClientUser } }`
- [ ] `POST /auth/logout` — `requireAuth()` *(FR-05)*
  - Call `authService.logout(userId, rawToken)` 
  - Clear cookie; return 200
- [ ] `POST /auth/logout-all` — `requireAuth()` *(FR-05)*
  - Call `authService.logoutAll(userId)`
  - Clear cookie; return 200
- [ ] `POST /auth/forgot-password` *(FR-06)*
  - Call `authService.forgotPassword(email)`
  - Always return 200 (anti-enumeration)
- [ ] `POST /auth/reset-password` *(FR-06)*
  - Call `authService.resetPassword(token, newPassword)`
  - Return 200 on success
- [ ] `POST /auth/mfa/setup` — `requireAuth()` *(FR-03 optional)*
  - Generate TOTP secret with `otplib`
  - Store encrypted in `mfa_secret`
  - Return QR code URI
- [ ] `POST /auth/mfa/verify` — `requireAuth()` *(FR-03 optional)*
  - Verify TOTP code; activate MFA
- [ ] `POST /auth/mfa/disable` — `requireAuth()` *(FR-03 optional)*
  - Require current password; clear `mfa_secret`

### 7.4 Auth Router — `src/routes/auth.routes.ts`

- [ ] Wire all auth controller handlers to their paths
- [ ] Apply `authRateLimiter` to entire auth router

---

## Phase 8 — User Profile Routes & Controllers

### 8.1 User Controller — `src/controllers/user.controller.ts`

- [ ] `GET /users/me` — `requireAuth()` + `requirePasswordChanged()` *(FR-10)*
  - Return `UserDto` (id, email, displayName, roles, mustChangePassword, createdAt)
- [ ] `PATCH /users/me` — `requireAuth()` + `requirePasswordChanged()` *(FR-10)*
  - Update `displayName` only; validate input
- [ ] `POST /users/me/change-password` — `requireAuth()` *(FR-02)*
  - **Exempt from `requirePasswordChanged()`**
  - Call `authService.changePassword(userId, dto)`
  - Rotate cookie with new refresh token; return new access token

### 8.2 User Router — `src/routes/user.routes.ts`

- [ ] Mount `requireAuth()` on entire user router
- [ ] Apply `requirePasswordChanged()` to GET and PATCH /me
- [ ] **Exempt** `POST /me/change-password` from `requirePasswordChanged()`

---

## Phase 9 — Admin Routes & Controllers

### 9.1 Admin Controller — `src/controllers/admin.controller.ts`

#### User Management

- [ ] `POST /admin/users` — `requireRole('admin', 'super_admin')` *(FR-01)*
  - Validate `AdminCreateUserDto`; call `adminService.createUser(dto, req.user.sub)`
  - Return 201 + `UserDto`
- [ ] `GET /admin/users` — `requireRole('admin', 'super_admin')` + pagination *(spec Section 4.3)*
  - Parse `page` and `limit` query params
  - Return paginated `UserDto[]` with meta
- [ ] `GET /admin/users/:id` — `requireRole('admin', 'super_admin')`
  - Return `UserDto` or 404
- [ ] `PATCH /admin/users/:id` — `requireRole('admin', 'super_admin')`
  - Update `isActive` and/or `displayName`
- [ ] `DELETE /admin/users/:id` — `requireRole('super_admin')` *(spec Section 4.3)*
  - Hard delete user
- [ ] `POST /admin/users/:id/roles` — `requireRole('admin', 'super_admin')` *(FR-07)*
  - Assign role to user; audit log `role_change`
- [ ] `DELETE /admin/users/:id/roles/:roleId` — `requireRole('admin', 'super_admin')` *(FR-07)*
  - Revoke role from user; audit log `role_change`
- [ ] `POST /admin/users/:id/unlock` — `requireRole('admin', 'super_admin')` *(FR-03)*
  - Unlock locked account
- [ ] `POST /admin/users/:id/force-password-reset` — `requireRole('admin', 'super_admin')` *(spec Section 4.3)*
  - Force `must_change_password = true`; revoke all sessions

#### Roles & Permissions Management

- [ ] `GET /admin/roles` — `requireRole('admin', 'super_admin')` *(FR-07)*
- [ ] `POST /admin/roles` — `requireRole('super_admin')` *(FR-07)*
- [ ] `PATCH /admin/roles/:id` — `requireRole('super_admin')` *(FR-07)*
- [ ] `DELETE /admin/roles/:id` — `requireRole('super_admin')` *(FR-07)*
- [ ] `GET /admin/permissions` — `requireRole('admin', 'super_admin')` *(FR-07)*
- [ ] `POST /admin/permissions` — `requireRole('super_admin')` *(FR-07)*
- [ ] `POST /admin/roles/:id/permissions` — `requireRole('super_admin')` *(FR-07)*
- [ ] `DELETE /admin/roles/:id/permissions/:permId` — `requireRole('super_admin')` *(FR-07)*

### 9.2 Admin Router — `src/routes/admin.routes.ts`

- [ ] Apply `requireAuth()` to entire admin router
- [ ] Apply `requirePasswordChanged()` to entire admin router
- [ ] Wire all admin controller handlers

---

## Phase 10 — Testing

> **NFR-TEST-01:** Unit + integration tests. **NFR-TEST-02:** ≥ 80% line coverage.

### 10.1 Unit Tests (Vitest)

- [ ] `tests/unit/utils/validators.test.ts`
  - Email validation (valid, invalid formats)
  - Password complexity (pass/fail for each rule: length, upper, lower, digit, symbol)
  - Max length 128 enforced
- [ ] `tests/unit/utils/crypto.test.ts`
  - `hashPassword` → `verifyPassword` round-trip
  - `hashToken` is deterministic (same input = same SHA-256)
  - `generateRefreshToken` produces 64+ char base64url strings
  - `generateTempPassword` meets length and charset requirements
- [ ] `tests/unit/utils/jwt.test.ts`
  - `signAccessToken` → `verifyAccessToken` round-trip
  - Expired token throws `AppError('TOKEN_EXPIRED', 401)`
  - Invalid signature throws appropriate error
  - `jti` and `exp` present in decoded payload
- [ ] `tests/unit/services/auth.service.test.ts` (mock repositories)
  - Login: success path, wrong password, disabled account, locked account, 5th failure triggers lock
  - Change password: valid, wrong current password, weak new password
  - Refresh: valid rotation, revoked token triggers family revocation
  - ForgotPassword: user exists (email queued), user not found (silent)
  - ResetPassword: valid token, expired token, already-used token
- [ ] `tests/unit/services/token.service.test.ts`
  - Token pair generation stores hash (not raw) in DB
  - Family reuse detection: presenting revoked token revokes entire family
- [ ] `tests/unit/services/role.service.test.ts`
  - `getPermissionsForUser` returns correct permissions via role hierarchy
- [ ] `tests/unit/services/admin.service.test.ts`
  - Create user: success (temp password generated, welcome email queued, audit logged)
  - Create user: duplicate email → 409
  - forcePasswordReset: sets flag, revokes sessions

### 10.2 Integration Tests (Supertest)

> Use the `authdev_test` database on the local MSSQL Docker container. Override `DATABASE_URL` to point at `authdev_test` in the test environment. Run `prisma migrate deploy` once in global test setup to apply the schema. Truncate all tables (not drop) between test suites to avoid re-migrating.

- [ ] `tests/integration/auth/login.test.ts`
  - `POST /api/v1/auth/login` — valid credentials → 200 + access_token + cookie
  - Wrong password → 401 `INVALID_CREDENTIALS`
  - 5 wrong attempts → 401 `ACCOUNT_LOCKED` on 6th
  - Disabled account → 401 `ACCOUNT_DISABLED`
  - First login → `requiresPasswordChange: true` in response
- [ ] `tests/integration/auth/change-password.test.ts`
  - With `mustChangePassword = true`: other routes blocked → 403 `PASSWORD_CHANGE_REQUIRED`
  - `POST /users/me/change-password` succeeds → `mustChangePassword = false`; old sessions revoked; new tokens returned
- [ ] `tests/integration/auth/refresh.test.ts`
  - Valid refresh → 200 + new access token + rotated cookie
  - Replay revoked refresh token → 401 `TOKEN_REVOKED`; family revoked
  - Expired token → 401 `TOKEN_EXPIRED`
- [ ] `tests/integration/auth/logout.test.ts`
  - `POST /auth/logout` → cookie cleared; token revoked
  - `POST /auth/logout-all` → all sessions revoked
- [ ] `tests/integration/auth/password-reset.test.ts`
  - Full forgot-password → reset-password flow succeeds
  - Old sessions revoked after reset; login with new password works
  - Unknown email returns 200 (anti-enumeration)
- [ ] `tests/integration/users/profile.test.ts`
  - `GET /users/me` → returns user object without password hash
  - `PATCH /users/me` → updates displayName
  - Unauthenticated → 401
- [ ] `tests/integration/admin/users.test.ts`
  - Admin creates user → 201 + `must_change_password = true`
  - Duplicate email → 409 `EMAIL_TAKEN`
  - Non-admin → 403 `FORBIDDEN`
  - Admin lists, gets, updates, unlocks users
  - `super_admin` hard-deletes user; admin gets 403
- [ ] `tests/integration/admin/roles.test.ts`
  - CRUD on roles (super_admin only for write)
  - Assign/revoke permissions to roles
  - List roles (admin+ can read)
- [ ] `tests/integration/middleware/rate-limit.test.ts`
  - 11th request in 60s window → 429 `RATE_LIMITED` on auth routes
- [ ] `tests/integration/audit/audit-log.test.ts`
  - Verify audit log entries created for: login, logout, password_changed, user_created, role_change
- [ ] Configure `vitest.config.ts` to enforce `--coverage` threshold of 80% lines

---

## Phase 11 — Health, Ops & Final Polish

### 11.1 Health Endpoint

- [ ] `GET /health` → check Prisma connection with `prisma.$queryRaw\`SELECT 1\``
  - Return 200 `{ status: 'ok', db: 'connected' }` or 503 `{ status: 'error', db: 'disconnected' }` *(NFR-OPS-01)*

### 11.2 DB Connection Retry

- [ ] In `server.ts`: wrap `prisma.$connect()` in exponential back-off retry loop (max 5 attempts) *(NFR-REL-01)*

### 11.3 Graceful Shutdown

- [ ] Handle `SIGTERM` / `SIGINT`: close HTTP server, disconnect Prisma

### 11.4 Audit Log Retention (Optional)

- [ ] `scripts/purge-audit-logs.ts` — delete `audit_logs` older than `AUDIT_RETENTION_DAYS` (default 90) *(FR-09)*
- [ ] Run as cron job (e.g., nightly)

### 11.5 Security Hardening Final Checks

- [ ] Confirm no password hashes or raw tokens appear in any API responses *(NFR-SEC-07)*
- [ ] Confirm no raw tokens appear in pino logs *(NFR-SEC-07)*
- [ ] Confirm RS256 keys read from env, never hardcoded *(NFR-SEC-03)*
- [ ] Confirm HttpOnly + Secure + SameSite=Strict on refresh token cookie *(NFR-SEC-06)*
- [ ] Confirm `Authorization` header stripped from pino request logs
- [ ] Confirm max password length 128 enforced (prevents long-password DoS) *(spec Section 7.1)*

---

## Quick Reference — Functional Requirements Coverage

| FR | Description | Key Files |
|---|---|---|
| FR-01 | Admin-provisioned user creation | `admin.service.ts`, `admin.controller.ts`, `email.ts` |
| FR-02 | Forced password change on first login | `auth.service.ts`, `passwordChanged.ts`, `user.routes.ts` |
| FR-03 | Login / authentication + lockout | `auth.service.ts`, `auth.controller.ts` |
| FR-04 | Token refresh + rotation + family reuse | `token.service.ts`, `token.repository.ts` |
| FR-05 | Logout + logout-all | `auth.service.ts`, `auth.controller.ts` |
| FR-06 | Password reset via email | `auth.service.ts`, `email.ts` |
| FR-07 | Role & permission management | `role.service.ts`, `admin.controller.ts` |
| FR-08 | Authorization middleware | `authenticate.ts`, `authorize.ts` |
| FR-09 | Audit logging | `audit.service.ts` (all services call this) |
| FR-10 | User profile GET/PATCH | `user.controller.ts`, `user.routes.ts` |

## Quick Reference — Non-Functional Requirements Coverage

| NFR | Description | Where Implemented |
|---|---|---|
| NFR-SEC-01 | argon2id password hashing | `crypto.ts` → `hashPassword()` |
| NFR-SEC-02 | Password complexity ≥ 8 chars, upper+lower+digit+symbol | `validators.ts` → `validatePasswordComplexity()` |
| NFR-SEC-03 | RS256 JWT with keys in env | `jwt.ts`, `config/env.ts` |
| NFR-SEC-04 | Refresh tokens stored as SHA-256 hash | `token.repository.ts` → `createRefreshToken()` |
| NFR-SEC-05 | Rate limit 10 req/min per IP on `/auth/*` | `rateLimiter.ts` |
| NFR-SEC-06 | HttpOnly + Secure + SameSite=Strict cookie | `auth.controller.ts` (cookie options) |
| NFR-SEC-07 | No sensitive data in responses or logs | `errorHandler.ts`, `requestLogger.ts`, `UserDto` |
| NFR-PERF-01 | < 300 ms p95 under 100 concurrent users | Monitor in load test |
| NFR-REL-01 | DB retry with exponential back-off | `server.ts` |
| NFR-REL-02 | Atomic ops in transactions | All repositories for multi-step writes |
| NFR-OPS-01 | `GET /health` with DB status | `app.ts` |
| NFR-OPS-02 | Structured JSON logs via pino | `requestLogger.ts` |
| NFR-TEST-01 | Unit + integration tests for all services/endpoints | `tests/` |
| NFR-TEST-02 | ≥ 80% line coverage | `vitest.config.ts` |

---

## File Creation Checklist (All Files to Create)

### Config & Root
- [ ] `docker-compose.yml`
- [ ] `package.json`
- [ ] `tsconfig.json`
- [ ] `vitest.config.ts`
- [ ] `.env.example`
- [ ] `.env`
- [ ] `.gitignore`
- [ ] `eslint.config.js`

### Prisma
- [ ] `prisma/schema.prisma`
- [ ] `prisma/seed.ts`

### Source
- [ ] `src/server.ts`
- [ ] `src/app.ts`
- [ ] `src/config/env.ts`
- [ ] `src/config/prisma.ts`
- [ ] `src/types/index.ts`
- [ ] `src/types/express.d.ts`
- [ ] `src/utils/AppError.ts`
- [ ] `src/utils/jwt.ts`
- [ ] `src/utils/crypto.ts`
- [ ] `src/utils/email.ts`
- [ ] `src/utils/validators.ts`
- [ ] `src/repositories/user.repository.ts`
- [ ] `src/repositories/token.repository.ts`
- [ ] `src/repositories/role.repository.ts`
- [ ] `src/services/audit.service.ts`
- [ ] `src/services/token.service.ts`
- [ ] `src/services/auth.service.ts`
- [ ] `src/services/admin.service.ts`
- [ ] `src/services/role.service.ts`
- [ ] `src/middleware/authenticate.ts`
- [ ] `src/middleware/authorize.ts`
- [ ] `src/middleware/passwordChanged.ts`
- [ ] `src/middleware/rateLimiter.ts`
- [ ] `src/middleware/requestLogger.ts`
- [ ] `src/middleware/errorHandler.ts`
- [ ] `src/controllers/auth.controller.ts`
- [ ] `src/controllers/user.controller.ts`
- [ ] `src/controllers/admin.controller.ts`
- [ ] `src/routes/auth.routes.ts`
- [ ] `src/routes/user.routes.ts`
- [ ] `src/routes/admin.routes.ts`

### Tests
- [ ] `tests/unit/utils/validators.test.ts`
- [ ] `tests/unit/utils/crypto.test.ts`
- [ ] `tests/unit/utils/jwt.test.ts`
- [ ] `tests/unit/services/auth.service.test.ts`
- [ ] `tests/unit/services/token.service.test.ts`
- [ ] `tests/unit/services/role.service.test.ts`
- [ ] `tests/unit/services/admin.service.test.ts`
- [ ] `tests/integration/auth/login.test.ts`
- [ ] `tests/integration/auth/change-password.test.ts`
- [ ] `tests/integration/auth/refresh.test.ts`
- [ ] `tests/integration/auth/logout.test.ts`
- [ ] `tests/integration/auth/password-reset.test.ts`
- [ ] `tests/integration/users/profile.test.ts`
- [ ] `tests/integration/admin/users.test.ts`
- [ ] `tests/integration/admin/roles.test.ts`
- [ ] `tests/integration/middleware/rate-limit.test.ts`
- [ ] `tests/integration/audit/audit-log.test.ts`

### Optional
- [ ] `scripts/purge-audit-logs.ts`

---

## Phase 12 — Frontend Scaffold

> **Reference:** spec §11.1, §11.3, §11.4

### 12.1 Project Setup

- [ ] Create Vite + React + TypeScript project: `npm create vite@latest frontend -- --template react-ts`
- [ ] Install runtime deps:
  ```
  npm i react-router-dom axios react-hook-form zod @hookform/resolvers tailwindcss @tailwindcss/vite qrcode.react lucide-react
  npm i -D @types/qrcode.react
  ```
- [ ] Configure Tailwind CSS via `@tailwindcss/vite` plugin in `vite.config.ts`
- [ ] Init shadcn/ui — run `npx shadcn@latest init` (select: TypeScript = yes, CSS variables = yes; shadcn will inject CSS variable definitions into `src/index.css` and create `src/lib/utils.ts` with `cn()`)
- [ ] Add all required shadcn/ui components:
  ```
  npx shadcn@latest add button input label form card table dialog badge alert \
    select checkbox switch separator tabs dropdown-menu skeleton sonner
  ```
- [ ] Confirm `src/lib/utils.ts` exports `cn()` (created automatically by shadcn init)
- [ ] Confirm `src/components/ui/` directory was created with the component files above
- [ ] Add `<Toaster />` (from `sonner`) to `src/main.tsx` or `src/App.tsx` so toasts are available globally
- [ ] Add Vite dev server proxy in `vite.config.ts`:
  ```ts
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:3001' }
  }
  ```
- [ ] Add `"dev": "vite"` and `"build": "tsc -b && vite build"` scripts to `frontend/package.json`

### 12.2 HTTP Client (`src/lib/api.ts`)

- [ ] Create axios instance with `baseURL: '/api/v1'` and `withCredentials: true`
- [ ] Request interceptor: attach `Authorization: Bearer <token>` when `AuthContext` has an access token
- [ ] Response interceptor: on 401 →
  - **Skip retry entirely if the failing request URL contains `/auth/refresh`** (prevents infinite deadlock: refresh 401 → retry refresh → repeat)
  - Otherwise: attempt one silent refresh (`POST /auth/refresh`) → retry original request with new token
  - If refresh itself fails or retry still 401 → clear `AuthContext` and `window.location.href = '/login'`
  - Use `isRefreshing` flag + subscriber queue to serialise concurrent 401s into a single refresh call

### 12.3 AuthContext (`src/contexts/AuthContext.tsx`)

- [ ] Define `AuthUser` type: `{ id, email, displayName, roles: string[], mustChangePassword }` — matches `ClientUser` from backend
- [ ] Context state: `{ user: AuthUser | null, accessToken: string | null, isLoading: boolean }`
- [ ] Methods: `login(email, password)`, `logout()`, `refreshTokenSilently()`
- [ ] `login()`: call `POST /auth/login`; set `user` and `accessToken` from **response body** (`data.user`, `data.accessToken`) — do not decode JWT client-side
- [ ] `refreshTokenSilently()`: call `POST /auth/refresh`; set `user` and `accessToken` from response body; return `true`/`false`
- [ ] On mount: call `refreshTokenSilently()` in a `useEffect`; set `isLoading = false` in the `finally` block so it **always** executes regardless of success/failure
- [ ] `logout()` calls `POST /api/v1/auth/logout` then clears state

### 12.4 Route Guards

- [ ] `<ProtectedRoute>` — if `isLoading` show full-page `<Skeleton>` (shadcn); if no user redirect to `/login`
- [ ] `<PasswordChangeGuard>` — if `user.mustChangePassword` redirect to `/change-password`
- [ ] `<AdminRoute>` — if user lacks `admin`/`super_admin` role show 403 page or redirect to `/dashboard`

### 12.5 App Router (`src/App.tsx`)

- [ ] Define all routes from spec §11.2 wrapped in appropriate guards
- [ ] Public routes (no guard): `/login`, `/forgot-password`, `/reset-password`
- [ ] Authenticated routes (ProtectedRoute + PasswordChangeGuard): `/dashboard`, `/profile`, `/mfa/*`
- [ ] Admin routes (AdminRoute): `/admin/*`
- [ ] `/change-password` wrapped in ProtectedRoute only (exempt from PasswordChangeGuard)

---

## Phase 13 — Auth Pages

> **Reference:** spec §11.5 (Login, Forgot Password, Reset Password)

### 13.1 Login Page (`src/pages/LoginPage.tsx`)

- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Alert`, `AlertDescription`
- [ ] Form: `<Input type="email">`, `<Input type="password">` with `Eye`/`EyeOff` lucide icon toggle inside the input wrapper, `<Button type="submit">`
- [ ] Use React Hook Form + Zod schema (email required, password required); wire via shadcn `<Form>` + `<FormField>` for automatic `FormMessage` error display
- [ ] On submit: call `login()` from `AuthContext`
  - `requiresPasswordChange` → navigate to `/change-password`
  - MFA challenge → navigate to `/mfa/verify` passing challenge state
- [ ] Display mapped error message from spec §11.5 error table inside `<Alert variant="destructive">`
- [ ] Show rate-limit `toast.error()` (sonner) on 429

### 13.2 Forgot Password Page (`src/pages/ForgotPasswordPage.tsx`)

- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Alert`, `AlertDescription`
- [ ] Form: `<Input type="email">`, `<Button type="submit">`
- [ ] Submit: `POST /api/v1/auth/forgot-password`
- [ ] Always display: "If that email is registered, a reset link has been sent." in `<Alert>` regardless of response

### 13.3 Reset Password Page (`src/pages/ResetPasswordPage.tsx`)

- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Alert`, `AlertDescription`
- [ ] Read `token` from URL query string (`useSearchParams`)
- [ ] Form: `<Input type="password">` for new password + confirm; validate they match and meet complexity rules via Zod + `<FormMessage>`
- [ ] Submit: `POST /api/v1/auth/reset-password` with `{ token, newPassword }`
- [ ] On success: navigate to `/login?reset=success`; login page shows `<Alert>` success banner when param present
- [ ] On error: display "Reset link is invalid or has expired." in `<Alert variant="destructive">`

---

## Phase 14 — Password Change & MFA Pages

> **Reference:** spec §11.5 (Change Password, MFA Setup, MFA Verify)

### 14.1 Change Password Page (`src/pages/ChangePasswordPage.tsx`)

- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`
- [ ] Form: `<Input type="password">` for current, new, and confirm fields — each with `Eye`/`EyeOff` lucide icon toggle
- [ ] Client-side Zod validation: min 8 chars, uppercase, lowercase, digit, symbol; errors shown via `<FormMessage>`
- [ ] Submit `<Button>` shows `<Loader2 className="animate-spin">` (lucide) while pending
- [ ] Submit: `POST /api/v1/users/me/change-password`
- [ ] On success: update `accessToken` in `AuthContext`, set `mustChangePassword = false`, navigate to `/dashboard`

### 14.2 MFA Setup Page (`src/pages/MfaSetupPage.tsx`)

- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Input`, `Button`, `Separator`
- [ ] On mount: `POST /api/v1/auth/mfa/setup` → receive `{ otpauthUri, secret }`
- [ ] Render QR code using `<QRCodeSVG value={otpauthUri} />`
- [ ] Show raw `secret` for manual entry with `<Button variant="outline" size="sm">` copy button using `Copy` lucide icon
- [ ] `<Separator>` between QR section and code entry section
- [ ] Form: `<Input>` for 6-digit TOTP code → `POST /api/v1/auth/mfa/verify` to confirm
- [ ] On success: navigate to `/dashboard` with `toast.success("MFA enabled")` (sonner)

### 14.3 MFA Verify Page (`src/pages/MfaVerifyPage.tsx`)

- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Input`, `Button`
- [ ] `<Input>` (auto-focus, `maxLength={6}`); auto-submit via `onChange` when 6 digits entered
- [ ] Submit: `POST /api/v1/auth/mfa/verify`
- [ ] On success: store token from response, navigate to `/dashboard`
- [ ] Error: display "Invalid code. Please try again." via `toast.error()` (sonner)

---

## Phase 15 — Profile Page

> **Reference:** spec §11.5 (Profile)

- [ ] `src/pages/ProfilePage.tsx`
- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Badge`, `Switch`, `Separator`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- [ ] Use `<Tabs>` to organise sections: "Account", "Security" (password change), "MFA"
- [ ] Display: email as `<Input disabled>`, displayName as editable `<Input>`; assigned roles as `<Badge>` list
- [ ] Save display name: `PATCH /api/v1/users/me`; show `toast.success()` (sonner) on save
- [ ] **MFA section**: `<Badge>` status + conditional `<Button>`:
  - If disabled → `<Button>` "Enable MFA" → navigate to `/mfa/setup`
  - If enabled → `<Button variant="destructive">` "Disable MFA" → `<Dialog>` confirmation with TOTP `<Input>` → `POST /api/v1/auth/mfa/disable`
- [ ] **Password section**: change-password form fields reused inside the "Security" `<TabsContent>`

---

## Phase 16 — Admin: User Management

> **Reference:** spec §11.5 (Admin — User Management, User Detail)

### 16.1 User List (`src/pages/admin/AdminUsersPage.tsx`)

- [ ] **shadcn/ui components**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Badge`, `Button`, `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuTrigger`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Input`, `Switch`, `Skeleton`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`
- [ ] Fetch: `GET /api/v1/admin/users` — response shape: `{ success, data: UserDto[], meta }` where `data` is a **flat array** (not `{ users: [] }`); each `UserDto.roles` is `string[]` (role names), not nested objects
- [ ] While fetching: render `<Skeleton>` rows in place of table body
- [ ] Table columns: email (`<Button variant="link">`), displayName, roles (`<Badge>` per role), active (`<Badge variant>` green/red), createdAt
- [ ] Filters: text `<Input>`, role `<Select>`, active `<Select>`
- [ ] Per-row actions via `<DropdownMenu>` (triggered by `<MoreHorizontal>` lucide icon `<Button variant="ghost" size="icon">`): Toggle active, Force password reset, Unlock, Delete
  - Delete uses `<Dialog>` with `<Button variant="destructive">` to confirm
- [ ] "+ Create User" `<Button>` → `<Dialog>` (`CreateUserModal`):
  - `<Input>` for email (required), displayName (optional); `<Select>` for role (at least one required)
  - Submit: `POST /api/v1/admin/users`
  - On success: refresh user list, show `toast.success()` (sonner)

### 16.2 User Detail (`src/pages/admin/AdminUserDetailPage.tsx`)

- [ ] **shadcn/ui components**: `Card`, `CardHeader`, `CardContent`, `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `Input`, `Button`, `Badge`, `Switch`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Separator`, `Skeleton`
- [ ] Fetch: `GET /api/v1/admin/users/:id`; show `<Skeleton>` while loading
- [ ] Edit form: `<Input>` for displayName, `<Switch>` for isActive → `PATCH /api/v1/admin/users/:id`; save `<Button>` shows `<Loader2>` while pending
- [ ] Role assignment: current roles as `<Badge>` with `<Button variant="ghost" size="icon">` remove (`<X>` lucide); `<Select>` to add from available roles → `POST /api/v1/admin/users/:id/roles`
- [ ] Danger zone section below `<Separator>`: `<Button variant="destructive">` for Delete, Force Password Reset, Unlock — each with `<Dialog>` confirmation

---

## Phase 17 — Admin: Role & Permission Management

> **Reference:** spec §11.5 (Admin — Role Management, Permission Management)

### 17.1 Role Management (`src/pages/admin/AdminRolesPage.tsx`)

- [ ] **shadcn/ui components**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Button`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Checkbox`, `Badge`, `Input`, `Label`, `Skeleton`
- [ ] Fetch: `GET /api/v1/admin/roles` — response includes `rolePermissions: Array<{ permission: { id, name } }>` on each role; use `r.rolePermissions.length` for the permission count column and `r.rolePermissions.map(rp => rp.permission.id)` to seed the permissions modal checkbox state
- [ ] Table: name, description, permission count `<Badge>` (using `<Table>`)
- [ ] Create role: `<Button>` → `<Dialog>` with `<Input>` for name + description → `POST /api/v1/admin/roles`
- [ ] Edit role: `<Button variant="outline" size="sm">` per row → same `<Dialog>` form → `PATCH /api/v1/admin/roles/:id`
- [ ] Delete role: `<Button variant="destructive" size="sm">` → `<Dialog>` confirmation → `DELETE /api/v1/admin/roles/:id`
- [ ] Assign permissions: `<Button variant="outline" size="sm">` "Permissions" → `<Dialog>` with `<Checkbox>` list (one per permission, pre-checked if already assigned) → diff to call `POST`/`DELETE` per changed permission

### 17.2 Permission Management (`src/pages/admin/AdminPermissionsPage.tsx`)

- [ ] **shadcn/ui components**: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Button`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Input`, `Label`, `Skeleton`
- [ ] Fetch: `GET /api/v1/admin/permissions`; show `<Skeleton>` rows while loading
- [ ] Table: name, description (using `<Table>`)
- [ ] Create: `<Button>` → `<Dialog>` with `<Input>` fields → `POST /api/v1/admin/permissions`
- [ ] Delete: `<Button variant="destructive" size="sm">` per row → `<Dialog>` confirmation → `DELETE /api/v1/admin/permissions/:id`

---

## Phase 18 — Frontend Testing & Polish

> **Reference:** spec §11.6, §11.7

### 18.1 Tests

- [ ] Install: `npm i -D @testing-library/react @testing-library/user-event jsdom vitest`
- [ ] Configure `vitest.config.ts` for frontend with `environment: 'jsdom'`
- [ ] Unit tests:
  - `AuthContext`: silent refresh on mount, login branches, logout
  - Route guards: redirect logic for unauthenticated, mustChangePassword, non-admin
  - Login form: shows error messages for each backend error code
- [ ] Integration smoke tests (with MSW or axios mock adapter):
  - Full login → dashboard flow
  - Login → forced change password → dashboard flow
  - Admin creates a user → list updates

### 18.2 UX Polish

- [ ] Async submit buttons: use `<Button disabled>` with `<Loader2 className="mr-2 h-4 w-4 animate-spin">` (lucide) — no custom spinner needed
- [ ] Loading skeleton states: use shadcn `<Skeleton>` for table rows and card placeholders while fetching
- [ ] Confirmation modals: use shadcn `<Dialog>` + `<DialogContent>` + `<DialogFooter>` with `<Button variant="destructive">` — no custom modal component needed
- [ ] Toast notifications: use sonner `toast.success()` / `toast.error()` / `toast.info()` — `<Toaster>` must be mounted at the app root
- [ ] Status badges: use `<Badge>` with appropriate variants — active/success states use `variant="secondary"`, error/destructive states use `variant="destructive"`, neutral states use `variant="outline"`
- [ ] Consistent error boundary at router level for unhandled errors
- [ ] Accessible form labels and ARIA attributes: provided automatically by shadcn `<Form>` + `<FormLabel>` + `<FormControl>` — no manual `aria-*` attributes needed for form fields

---

*Generated from `auth-system-spec.md` v1.3 — April 2026*
