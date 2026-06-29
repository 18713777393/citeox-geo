CREATE TABLE "brand_projects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "project_id" UUID,
  "industry" VARCHAR(100) NOT NULL,
  "sub_industry" VARCHAR(100),
  "brand_name" VARCHAR(100) NOT NULL,
  "website" VARCHAR(500),
  "goal" VARCHAR(50) NOT NULL,
  "platforms" JSONB NOT NULL DEFAULT '[]',
  "diagnosis_count" INTEGER NOT NULL DEFAULT 0,
  "max_diagnosis" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(20) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "brand_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competitors" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "brand_project_id" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "keywords" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "brand_project_id" UUID NOT NULL,
  "keyword" VARCHAR(100) NOT NULL,
  "category" VARCHAR(50) NOT NULL DEFAULT 'brand',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "diagnosis_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "brand_project_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "current_step" VARCHAR(100),
  "total_cost" DECIMAL(10,2),
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "error_message" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "diagnosis_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "brand_projects_project_id_key" ON "brand_projects"("project_id");
CREATE INDEX "brand_projects_user_id_idx" ON "brand_projects"("user_id");
CREATE INDEX "brand_projects_status_idx" ON "brand_projects"("status");
CREATE INDEX "competitors_brand_project_id_idx" ON "competitors"("brand_project_id");
CREATE INDEX "keywords_brand_project_id_idx" ON "keywords"("brand_project_id");
CREATE INDEX "diagnosis_tasks_brand_project_id_idx" ON "diagnosis_tasks"("brand_project_id");
CREATE INDEX "diagnosis_tasks_user_id_idx" ON "diagnosis_tasks"("user_id");
CREATE INDEX "diagnosis_tasks_status_idx" ON "diagnosis_tasks"("status");

ALTER TABLE "brand_projects" ADD CONSTRAINT "brand_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "brand_projects" ADD CONSTRAINT "brand_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_brand_project_id_fkey" FOREIGN KEY ("brand_project_id") REFERENCES "brand_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_brand_project_id_fkey" FOREIGN KEY ("brand_project_id") REFERENCES "brand_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnosis_tasks" ADD CONSTRAINT "diagnosis_tasks_brand_project_id_fkey" FOREIGN KEY ("brand_project_id") REFERENCES "brand_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "diagnosis_tasks" ADD CONSTRAINT "diagnosis_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
