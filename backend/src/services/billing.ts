import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  OrderStatus,
  PaymentCallbackStatus,
  PaymentProvider,
  PlanInterval,
  SubscriptionStatus,
  type Order,
  type Plan,
  type Prisma
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import type { AuthContext } from "../middleware/auth.js";
import { recordAuditEvent } from "./audit.js";
import { ensurePlansSeeded } from "./entitlements.js";

export interface CreateOrderInput {
  planCode?: string;
  plan?: string;
  provider?: string;
  channel?: string;
}

export interface PaymentCallbackInput {
  provider: string;
  body: Record<string, unknown>;
}

const paidStatuses = new Set(["SUCCESS", "PAID", "TRADE_SUCCESS", "COMPLETED"]);

export async function createBillingOrder(auth: AuthContext, input: CreateOrderInput) {
  await ensurePlansSeeded();
  const plan = await resolvePlan(input.planCode ?? input.plan);
  const provider = mapPaymentProvider(input.provider ?? input.channel);
  const now = new Date();
  const isFree = plan.priceCents <= 0 || provider === PaymentProvider.MANUAL;

  const order = await prisma.order.create({
    data: {
      organizationId: auth.organizationId,
      planId: plan.id,
      userId: auth.userId,
      orderNo: createOrderNo(),
      provider,
      status: isFree ? OrderStatus.PAID : OrderStatus.PENDING,
      amountCents: plan.priceCents,
      currency: plan.currency,
      subject: `${plan.name} subscription`,
      paidAt: isFree ? now : undefined,
      expiresAt: addMinutes(now, 30),
      metadata: {
        phase: "phase4",
        paymentMode: "placeholder",
        provider,
        autoActivated: isFree
      }
    }
  });

  let activatedSubscriptionId: string | undefined;

  if (isFree) {
    const subscription = await activateSubscription(order, plan, provider);
    activatedSubscriptionId = subscription.id;
  }

  await recordAuditEvent({
    organizationId: auth.organizationId,
    actorUserId: auth.userId,
    action: isFree ? "billing.order.created_manual_paid" : "billing.order.created",
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      planCode: plan.code,
      provider,
      amountCents: plan.priceCents,
      activatedSubscriptionId
    }
  });

  return {
    order: formatOrder({ ...order, plan }),
    payment: {
      mode: "placeholder",
      provider: provider.toLowerCase(),
      status: isFree ? "paid" : "pending",
      expiresAt: order.expiresAt?.toISOString() ?? null,
      message: isFree
        ? "Manual/free order activated by server."
        : "Payment provider handoff is reserved; callback verification activates the subscription."
    }
  };
}

