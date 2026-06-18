CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "CollectionSourceType" AS ENUM (
  'SEARCH_API',
  'AI_PLATFORM',
  'WEBSITE',
  'SITEMAP',
  'RSS',
  'MANUAL_IMPORT',
  'SOCIAL_PUBLIC'
);

CREATE TYPE "CollectionSourceStatus" AS ENUM (
  'ACTIVE',
  'PAUSED',
  'ERROR'
);

CREATE TYPE "CollectionHealthStatus" AS ENUM (
  'UNKNOWN',
  'HEALTHY',
  'DEGRADED',
  'DOWN'
);

CREATE TYPE "CollectionJobStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "CollectionJobTriggerType" AS ENUM (
  'MANUAL',
  'SCHEDULED',
  'RETRY'
);

CREATE TYPE "CollectionItemStatus" AS ENUM (
  'NEW',
  'DEDUPED',
  'ACCEPTED',
  'REJECTED',
  'CONVERTED_TO_QUESTION'
);

CREATE TABLE "collection_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "CollectionSourceType" NOT NULL,
  "status" "CollectionSourceStatus" NOT NULL DEFAULT 'ACTIVE',
  "config" JSONB,
  "secret_ref" TEXT,
  "rate_limit_per_hour" INTEGER,
  "schedule_cron" TEXT,
  "last_run_at" TIMESTAMP(3),
  "next_run_at" TIMESTAMP(3),
  "health_status" "CollectionHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collection_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "source_id" UUID NOT NULL,
  "status" "CollectionJobStatus" NOT NULL DEFAULT 'PENDING',
  "trigger_type" "CollectionJobTriggerType" NOT NULL DEFAULT 'MANUAL',
  "query" TEXT,
  "input" JSONB,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "locked_at" TIMESTAMP(3),
  "lock_token" TEXT,
  "cancelled_at" TIMESTAMP(3),
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "max_retries" INTEGER NOT NULL DEFAULT 2,
  "error_code" TEXT,
  "error_message" TEXT,
  "stats" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collection_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "job_id" UUID,
  "source_id" UUID NOT NULL,
  "raw_title" TEXT NOT NULL,
  "raw_text" TEXT,
  "url" TEXT,
  "domain" TEXT,
  "author" TEXT,
  "published_at" TIMESTAMP(3),
  "language" TEXT NOT NULL DEFAULT 'zh-CN',
  "content_hash" TEXT NOT NULL,
  "intent" TEXT,
  "keywords" JSONB,
  "quality_score" INTEGER NOT NULL DEFAULT 0,
  "trust_score" INTEGER NOT NULL DEFAULT 0,
  "status" "CollectionItemStatus" NOT NULL DEFAULT 'NEW',
  "metadata" JSONB,
  "created_question_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "collection_source_health" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  "status" "CollectionHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
  "latency_ms" INTEGER,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collection_source_health_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "question_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "question_id" UUID NOT NULL,
  "collection_item_id" UUID,
  "source_id" UUID,
  "source_name" TEXT NOT NULL,
  "source_url" TEXT,
  "confidence" DECIMAL(5,2),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "question_sources_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collection_sources_organization_id_code_key" ON "collection_sources"("organization_id", "code");
CREATE INDEX "collection_sources_organization_id_idx" ON "collection_sources"("organization_id");
CREATE INDEX "collection_sources_project_id_idx" ON "collection_sources"("project_id");
CREATE INDEX "collection_sources_type_status_idx" ON "collection_sources"("type", "status");

CREATE INDEX "collection_jobs_organization_id_status_created_at_idx" ON "collection_jobs"("organization_id", "status", "created_at");
CREATE INDEX "collection_jobs_project_id_idx" ON "collection_jobs"("project_id");
CREATE INDEX "collection_jobs_source_id_status_idx" ON "collection_jobs"("source_id", "status");
CREATE UNIQUE INDEX "collection_jobs_one_running_per_source" ON "collection_jobs"("source_id") WHERE "status" = 'RUNNING';

CREATE UNIQUE INDEX "collection_items_organization_id_source_id_content_hash_key" ON "collection_items"("organization_id", "source_id", "content_hash");
CREATE INDEX "collection_items_organization_id_status_created_at_idx" ON "collection_items"("organization_id", "status", "created_at");
CREATE INDEX "collection_items_project_id_idx" ON "collection_items"("project_id");
CREATE INDEX "collection_items_job_id_idx" ON "collection_items"("job_id");
CREATE INDEX "collection_items_source_id_idx" ON "collection_items"("source_id");
CREATE INDEX "collection_items_created_question_id_idx" ON "collection_items"("created_question_id");

CREATE INDEX "collection_source_health_organization_id_idx" ON "collection_source_health"("organization_id");
CREATE INDEX "collection_source_health_source_id_checked_at_idx" ON "collection_source_health"("source_id", "checked_at");

CREATE INDEX "question_sources_organization_id_idx" ON "question_sources"("organization_id");
CREATE INDEX "question_sources_project_id_idx" ON "question_sources"("project_id");
CREATE INDEX "question_sources_question_id_idx" ON "question_sources"("question_id");
CREATE INDEX "question_sources_collection_item_id_idx" ON "question_sources"("collection_item_id");
CREATE INDEX "question_sources_source_id_idx" ON "question_sources"("source_id");

ALTER TABLE "collection_sources" ADD CONSTRAINT "collection_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_sources" ADD CONSTRAINT "collection_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collection_jobs" ADD CONSTRAINT "collection_jobs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "collection_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "collection_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "collection_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_created_question_id_fkey" FOREIGN KEY ("created_question_id") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "collection_source_health" ADD CONSTRAINT "collection_source_health_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_source_health" ADD CONSTRAINT "collection_source_health_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "collection_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_collection_item_id_fkey" FOREIGN KEY ("collection_item_id") REFERENCES "collection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "question_sources" ADD CONSTRAINT "question_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "collection_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
