-- CreateIndex
-- CONCURRENTLY: DmLog is the worker's hottest write table in production.
-- Postgres disallows CREATE INDEX CONCURRENTLY inside a transaction; Prisma
-- (4.7+) detects it and runs this statement outside the migration's wrapping
-- transaction automatically, so it does not block inserts/updates while it builds.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "DmLog_workspaceId_createdAt_idx" ON "DmLog"("workspaceId", "createdAt");
