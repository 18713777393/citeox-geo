import { createHash, randomUUID } from "node:crypto";
import {
  CreditTransactionType,
  PaymentProvider,
  PlanInterval,
  RechargeOrderStatus,
  SubscriptionStatus,
  type ModelPricing,
  type Plan,
  type Prisma,
  type RechargeOrder,
  type SubscriptionOrder
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import { recordAuditEvent } from "./audit.js";
import { ensurePlansSeeded } from "./entitlements.js";

const rechargeAmounts = [50, 100, 200, 500, 1000, 2000];
const defaultPaymentWindowMinutes = 5;

const modelPricingSeeds = [
  ["doubao", "豆包", "0.1200", "0.15"],
  ["deepseek", "DeepSeek", "0.4000", "0.50"],
  ["wenxin", "文心一言", "0.6400", "0.80"],
  ["tongyi", "通义千问", "0.2400", "0.30"],
  ["yuanbao", "腾讯元宝", "0.4800", "0.60"],
  ["zhipu", "智谱清言", "0.3200", "0.40"],
  ["kimi", "Kimi", "0.4000", "0.50"],
  ["metaso", "秘塔 AI 搜索", "0.2000", "0.25"],
  ["ai360", "360智脑", "0.1600", "0.20"],
  ["xinghuo", "讯飞星火", "0.2800", "0.35"]
] as const;

export interface DeductCreditsInput {
  userId: string;
  amount?: number | string | Prisma.Decimal;
  models?: string[];
  model?: string;
  operation: string;
  operationId?: string;
  description?: string;
}

export async function seedModelPricing() {
  for (const [modelKey, modelName, apiCost, userPrice] of modelPricingSeeds) {
    await prisma.modelPricing.upsert({
      where: { modelKey },
      create: {
        modelKey,
        modelName,
        apiCost,
        serviceRate: "1.2500",
        userPrice,
        isActive: true
      },
      update: {
        modelName,
        apiCost,
        serviceRate: "1.2500",
        userPrice,
        isActive: true
      }
    });
  }
}

export async function ensureCreditAccount(userId: string) {
  const existing = await prisma.creditAccount.findUnique({ where: { userId } });
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { apiBalance: true }
  });

  return prisma.creditAccount.create({
    data: {
      userId,
      balance: user?.apiBalance ?? "0.00",
      totalCharged: user?.apiBalance ?? "0.00"
    }
  });
}

export async function checkBalance(userId: string, requiredAmount: number | string | Prisma.Decimal) {
  const account = await ensureCreditAccount(userId);
  return toNumber(account.balance) >= toMoney(requiredAmount);
}

export async function getUnitPrice(modelKey: string) {
  await seedModelPricing();
  const pricing = await prisma.modelPricing.findFirst({
    where: {
      modelKey: normalizeModelKey(modelKey),
      isActive: true
    }
  });

  if (!pricing) {
    throw new HttpError(404, "MODEL_PRICE_NOT_FOUND", "该 AI 模型暂未配置价格，请联系管理员。");
  }

  return pricing;
}

export async function estimateCost(models: string[] = ["deepseek"], operationType = "ai_operation") {
  await seedModelPricing();
  const uniqueModels = [...new Set(models.map(normalizeModelKey).filter(Boolean))];
  const items = uniqueModels.length ? uniqueModels : ["deepseek"];
  const pricingRows = await prisma.modelPricing.findMany({
    where: {
      modelKey: { in: items },
      isActive: true
    },
    orderBy: { userPrice: "asc" }
  });

  const known = new Map(pricingRows.map((row) => [row.modelKey, row]));
  const breakdown = items.map((key) => {
    const row = known.get(key);
    if (!row) {
      throw new HttpError(404, "MODEL_PRICE_NOT_FOUND", `模型 ${key} 暂未配置价格。`);
    }
    return formatModelPrice(row);
  });
  const total = roundMoney(breakdown.reduce((sum, item) => sum + item.unitPrice, 0));

  return {
    operationType,
    total,
    totalFormatted: formatMoney(total),
    breakdown
  };
}