export async function listOrganizationOrders(auth: AuthContext) {
  const orders = await prisma.order.findMany({
    where: { organizationId: auth.organizationId },
    include: { plan: true, subscription: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return { orders: orders.map(formatOrder) };
}

export async function requestInvoicePlaceholder(
  auth: AuthContext,
  input: { title: string; amount?: string; orderId?: string }
) {
  const invoice = {
    id: `INV-${Date.now()}`,
    title: input.title,
    amount: input.amount ?? "",
    orderId: input.orderId ?? null,
    status: "placeholder_requested",
    createdAt: new Date().toISOString()
  };

  await recordAuditEvent({
    organizationId: auth.organizationId,
    actorUserId: auth.userId,
    action: "billing.invoice.requested",
    resourceType: "invoice",
    resourceId: invoice.id,
    metadata: {
      orderId: input.orderId ?? null,
      amount: input.amount ?? null
    }
  });

  return { invoice };
}

export async function processPaymentCallback(input: PaymentCallbackInput) {
  const provider = mapPaymentProvider(input.provider);
  const callbackId = callbackIdentity(provider, input.body);
  const existing = await prisma.paymentCallback.findUnique({
    where: { callbackId }
  });

  if (existing) {
    await recordAuditEvent({
      action: "payment.callback.duplicate",
      resourceType: "payment_callback",
      resourceId: existing.id,
      metadata: { provider, callbackId }
    });

    return {
      received: true,
      duplicate: true,
      callbackId,
      status: existing.status.toLowerCase()
    };
  }

  const verification = verifyPlaceholderSignature(provider, input.body);
  const order = await findCallbackOrder(input.body);
  const payload = sanitizePayload(input.body);
  const callbackData = {
    orderId: order?.id,
    provider,
    callbackId,
    eventType: stringFrom(input.body.eventType ?? input.body.tradeStatus ?? input.body.status, "payment.callback"),
    status: verification.verified ? PaymentCallbackStatus.RECEIVED : PaymentCallbackStatus.VERIFIED_REJECTED,
    payload: payload as Prisma.InputJsonValue,
    signatureDigest: verification.digest,
    errorMessage: verification.verified ? undefined : verification.reason
  };

  if (!verification.verified) {
    const rejected = await prisma.paymentCallback.create({ data: callbackData });
    await recordAuditEvent({
      organizationId: order?.organizationId,
      action: "payment.callback.rejected",
      resourceType: "payment_callback",
      resourceId: rejected.id,
      severity: "warning",
      metadata: { provider, callbackId, reason: verification.reason }
    });
    throw new HttpError(400, "PAYMENT_SIGNATURE_INVALID", "Payment callback signature was not accepted.");
  }

  if (!order) {
    const failed = await prisma.paymentCallback.create({
      data: {
        ...callbackData,
        status: PaymentCallbackStatus.FAILED,
        errorMessage: "Order was not found."
      }
    });
    await recordAuditEvent({
      action: "payment.callback.order_not_found",
      resourceType: "payment_callback",
      resourceId: failed.id,
      severity: "warning",
      metadata: { provider, callbackId }
    });
    throw new HttpError(404, "ORDER_NOT_FOUND", "Payment callback order was not found.");
  }

  const plan = order.planId
    ? await prisma.plan.findUnique({ where: { id: order.planId } })
    : null;
  const amount = numberFrom(input.body.amountCents ?? input.body.totalAmountCents, order.amountCents);

  if (amount !== order.amountCents) {
    const failed = await prisma.paymentCallback.create({
      data: {
        ...callbackData,
        orderId: order.id,
        status: PaymentCallbackStatus.FAILED,
        errorMessage: "Amount mismatch."
      }
    });
    await recordAuditEvent({
      organizationId: order.organizationId,
      action: "payment.callback.amount_mismatch",
      resourceType: "payment_callback",
      resourceId: failed.id,
      severity: "warning",
      metadata: { orderId: order.id, expected: order.amountCents, received: amount }
    });
    throw new HttpError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match the order.");
  }

  const callback = await prisma.paymentCallback.create({ data: callbackData });
  const status = stringFrom(input.body.tradeStatus ?? input.body.status, "").toUpperCase();
  let activatedSubscriptionId: string | null = null;

  if (paidStatuses.has(status) || paidStatuses.has(callbackData.eventType.toUpperCase())) {
    const paidOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        providerOrderNo: stringFrom(
          input.body.providerOrderNo ?? input.body.tradeNo ?? input.body.transactionId,
          order.providerOrderNo ?? ""
        ),
        status: OrderStatus.PAID,
        paidAt: order.paidAt ?? new Date()
      }
    });

    if (plan) {
      const subscription = await activateSubscription(paidOrder, plan, provider);
      activatedSubscriptionId = subscription.id;
    }

    await prisma.paymentCallback.update({
      where: { id: callback.id },
      data: {
        status: PaymentCallbackStatus.PROCESSED,
        processedAt: new Date()
      }
    });

    await recordAuditEvent({
      organizationId: order.organizationId,
      actorUserId: order.userId ?? undefined,
      action: "payment.order.paid",
      resourceType: "order",
      resourceId: order.id,
      metadata: {
        provider,
        callbackId,
        subscriptionId: activatedSubscriptionId
      }
    });
  }

  await recordAuditEvent({
    organizationId: order.organizationId,
    actorUserId: order.userId ?? undefined,
    action: "payment.callback.processed",
    resourceType: "payment_callback",
    resourceId: callback.id,
    metadata: { provider, callbackId, orderId: order.id }
  });

  return {
    received: true,
    duplicate: false,
    callbackId,
    orderId: order.id,
    subscriptionId: activatedSubscriptionId,
    status: "processed"
  };
}

