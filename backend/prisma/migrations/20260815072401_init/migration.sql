-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('OUTAGE', 'SCHEMA_CHANGE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_monitors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint_url" TEXT NOT NULL,
    "description" TEXT,
    "expected_status" INTEGER NOT NULL DEFAULT 200,
    "poll_interval_minutes" INTEGER NOT NULL DEFAULT 5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitor_checks" (
    "id" TEXT NOT NULL,
    "api_id" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,
    "http_status" INTEGER,
    "latency_ms" INTEGER,
    "error_type" TEXT,

    CONSTRAINT "monitor_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schema_snapshots" (
    "id" TEXT NOT NULL,
    "api_id" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schema" JSONB NOT NULL,
    "schema_hash" TEXT NOT NULL,

    CONSTRAINT "schema_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "api_id" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "api_monitors_user_id_idx" ON "api_monitors"("user_id");

-- CreateIndex
CREATE INDEX "monitor_checks_api_id_checked_at_idx" ON "monitor_checks"("api_id", "checked_at");

-- CreateIndex
CREATE INDEX "schema_snapshots_api_id_captured_at_idx" ON "schema_snapshots"("api_id", "captured_at");

-- CreateIndex
CREATE INDEX "incidents_api_id_status_idx" ON "incidents"("api_id", "status");

-- AddForeignKey
ALTER TABLE "api_monitors" ADD CONSTRAINT "api_monitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitor_checks" ADD CONSTRAINT "monitor_checks_api_id_fkey" FOREIGN KEY ("api_id") REFERENCES "api_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schema_snapshots" ADD CONSTRAINT "schema_snapshots_api_id_fkey" FOREIGN KEY ("api_id") REFERENCES "api_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_api_id_fkey" FOREIGN KEY ("api_id") REFERENCES "api_monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