export async function deductCredits(input: DeductCreditsInput) {
  const models = input.models?.length ? input.models : [input.model ?? "deepseek"];
  const amount = input.amount == null ? (await estimateCost(models, input.operation)).total : toMoney(input.amount);

  if (amount <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "扣费金额必须大于 0。");
  }

  await ensureCreditAccount(input.userId);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<{ id: string }[]>`SELECT id FROM credit_accounts WHERE user_id = ${input.userId}::uuid FOR UPDATE`;
    const account = await tx.creditAccount.findUnique({
      where: { userId: input.userId }
    });

    if (!account || toNumber(account.balance) < amount) {
      throw new HttpError(402, "INSUFFICIENT_BALANCE", `API 余额不足，当前操作需约 ${formatMoney(amount)}。`);
    }

    const balanceAfter = roundMoney(toNumber(account.balance) - amount);
    const updated = await tx.creditAccount.update({
      where: { userId: input.userId },
      data: {
        balance: balanceAfter,
        totalConsumed: { increment: amount }
      }
    });

    await tx.user.update({
      where: { id: input.userId },
      data: { apiBalance: balanceAfter }
    });

    const transaction = await tx.creditTransaction.create({
      data: {
        userId: input.userId,
        type: CreditTransactionType.CONSUME,
        amount: -amount,
        balanceAfter,
        relatedModel: models.map(normalizeModelKey).join("+"),
        relatedOperation: input.operation,
        relatedOperationId: input.operationId,
        description: input.description ?? operationLabel(input.operation)
      }
    });

    return { account: updated, transaction };
  });

  return {
    balance: formatBalance(result.account.balance),
    transaction: formatTransaction(result.transaction)
  };
}

export async function getTransactions(
  userId: string,
  query: { page?: number; pageSize?: number; type?: string; from?: Date; to?: Date } = {}
) {
  const page = clampInt(query.page ?? 1, 1, 999);
  const pageSize = clampInt(query.pageSize ?? 20, 1, 100);
  const where: Prisma.CreditTransactionWhereInput = {
    userId,
    ...(query.type ? { type: query.type.toUpperCase() as CreditTransactionType } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {})
          }
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.creditTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.creditTransaction.count({ where })
  ]);

  return {
    items: items.map(formatTransaction),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1)
  };
}

export async function getConsumptionTrend(userId: string, days = 30) {
  const windowDays = clampInt(days, 1, 90);
  const since = new Date();
  since.setDate(since.getDate() - windowDays + 1);
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.creditTransaction.findMany({
    where: {
      userId,
      type: CreditTransactionType.CONSUME,
      createdAt: { gte: since }
    },
    orderBy: { createdAt: "asc" }
  });

  const byDate = new Map<string, number>();
  for (let i = 0; i < windowDays; i += 1) {
    const date = new Date(since);
    date.setDate(since.getDate() + i);
    byDate.set(dateKey(date), 0);
  }

  for (const row of rows) {
    const key = dateKey(row.createdAt);
    byDate.set(key, roundMoney((byDate.get(key) ?? 0) + Math.abs(toNumber(row.amount))));
  }

  return [...byDate.entries()].map(([date, amount]) => ({
    date,
    amount,
    amountFormatted: formatMoney(amount)
  }));
}

export async function createRechargeOrder(
  userId: string,
  input: { amount: number | string; paymentMethod?: string }
) {
  const amount = toMoney(input.amount);
  if (amount < 10) {
    throw new HttpError(400, "VALIDATION_ERROR", "自定义充值金额最低为 ¥10.00。");
  }

  const order = await prisma.rechargeOrder.create({
    data: {
      userId,
      orderNo: createOrderNo("RC"),
      amount,
      paymentMethod: mapPaymentProvider(input.paymentMethod),
      expiresAt: addMinutes(new Date(), defaultPaymentWindowMinutes),
      metadata: {
        source: rechargeAmounts.includes(amount) ? "preset" : "custom",
        paymentMode: "placeholder"
      }
    }
  });

  await recordAuditEvent({
    actorUserId: userId,
    action: "credits.recharge_order.created",
    resourceType: "recharge_order",
    resourceId: order.id,
    metadata: { orderNo: order.orderNo, amount }
  });

  return formatRechargeOrder(order);
}

export async function startRechargePayment(userId: string, orderId: string) {
  const order = await prisma.rechargeOrder.findFirst({
    where: { id: orderId, userId }
  });

  if (!order) {
    throw new HttpError(404, "NOT_FOUND", "充值订单不存在。");
  }

  if (order.status !== RechargeOrderStatus.PENDING) {
    return formatPaymentPayload(order);
  }

  if (order.expiresAt.getTime() <= Date.now()) {
    const expired = await prisma.rechargeOrder.update({
      where: { id: order.id },
      data: { status: RechargeOrderStatus.EXPIRED }
    });
    return formatPaymentPayload(expired);
  }

  const qrPayload = createPlaceholderQr(order.orderNo, order.amount, order.paymentMethod);
  const updated = await prisma.rechargeOrder.update({
    where: { id: order.id },
    data: {
      qrPayload,
      paymentUrl: `https://citeox.com/pay/placeholder/${order.orderNo}`
    }
  });

  return formatPaymentPayload(updated);
}