async function resolvePlan(planCodeOrName: string | undefined) {
  const plans = await prisma.plan.findMany({
    where: { active: true },
    orderBy: { priceCents: "asc" }
  });
  const requested = planCodeOrName?.trim().toLowerCase();

  if (requested) {
    const direct = plans.find(
      (plan) => plan.code.toLowerCase() === requested || plan.name.toLowerCase() === requested
    );

    if (direct) {
      return direct;
    }

    if (requested.includes("free") || requested.includes("trial")) return findPlan(plans, "free_trial");
    if (requested.includes("starter")) return findPlan(plans, "starter");
    if (requested.includes("professional") || requested.includes("pro")) return findPlan(plans, "professional");
    if (requested.includes("enterprise")) return findPlan(plans, "enterprise");
  }

  return findPlan(plans, "starter");
}

function findPlan(plans: Plan[], code: string) {
  return plans.find((plan) => plan.code === code) ?? plans[0]!;
}

async function activateSubscription(order: Order, plan: Plan, provider: PaymentProvider) {
  const now = new Date();
  const currentPeriodEnd = addBillingPeriod(now, plan.interval);
  const existing = await prisma.subscription.findFirst({
    where: {
      organizationId: order.organizationId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING] }
    },
    orderBy: { updatedAt: "desc" }
  });

  const subscription = existing
    ? await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          provider,
          currentPeriodStart: now,
          currentPeriodEnd,
          trialEndsAt: null,
          usageCounters: {}
        }
      })
    : await prisma.subscription.create({
        data: {
          organizationId: order.organizationId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          provider,
          currentPeriodStart: now,
          currentPeriodEnd,
          usageCounters: {}
        }
      });

  await prisma.order.update({
    where: { id: order.id },
    data: { subscriptionId: subscription.id }
  });

  await recordAuditEvent({
    organizationId: order.organizationId,
    actorUserId: order.userId ?? undefined,
    action: "billing.subscription.activated",
    resourceType: "subscription",
    resourceId: subscription.id,
    metadata: {
      orderId: order.id,
      planCode: plan.code,
      provider
    }
  });

  return subscription;
}

function findCallbackOrder(body: Record<string, unknown>) {
  const orderNo = stringFrom(body.orderNo ?? body.outTradeNo ?? body.out_trade_no, undefined);
  const providerOrderNo = stringFrom(body.providerOrderNo ?? body.tradeNo ?? body.transactionId, undefined);

  return prisma.order.findFirst({
    where: {
      OR: [
        ...(orderNo ? [{ orderNo }] : []),
        ...(providerOrderNo ? [{ providerOrderNo }] : [])
      ]
    }
  });
}

function verifyPlaceholderSignature(provider: PaymentProvider, body: Record<string, unknown>) {
  const signature = stringFrom(body.signature, "");
  const canonical = canonicalPayload(body);
  const secret = callbackSecret(provider);
  const digest = createHash("sha256").update(`${provider}:${canonical}`).digest("hex");

  if (secret) {
    const expected = createHmac("sha256", secret).update(canonical).digest("hex");
    return {
      verified: signature === expected,
      digest,
      reason: signature === expected ? undefined : "HMAC placeholder signature mismatch."
    };
  }

  return {
    verified: signature === "phase4-placeholder",
    digest,
    reason: signature === "phase4-placeholder" ? undefined : "Callback secret is not configured; placeholder signature is required."
  };
}

