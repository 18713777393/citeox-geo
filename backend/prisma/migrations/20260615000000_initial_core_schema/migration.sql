CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "UserRole" AS ENUM ('USER', 'BUSINESS_USER', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE "AuthSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "VerificationCodePurpose" AS ENUM ('REGISTER', 'LOGIN', 'PASSWORD_RESET');
CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "MonitorStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "AssetStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'GENERATING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "DistributionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "TechnicalFileStatus" AS ENUM ('DRAFT', 'GENERATED', 'EXPORTED');
CREATE TYPE "PlanInterval" AS ENUM ('MONTH', 'YEAR');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "PaymentProvider" AS ENUM ('WECHAT_PAY', 'ALIPAY', 'MANUAL');
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CLOSED', 'REFUNDED');
CREATE TYPE "PaymentCallbackStatus" AS ENUM ('RECEIVED', 'VERIFIED_REJECTED', 'PROCESSED', 'FAILED');
CREATE TYPE "ModelProviderStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
CREATE TYPE "LegalConsentType" AS ENUM ('TERMS', 'PRIVACY', 'PAYMENT', 'CONTENT', 'THIRD_PARTY');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "password_hash" TEXT,
  "display_name" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "owner_id" UUID,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "industry" TEXT,
  "settings" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_id" TEXT NOT NULL,
  "status" "AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
  "ip_address" TEXT,
  "user_agent" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "verification_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID,
  "phone" TEXT,
  "email" TEXT,
  "purpose" "VerificationCodePurpose" NOT NULL,
  "code_hash" TEXT NOT NULL,
  "send_count" INTEGER NOT NULL DEFAULT 1,
  "last_sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "projects" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "owner_id" UUID,
  "name" TEXT NOT NULL,
  "brand_name" TEXT NOT NULL,
  "industry" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "settings" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "created_by_id" UUID,
  "title" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "category" TEXT,
  "language" TEXT NOT NULL DEFAULT 'zh-CN',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "monitor_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "model_provider_id" UUID,
  "status" "MonitorStatus" NOT NULL DEFAULT 'PENDING',
  "source_model" TEXT,
  "answer_summary" TEXT,
  "raw_response" JSONB,
  "visibility_score" DECIMAL(5,2),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "monitor_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "geo_scores" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "monitor_result_id" UUID,
  "score" DECIMAL(5,2) NOT NULL,
  "visibility" DECIMAL(5,2),
  "credibility" DECIMAL(5,2),
  "relevance" DECIMAL(5,2),
  "freshness" DECIMAL(5,2),
  "grade" TEXT,
  "explanation" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "geo_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gaps" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "monitor_result_id" UUID,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "severity" INTEGER NOT NULL DEFAULT 1,
  "description" TEXT,
  "evidence" JSONB,
  "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gaps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "strategies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "gap_id" UUID,
  "title" TEXT NOT NULL,
  "objective" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "actions" JSONB,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "uploaded_by_id" UUID,
  "name" TEXT NOT NULL,
  "asset_type" TEXT NOT NULL,
  "mime_type" TEXT,
  "size_bytes" BIGINT,
  "storage_key" TEXT NOT NULL,
  "source" TEXT,
  "status" "AssetStatus" NOT NULL DEFAULT 'UPLOADED',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "contents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "strategy_id" UUID,
  "creator_id" UUID,
  "model_provider_id" UUID,
  "title" TEXT NOT NULL,
  "content_type" TEXT NOT NULL,
  "body" TEXT,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "prompt_fingerprint" TEXT,
  "review_notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "distributions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "content_id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "external_id" TEXT,
  "status" "DistributionStatus" NOT NULL DEFAULT 'QUEUED',
  "scheduled_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "result_payload" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "distributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "technical_files" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "project_id" UUID NOT NULL,
  "uploaded_by_id" UUID,
  "filename" TEXT NOT NULL,
  "file_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "checksum" TEXT,
  "status" "TechnicalFileStatus" NOT NULL DEFAULT 'DRAFT',
  "parsed_metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "technical_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "interval" "PlanInterval" NOT NULL DEFAULT 'MONTH',
  "seat_limit" INTEGER,
  "project_limit" INTEGER,
  "question_limit" INTEGER,
  "ai_monitor_limit" INTEGER,
  "content_limit" INTEGER,
  "report_limit" INTEGER,
  "ai_token_limit" INTEGER,
  "model_dispatch_limit" INTEGER,
  "team_member_limit" INTEGER,
  "distribution_enabled" BOOLEAN NOT NULL DEFAULT false,
  "advanced_competitor_analysis_enabled" BOOLEAN NOT NULL DEFAULT false,
  "auto_optimization_enabled" BOOLEAN NOT NULL DEFAULT false,
  "feature_flags" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "provider" "PaymentProvider" DEFAULT 'MANUAL',
  "external_subscription_id" TEXT,
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "trial_ends_at" TIMESTAMP(3),
  "usage_counters" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "subscription_id" UUID,
  "plan_id" UUID,
  "user_id" UUID,
  "order_no" TEXT NOT NULL,
  "provider_order_no" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "subject" TEXT NOT NULL,
  "metadata" JSONB,
  "paid_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_callbacks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID,
  "provider" "PaymentProvider" NOT NULL,
  "callback_id" TEXT,
  "event_type" TEXT NOT NULL,
  "status" "PaymentCallbackStatus" NOT NULL DEFAULT 'RECEIVED',
  "payload" JSONB NOT NULL,
  "signature_digest" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "error_message" TEXT,
  CONSTRAINT "payment_callbacks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "model_providers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "base_url" TEXT,
  "status" "ModelProviderStatus" NOT NULL DEFAULT 'DISABLED',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "quota_tokens_per_minute" INTEGER,
  "daily_token_limit" INTEGER,
  "config" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "model_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_usage_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "project_id" UUID,
  "user_id" UUID,
  "model_provider_id" UUID,
  "request_id" TEXT,
  "feature_key" TEXT NOT NULL,
  "model" TEXT,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "cost_cents" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'succeeded',
  "error_code" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "actor_user_id" UUID,
  "action" TEXT NOT NULL,
  "resource_type" TEXT,
  "resource_id" TEXT,
  "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
  "ip_address" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_consents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "organization_id" UUID,
  "consent_type" "LegalConsentType" NOT NULL,
  "version" TEXT NOT NULL,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB,
  CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invite_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "inviter_id" UUID,
  "invitee_email" TEXT NOT NULL,
  "invitee_user_id" UUID,
  "token_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'BUSINESS_USER',
  "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invite_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "organizations_owner_id_idx" ON "organizations"("owner_id");
CREATE UNIQUE INDEX "auth_sessions_token_id_key" ON "auth_sessions"("token_id");
CREATE INDEX "auth_sessions_user_id_status_idx" ON "auth_sessions"("user_id", "status");
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
CREATE INDEX "verification_codes_phone_purpose_expires_at_idx" ON "verification_codes"("phone", "purpose", "expires_at");
CREATE INDEX "verification_codes_email_purpose_expires_at_idx" ON "verification_codes"("email", "purpose", "expires_at");
CREATE INDEX "verification_codes_user_id_purpose_idx" ON "verification_codes"("user_id", "purpose");
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");
CREATE INDEX "projects_organization_id_idx" ON "projects"("organization_id");
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");
CREATE INDEX "questions_project_id_idx" ON "questions"("project_id");
CREATE INDEX "questions_created_by_id_idx" ON "questions"("created_by_id");
CREATE INDEX "monitor_results_project_id_idx" ON "monitor_results"("project_id");
CREATE INDEX "monitor_results_question_id_idx" ON "monitor_results"("question_id");
CREATE INDEX "monitor_results_model_provider_id_idx" ON "monitor_results"("model_provider_id");
CREATE INDEX "geo_scores_project_id_idx" ON "geo_scores"("project_id");
CREATE INDEX "geo_scores_monitor_result_id_idx" ON "geo_scores"("monitor_result_id");
CREATE INDEX "gaps_project_id_idx" ON "gaps"("project_id");
CREATE INDEX "gaps_monitor_result_id_idx" ON "gaps"("monitor_result_id");
CREATE INDEX "strategies_project_id_idx" ON "strategies"("project_id");
CREATE INDEX "strategies_gap_id_idx" ON "strategies"("gap_id");
CREATE INDEX "assets_organization_id_idx" ON "assets"("organization_id");
CREATE INDEX "assets_project_id_idx" ON "assets"("project_id");
CREATE INDEX "assets_uploaded_by_id_idx" ON "assets"("uploaded_by_id");
CREATE INDEX "contents_project_id_idx" ON "contents"("project_id");
CREATE INDEX "contents_strategy_id_idx" ON "contents"("strategy_id");
CREATE INDEX "contents_creator_id_idx" ON "contents"("creator_id");
CREATE INDEX "contents_model_provider_id_idx" ON "contents"("model_provider_id");
CREATE INDEX "distributions_project_id_idx" ON "distributions"("project_id");
CREATE INDEX "distributions_content_id_idx" ON "distributions"("content_id");
CREATE INDEX "distributions_channel_status_idx" ON "distributions"("channel", "status");
CREATE INDEX "technical_files_project_id_idx" ON "technical_files"("project_id");
CREATE INDEX "technical_files_uploaded_by_id_idx" ON "technical_files"("uploaded_by_id");
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions"("organization_id");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");
CREATE UNIQUE INDEX "orders_order_no_key" ON "orders"("order_no");
CREATE UNIQUE INDEX "orders_provider_order_no_key" ON "orders"("provider_order_no");
CREATE INDEX "orders_organization_id_idx" ON "orders"("organization_id");
CREATE INDEX "orders_subscription_id_idx" ON "orders"("subscription_id");
CREATE INDEX "orders_plan_id_idx" ON "orders"("plan_id");
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX "orders_provider_status_idx" ON "orders"("provider", "status");
CREATE UNIQUE INDEX "payment_callbacks_callback_id_key" ON "payment_callbacks"("callback_id");
CREATE INDEX "payment_callbacks_order_id_idx" ON "payment_callbacks"("order_id");
CREATE INDEX "payment_callbacks_provider_status_idx" ON "payment_callbacks"("provider", "status");
CREATE UNIQUE INDEX "model_providers_code_key" ON "model_providers"("code");
CREATE INDEX "model_providers_status_priority_idx" ON "model_providers"("status", "priority");
CREATE UNIQUE INDEX "ai_usage_logs_request_id_key" ON "ai_usage_logs"("request_id");
CREATE INDEX "ai_usage_logs_organization_id_idx" ON "ai_usage_logs"("organization_id");
CREATE INDEX "ai_usage_logs_project_id_idx" ON "ai_usage_logs"("project_id");
CREATE INDEX "ai_usage_logs_user_id_idx" ON "ai_usage_logs"("user_id");
CREATE INDEX "ai_usage_logs_model_provider_id_idx" ON "ai_usage_logs"("model_provider_id");
CREATE INDEX "ai_usage_logs_feature_key_created_at_idx" ON "ai_usage_logs"("feature_key", "created_at");
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs"("organization_id");
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE UNIQUE INDEX "legal_consents_user_id_consent_type_version_key" ON "legal_consents"("user_id", "consent_type", "version");
CREATE INDEX "legal_consents_organization_id_idx" ON "legal_consents"("organization_id");
CREATE UNIQUE INDEX "invite_records_token_hash_key" ON "invite_records"("token_hash");
CREATE INDEX "invite_records_organization_id_idx" ON "invite_records"("organization_id");
CREATE INDEX "invite_records_inviter_id_idx" ON "invite_records"("inviter_id");
CREATE INDEX "invite_records_invitee_user_id_idx" ON "invite_records"("invitee_user_id");
CREATE INDEX "invite_records_invitee_email_status_idx" ON "invite_records"("invitee_email", "status");

ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "monitor_results" ADD CONSTRAINT "monitor_results_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_results" ADD CONSTRAINT "monitor_results_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monitor_results" ADD CONSTRAINT "monitor_results_model_provider_id_fkey" FOREIGN KEY ("model_provider_id") REFERENCES "model_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "geo_scores" ADD CONSTRAINT "geo_scores_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geo_scores" ADD CONSTRAINT "geo_scores_monitor_result_id_fkey" FOREIGN KEY ("monitor_result_id") REFERENCES "monitor_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gaps" ADD CONSTRAINT "gaps_monitor_result_id_fkey" FOREIGN KEY ("monitor_result_id") REFERENCES "monitor_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_gap_id_fkey" FOREIGN KEY ("gap_id") REFERENCES "gaps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_model_provider_id_fkey" FOREIGN KEY ("model_provider_id") REFERENCES "model_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "distributions" ADD CONSTRAINT "distributions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_files" ADD CONSTRAINT "technical_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "technical_files" ADD CONSTRAINT "technical_files_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_callbacks" ADD CONSTRAINT "payment_callbacks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_model_provider_id_fkey" FOREIGN KEY ("model_provider_id") REFERENCES "model_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invite_records" ADD CONSTRAINT "invite_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invite_records" ADD CONSTRAINT "invite_records_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invite_records" ADD CONSTRAINT "invite_records_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
