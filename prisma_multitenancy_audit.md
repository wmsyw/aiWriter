# Prisma Multi-Tenant Scoping Patterns & Audit Guide

## 1. Architectural Patterns

### A. Row-Level Security (RLS) - *The "Hard" Boundary*
Postgres RLS is the most secure method as it enforces rules at the database engine level.
*   **Mechanism**: `CREATE POLICY` rules restrict access based on session variables (e.g., `current_setting('app.current_tenant')`).
*   **Prisma Implementation**:
    *   Requires wrapping queries in `$transaction` to ensure `SET LOCAL` is applied to the same connection as the query.
    *   Alternatively, using Client Extensions to automate the transaction wrapping.
*   **Pros**: Defense-in-depth. Prevents data leaks even if application logic (Middleware/Extensions) fails or raw SQL is used.
*   **Cons**:
    *   **Connection Pooling**: High risk of "session leaking" if connections aren't reset properly.
    *   **Performance**: Overhead of wrapping every query in a transaction.
    *   **Complexity**: Migrations and local dev require Postgres user management (bypass RLS user vs restricted user).

### B. Client Extensions - *The "Soft" Boundary (Recommended Application Layer)*
Replaces the deprecated Middleware pattern.
*   **Mechanism**: `prisma.$extends` creates a proxied client that intercepts `query` (find, update, delete) operations.
*   **Implementation**: Automatically injects `where: { tenantId: ctx.tenantId }` into args.
*   **Pros**:
    *   **Type-safe**: TypeScript knows about the extension.
    *   **Contextual**: Can be scoped per-request (e.g., creating a `tenantClient` for each HTTP request).
*   **Cons**:
    *   **Bypassable**: `$queryRaw`, `$executeRaw`, and separate PrismaClient instances bypass this.
    *   **Complex Relations**: Deeply nested `include` or `connect` operations might miss scopes if not explicitly handled in the extension logic.

### C. Middleware - *The Legacy Boundary*
*   **Status**: Soft-deprecated.
*   **Pitfall**: Often implemented globally. Harder to type-check. High performance overhead compared to Extensions. **Avoid for new projects.**

---

## 2. Critical Pitfalls & Bypass Vectors

### The "Connect" Bypass
*   **Scenario**: Creating a `Post` and connecting it to an `Author`.
*   **Risk**: `connect: { id: 123 }`. If ID 123 belongs to another tenant, Prisma will connect it unless the database has a unique constraint on `(id, tenantId)` or the extension strictly filters `connect` args.
*   **Fix**: Always enforce compound unique keys `@@unique([id, tenantId])` on tenant-scoped models. This makes cross-tenant connections impossible at the schema level.

### The Raw Query Hole
*   **Scenario**: `prisma.$queryRaw\`SELECT * FROM "User" WHERE ...\``
*   **Risk**: Extensions/Middleware **do not** apply to raw queries.
*   **Fix**:
    *   If using RLS: Raw queries are safe *if* the session variable is set.
    *   If using Extensions: **FORBID** raw queries in business logic, or use a linter to whitelist them.

### Nested Reads/Writes
*   **Scenario**: `prisma.user.findMany({ include: { posts: true } })`.
*   **Risk**: If `posts` are not implicitly filtered by the User's tenant (e.g., shared data models), you might leak data.
*   **Fix**: Extensions must recursively inject where clauses, or schema foreign keys must ensure rigid ownership.

---

## 3. Connection Pooling & Security

### The "Session Poisoning" Attack
*   **Context**: Using RLS with a connection pool (PgBouncer, Supabase, Prisma Data Proxy).
*   **Risk**: Request A sets `app.current_tenant = 'tenant_1'`. Request A finishes. Connection returns to pool *without* reset. Request B (tenant_2) grabs the connection. RLS still sees 'tenant_1'.
*   **Mitigation**:
    *   **`SET LOCAL`**: Only exists for the duration of the transaction. *Mandatory* for pooled RLS.
    *   **Clean Connections**: Configure the pool to `DISCARD ALL` on release (performance hit).

---

## 4. Idempotency & Concurrency

### Atomic Operations
*   **Pattern**: Avoid Read-Modify-Write.
*   **Bad**: `const user = await find(); await update({ balance: user.balance - 10 });`
*   **Good**: `await update({ data: { balance: { decrement: 10 } } });`

### Upsert Safety
*   **Pattern**: `upsert` requires a unique field.
*   **Multi-tenant Note**: The unique field *must* include `tenantId` (e.g. `email_tenantId_unique`).
*   **Risk**: If you only look up by `email`, a user could hijack an email address used in another tenant if the unique constraint isn't scoped.

---

## 5. Actionable Audit Points (Checklist)

### Schema & Database Level
- [ ] **Composite Unique Keys**: Do all tenant-scoped tables have `@@unique([id, tenantId])` or equivalent?
- [ ] **Foreign Keys**: Do relations include `tenantId` to ensure referential integrity within the tenant? (e.g., `fields: [authorId, tenantId] references: [id, tenantId]`)
- [ ] **RLS Policies**: If RLS is claimed, are policies defined for ALL operations (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)?
- [ ] **Bypass User**: Is the app connecting with a user that has `BYPASSRLS` privileges? (Should be NO).

### Application Logic (Prisma)
- [ ] **Extension Coverage**: Does the Client Extension cover `delete`, `deleteMany`, `update`, `updateMany`, and `upsert`?
- [ ] **Raw Query Audit**: `grep` for `$queryRaw` and `$executeRaw`. Are they absolutely necessary? Do they manually include `AND "tenantId" = $1`?
- [ ] **Connect/Disconnect**: Check all nested `connect` operations. Are they protected by schema constraints?
- [ ] **Global Instantiation**: Is the `PrismaClient` instantiated *once* globally but extended *per-request*? (Correct pattern). Or is the global client used directly (Bypass risk)?

### Infrastructure
- [ ] **Pool Mode**: If using PgBouncer, is it in Transaction mode? (Requires `SET LOCAL` for RLS).
- [ ] **Timeout Handling**: Are transactions kept short to prevent holding pool connections?