function callbackSecret(provider: PaymentProvider) {
  if (provider === PaymentProvider.WECHAT_PAY) {
    return process.env.WECHAT_PAY_CALLBACK_SECRET || process.env.WECHAT_PAY_API_KEY || "";
  }

  if (provider === PaymentProvider.ALIPAY) {
    return process.env.ALIPAY_CALLBACK_SECRET || process.env.ALIPAY_PUBLIC_KEY || "";
  }

  return process.env.MANUAL_PAY_CALLBACK_SECRET || "";
}

function canonicalPayload(body: Record<string, unknown>) {
  const entries = Object.entries(body)
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b));

  return JSON.stringify(Object.fromEntries(entries));
}

function callbackIdentity(provider: PaymentProvider, body: Record<string, unknown>) {
  const raw = stringFrom(body.callbackId ?? body.notifyId ?? body.notify_id ?? body.eventId, "");

  if (raw) {
    return `${provider}:${raw}`;
  }

  const stable = [
    provider,
    stringFrom(body.orderNo ?? body.outTradeNo ?? body.out_trade_no, ""),
    stringFrom(body.providerOrderNo ?? body.tradeNo ?? body.transactionId, ""),
    stringFrom(body.eventType ?? body.tradeStatus ?? body.status, "")
  ].join(":");

  return `${provider}:${createHash("sha256").update(stable).digest("hex")}`;
}

function sanitizePayload(body: Record<string, unknown>) {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (/secret|key|token|password/i.test(key)) {
      continue;
    }

    if (typeof value === "string") {
      result[key] = value.slice(0, 500);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = value;
    }
  }

  return result;
}

function mapPaymentProvider(value: string | undefined): PaymentProvider {
  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("ali")) return PaymentProvider.ALIPAY;
  if (normalized.includes("支付宝")) return PaymentProvider.ALIPAY;
  if (normalized.includes("wechat") || normalized.includes("wx")) return PaymentProvider.WECHAT_PAY;
  if (normalized.includes("微信")) return PaymentProvider.WECHAT_PAY;
  return PaymentProvider.MANUAL;
}

function addBillingPeriod(date: Date, interval: PlanInterval) {
  const next = new Date(date);

  if (interval === PlanInterval.YEAR) {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function createOrderNo() {
  return `GEO${Date.now()}${randomUUID().slice(0, 8).toUpperCase()}`;
}

function formatOrder(order: Order & { plan?: Plan | null }) {
  const amount = `${(order.amountCents / 100).toFixed(2)} ${order.currency}`;

  return {
    id: order.id,
    no: order.orderNo,
    orderNo: order.orderNo,
    tenantId: order.organizationId,
    plan: order.plan?.name ?? order.subject,
    planCode: order.plan?.code ?? null,
    amount,
    amountCents: order.amountCents,
    channel: providerLabel(order.provider),
    provider: order.provider.toLowerCase(),
    status: orderStatusLabel(order.status, order.metadata),
    rawStatus: order.status.toLowerCase(),
    paidAt: order.paidAt?.toISOString() ?? null,
    expiresAt: order.expiresAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString()
  };
}

function orderStatusLabel(status: OrderStatus, metadata: Prisma.JsonValue | null) {
  if (toRecord(metadata).refundRequested) {
    return "refund_review";
  }

  return status.toLowerCase();
}

function providerLabel(provider: PaymentProvider) {
  if (provider === PaymentProvider.ALIPAY) return "Alipay";
  if (provider === PaymentProvider.WECHAT_PAY) return "WeChat Pay";
  return "Manual";
}

function numberFrom(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringFrom(value: unknown, fallback: string): string;
function stringFrom(value: unknown, fallback: undefined): string | undefined;
function stringFrom(value: unknown, fallback: string | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
