CREATE TABLE IF NOT EXISTS "invite_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(8) NOT NULL,
  "max_uses" INTEGER NOT NULL DEFAULT 100,
  "used_count" INTEGER NOT NULL DEFAULT 0,
  "benefit" TEXT,
  "expires_at" TIMESTAMPTZ,
  "created_by" UUID,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "username" VARCHAR(20);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email_hash'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "email_hash" VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone_hash'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "phone_hash" VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='industry'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "industry" VARCHAR(100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='invite_code_id'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "invite_code_id" UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='api_balance'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "api_balance" DECIMAL(10,2) NOT NULL DEFAULT 0.00;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='has_brand'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "has_brand" BOOLEAN NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_login_ip'
  ) THEN
    ALTER TABLE "users" ADD COLUMN "last_login_ip" VARCHAR(45);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "invite_codes_code_key" ON "invite_codes"("code");
CREATE INDEX IF NOT EXISTS "invite_codes_created_by_idx" ON "invite_codes"("created_by");
CREATE INDEX IF NOT EXISTS "invite_codes_is_active_expires_at_idx" ON "invite_codes"("is_active", "expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_hash_key" ON "users"("email_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_hash_key" ON "users"("phone_hash");
CREATE INDEX IF NOT EXISTS "users_email_hash_idx" ON "users"("email_hash");
CREATE INDEX IF NOT EXISTS "users_phone_hash_idx" ON "users"("phone_hash");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invite_codes_created_by_fkey'
  ) THEN
    ALTER TABLE "invite_codes"
      ADD CONSTRAINT "invite_codes_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_invite_code_id_fkey'
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_invite_code_id_fkey"
      FOREIGN KEY ("invite_code_id") REFERENCES "invite_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