export async function getRechargeOrderStatus(userId: string, orderId: string) {
  const order = await prisma.rechargeOrder.findFirst({
    where: { id: orderId, userId }
  });

  if (!order) {
    throw new HttpError(404, "NOT_FOUND", "充值订单不存在。");
  }

  if (order.status === RechargeOrderStatus.PENDING && order.expiresAt.getTime() <= Date.now()) {
    const expired = await prisma.rechargeOrder.update({
      where: { id: order.id },
      data: { status: RechargeOrderStatus.EXPIRED }
    });
    return formatRechargeOrder(expired);
  }

  return formatRechargeOrder(order);
}

export async function processRechargeCallback(provider: string, body: Record<string, unknown>) {
  const verification = verifyCallback(provider, body);
  if (!verification.verified) {
    throw new HttpError(400, "PAYMENT_SIGNATURE_INVALID", "支付回调验签失败。");
  }

  const orderNo = stringFrom(body.orderNo ?? body.outTradeNo ?? body.out_trade_no, "");
  const order = await prisma.rechargeOrder.findUnique({ where: { orderNo } });
  if (!order) {
    throw new HttpError(404, "NOT_FOUND", "充值订单不存在。");
  }

  const amount = toMoney(body.amount ?? body.totalAmount ?? order.amount);
  if (amount !== toNumber(order.amount)) {
    throw new HttpError(400, "PAYMENT_AMOUNT_MISMATCH", "支付金额与订单金额不一致。");
  }

  if (order.status === RechargeOrderStatus.PAID) {
    return { received: true, duplicate: true, order: formatRechargeOrder(order) };
  }

  const paid = await applyRechargePaid(order);
  return { received: true, duplicate: false, order: formatRechargeOrder(paid) };
}

export async function createSubscriptionOrder(
  userId: string,
  input: { planCode: string; billingCycle?: "monthly" | "yearly"; paymentMethod?: string }
) {
  await ensurePlansSeeded();
  const plan = await resolveSubscriptionPlan(input.planCode, input.billingCycle);
  const order = await prisma.subscriptionOrder.create({
    data: {
      userId,
      planId: plan.id,
      orderNo: createOrderNo("SUB"),
      billingCycle: plan.interval,
      amount: plan.priceCents / 100,
      paymentMethod: mapPaymentProvider(input.paymentMethod),
      expiresAt: addMinutes(new Date(), defaultPaymentWindowMinutes),
      metadata: {
        paymentMode: "placeholder",
        planCode: plan.code,
        planName: plan.name
      }
    }
  });

  return formatSubscriptionOrder(order, plan);
}

export async function startSubscriptionPayment(userId: string, orderId: string) {
  const order = await prisma.subscriptionOrder.findFirst({
    where: { id: orderId, userId },
    include: { plan: true }
  });

  if (!order) {
    throw new HttpError(404, "NOT_FOUND", "套餐订单不存在。");
  }

  const qrPayload = createPlaceholderQr(order.orderNo, order.amount, order.paymentMethod);
  const updated = await prisma.subscriptionOrder.update({
    where: { id: order.id },
    data: {
      qrPayload,
      paymentUrl: `https://citeox.com/pay/placeholder/${order.orderNo}`
    },
    include: { plan: true }
  });

  return {
    order: formatSubscriptionOrder(updated, updated.plan),
    payment: formatSubscriptionPayment(updated)
  };
}

export async function getAccountCreditSummary(userId: string) {
  await seedModelPricing();
  const account = await ensureCreditAccount(userId);
  const pricing = await prisma.modelPricing.findMany({
    where: { isActive: true },
    orderBy: { userPrice: "asc" }
  });
  const averagePrice = pricing.length
    ? pricing.reduce((sum, row) => sum + toNumber(row.userPrice), 0) / pricing.length
    : 1;

  return {
    balance: formatBalance(account.balance),
    estimatedCalls: Math.floor(toNumber(account.balance) / Math.max(averagePrice, 0.01)),
    lowBalance: toNumber(account.balance) > 0 && toNumber(account.balance) < 10,
    zeroBalance: toNumber(account.balance) <= 0,
    modelPricing: pricing.map(formatModelPrice)
  };
}

