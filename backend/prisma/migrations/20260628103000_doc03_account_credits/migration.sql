DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CreditTransactionType') THEN
    CREATE TYPE "CreditTransactionType" AS ENUM ('CHARGE', 'CONSUME', 'REFUND', 'ADJUST');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RechargeOrderStatus') THEN
    CREATE TYPE "RechargeOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "credit_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "balance" DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK ("balance" >= 0),
  "total_charged" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "total_consumed" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "credit_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "type" "CreditTransactionType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "balance_after" DECIMAL(10,2) NOT NULL,
  "related_model" VARCHAR(50),
  "related_operation" VARCHAR(100),
  "related_operation_id" UUID,
  "description" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recharge_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "order_no" VARCHAR(32) NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "payment_method" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
  "status" "RechargeOrderStatus" NOT NULL DEFAULT 'PENDING',
  "payment_url" TEXT,
  "qr_payload" TEXT,
  "paid_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "recharge_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "subscription_orders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "order_no" VARCHAR(32) NOT NULL,
  "billing_cycle" "PlanInterval" NOT NULL DEFAULT 'MONTH',
  "amount" DECIMAL(10,2) NOT NULL,
  "payment_method" "PaymentProvider" NOT NULL DEFAULT 'MANUAL',
  "status" "RechargeOrderStatus" NOT NULL DEFAULT 'PENDING',
  "payment_url" TEXT,
  "qr_payload" TEXT,
  "paid_at" TIMESTAMPTZ,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "subscription_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "model_pricing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "model_key" VARCHAR(50) NOT NULL,
  "model_name" VARCHAR(100) NOT NULL,
  "api_cost" DECIMAL(10,4) NOT NULL,
  "service_rate" DECIMAL(10,4) NOT NULL DEFAULT 1.25,
  "user_price" DECIMAL(10,2) NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "model_pricing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_accounts_user_id_key" ON "credit_accounts"("user_id");
CREATE INDEX IF NOT EXISTS "credit_transactions_user_id_created_at_idx" ON "credit_transactions"("user_id", "created_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "recharge_orders_order_no_key" ON "recharge_orders"("order_no");
CREATE INDEX IF NOT EXISTS "recharge_orders_user_id_idx" ON "recharge_orders"("user_id");
CREATE INDEX IF NOT EXISTS "recharge_orders_status_expires_at_idx" ON "recharge_orders"("status", "expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_orders_order_no_key" ON "subscription_orders"("order_no");
CREATE INDEX IF NOT EXISTS "subscription_orders_user_id_idx" ON "subscription_orders"("user_id");
CREATE INDEX IF NOT EXISTS "subscription_orders_plan_id_idx" ON "subscription_orders"("plan_id");
CREATE INDEX IF NOT EXISTS "subscription_orders_status_expires_at_idx" ON "subscription_orders"("status", "expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "model_pricing_model_key_key" ON "model_pricing"("model_key");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_accounts_user_id_fkey') THEN
    ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_user_id_fkey') THEN
    ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recharge_orders_user_id_fkey') THEN
    ALTER TABLE "recharge_orders" ADD CONSTRAINT "recharge_orders_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_orders_user_id_fkey') THEN
    ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscription_orders_plan_id_fkey') THEN
    ALTER TABLE "subscription_orders" ADD CONSTRAINT "subscription_orders_plan_id_fkey"
      FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