async function applyRechargePaid(order: RechargeOrder) {
  await ensureCreditAccount(order.userId);

  const paid = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<{ id: string }[]>`SELECT id FROM credit_accounts WHERE user_id = ${order.userId}::uuid FOR UPDATE`;
    const account = await tx.creditAccount.upsert({
      where: { userId: order.userId },
      create: {
        userId: order.userId,
        balance: order.amount,
        totalCharged: order.amount
      },
      update: {
        balance: { increment: order.amount },
        totalCharged: { increment: order.amount }
      }
    });
    const balanceAfter = toNumber(account.balance);

    await tx.user.update({
      where: { id: order.userId },
      data: { apiBalance: balanceAfter }
    });

    await tx.creditTransaction.create({
      data: {
        userId: order.userId,
        type: CreditTransactionType.CHARGE,
        amount: order.amount,
        balanceAfter,
        relatedOperation: "recharge",
        relatedOperationId: order.id,
        description: `API 额度充值 ${formatMoney(order.amount)}`
      }
    });

    return tx.rechargeOrder.update({
      where: { id: order.id },
      data: {
        status: RechargeOrderStatus.PAID,
        paidAt: order.paidAt ?? new Date()
      }
    });
  });

  await recordAuditEvent({
    actorUserId: order.userId,
    action: "credits.recharge_order.paid",
    resourceType: "recharge_order",
    resourceId: order.id,
    metadata: { orderNo: order.orderNo, amount: toNumber(order.amount) }
  });

  return paid;
}

async function resolveSubscriptionPlan(planCode: string, billingCycle: string | undefined) {
  const code = planCode.trim().toLowerCase();
  const cycle = billingCycle === "yearly" || code.endsWith("_year") ? "year" : "month";

  const aliases: Record<string, string> = {
    free: "free",
    free_trial: "free",
    personal: cycle === "year" ? "personal_year" : "personal_month",
    starter: cycle === "year" ? "personal_year" : "personal_month",
    pro: cycle === "year" ? "pro_year" : "pro_month",
    professional: cycle === "year" ? "pro_year" : "pro_month",
    enterprise: cycle === "year" ? "enterprise_year" : "enterprise_month"
  };

  const requested = aliases[code] ?? code;
  const plan = await prisma.plan.findUnique({ where: { code: requested } });
  if (!plan) {
    throw new HttpError(404, "NOT_FOUND", "套餐不存在或已下架。");
  }

  return plan;
}

function formatModelPrice(row: ModelPricing) {
  return {
    modelKey: row.modelKey,
    modelName: row.modelName,
    unitPrice: toNumber(row.userPrice),
    unitPriceFormatted: formatMoney(row.userPrice),
    isActive: row.isActive
  };
}

function formatTransaction(row: {
  id: string;
  type: CreditTransactionType;
  amount: Prisma.Decimal | number;
  balanceAfter: Prisma.Decimal | number;
  relatedModel: string | null;
  relatedOperation: string | null;
  description: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    type: row.type.toLowerCase(),
    amount: toNumber(row.amount),
    amountFormatted: formatMoney(row.amount),
    balanceAfter: toNumber(row.balanceAfter),
    balanceAfterFormatted: formatMoney(row.balanceAfter),
    relatedModel: row.relatedModel,
    relatedOperation: row.relatedOperation,
    description: row.description,
    createdAt: row.createdAt.toISOString()
  };
}

function formatRechargeOrder(order: RechargeOrder) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    amount: toNumber(order.amount),
    amountFormatted: formatMoney(order.amount),
    paymentMethod: order.paymentMethod.toLowerCase(),
    status: order.status.toLowerCase(),
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString()
  };
}

function formatPaymentPayload(order: RechargeOrder) {
  return {
    order: formatRechargeOrder(order),
    payment: {
      mode: "placeholder",
      provider: order.paymentMethod.toLowerCase(),
      qrPayload: order.qrPayload,
      paymentUrl: order.paymentUrl,
      pollIntervalSeconds: 3,
      expiresAt: order.expiresAt.toISOString(),
      message: "真实支付宝/微信支付将在配置商户密钥后启用；当前返回安全占位支付信息。"
    }
  };
}

function formatSubscriptionOrder(order: SubscriptionOrder, plan: Plan) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    planCode: plan.code,
    planName: plan.name,
    billingCycle: order.billingCycle.toLowerCase(),
    amount: toNumber(order.amount),
    amountFormatted: formatMoney(order.amount),
    paymentMethod: order.paymentMethod.toLowerCase(),
    status: order.status.toLowerCase(),
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString()
  };
}

function formatSubscriptionPayment(order: SubscriptionOrder) {
  return {
    mode: "placeholder",
    provider: order.paymentMethod.toLowerCase(),
    qrPayload: order.qrPayload,
    paymentUrl: order.paymentUrl,
    pollIntervalSeconds: 3,
    expiresAt: order.expiresAt.toISOString(),
    message: "套餐升级真实收银台已预留，生产环境需配置支付宝/微信商户密钥。"
  };
}

function formatBalance(balance: Prisma.Decimal | number | string) {
  const amount = toMoney(balance);
  return {
    amount,
    formatted: formatMoney(amount)
  };
}

function verifyCallback(provider: string, body: Record<string, unknown>) {
  const secret = process.env.PAYMENT_CALLBACK_SECRET || providerSecret(provider);
  const signature = stringFrom(body.signature, "");
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(body).filter(([key]) => key !== "signature").sort(([a], [b]) => a.localeCompare(b)))
  );

  if (secret) {
    const expected = createHash("sha256").update(`${secret}:${canonical}`).digest("hex");
    return { verified: signature === expected };
  }

  return {
    verified: process.env.NODE_ENV !== "production" && signature === "doc03-placeholder"
  };
}

function providerSecret(provider: string) {
  const normalized = provider.toLowerCase();
  if (normalized.includes("ali")) return process.env.ALIPAY_CALLBACK_SECRET || process.env.ALIPAY_PUBLIC_KEY || "";
  if (normalized.includes("wechat") || normalized.includes("wx")) return process.env.WECHAT_PAY_CALLBACK_SECRET || process.env.WECHAT_API_KEY || "";
  return "";
}

function mapPaymentProvider(value: string | undefined): PaymentProvider {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("ali") || normalized.includes("支付宝")) return PaymentProvider.ALIPAY;
  if (normalized.includes("wechat") || normalized.includes("wx") || normalized.includes("微信")) return PaymentProvider.WECHAT_PAY;
  return PaymentProvider.MANUAL;
}

function normalizeModelKey(value: string) {
  const normalized = value.toLowerCase().trim();
  const aliases: Record<string, string> = {
    "360": "ai360",
    "360智脑": "ai360",
    deepseek: "deepseek",
    ds: "deepseek",
    豆包: "doubao",
    doubao: "doubao",
    文心: "wenxin",
    文心一言: "wenxin",
    通义: "tongyi",
    通义千问: "tongyi",
    元宝: "yuanbao",
    腾讯元宝: "yuanbao",
    智谱: "zhipu",
    智谱清言: "zhipu",
    kimi: "kimi",
    秘塔: "metaso",
    "秘塔 ai 搜索": "metaso",
    星火: "xinghuo",
    讯飞星火: "xinghuo"
  };
  return aliases[normalized] ?? normalized.replace(/[^a-z0-9]/g, "");
}

function createOrderNo(prefix: "RC" | "SUB") {
  return `${prefix}${Date.now()}${randomUUID().slice(0, 6).toUpperCase()}`.slice(0, 32);
}

function createPlaceholderQr(orderNo: string, amount: Prisma.Decimal | number, provider: PaymentProvider) {
  return JSON.stringify({
    orderNo,
    amount: formatMoney(amount),
    provider: provider.toLowerCase(),
    placeholder: true
  });
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toNumber(value: Prisma.Decimal | number | string) {
  return typeof value === "number" ? value : Number(value.toString());
}

function toMoney(value: unknown) {
  const number = typeof value === "number" ? value : Number(String(value ?? "0").replace(/[^\d.-]/g, ""));
  return roundMoney(Number.isFinite(number) ? number : 0);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatMoney(value: Prisma.Decimal | number | string) {
  return `¥${toMoney(value).toFixed(2)}`;
}

function stringFrom(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function operationLabel(operation: string) {
  const labels: Record<string, string> = {
    brand_diagnosis: "品牌诊断",
    content_strategy: "内容策略生成",
    content_generation: "内容生成",
    answer_monitor: "AI 回答监控",
    automation: "一键自动化"
  };
  return labels[operation] ?? operation;
}
