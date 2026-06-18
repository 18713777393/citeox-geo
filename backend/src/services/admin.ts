import {
  ContentStatus,
  OrderStatus,
  Prisma,
  UserRole,
  type AuditLog,
  type Content,
  type Order,
  type Plan,
  type User
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import type { AuthContext } from "../middleware/auth.js";
import { recordAuditEvent } from "./audit.js";

const defaultConfig = {
  platformName: "ZhiYin GEO",
  siteDomain: "https://your-domain.com",
  freeTrialDays: 14,
  inviteReward: "30 AI monitor runs",
  defaultPlan: "free_trial",
  supportEmail: "support@example.test",
  contentReviewRequired: true
};

export async function adminDashboard(auth: AuthContext) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    todayNew,
    activeUsers,
    totalOrders,
    paidOrders,
    pendingOrders,
    reviewQueue,
    totalContent,
    modelCalls,
    modelCost
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: OrderStatus.PAID } }),
    prisma.order.count({ where: { status: OrderStatus.PENDING } }),
    prisma.content.count({ where: { status: ContentStatus.PENDING_REVIEW } }),
    prisma.content.count(),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: today } } }),
    prisma.aiUsageLog.aggregate({ _sum: { costCents: true }, where: { createdAt: { gte: today } } })
  ]);

  await auditAdmin(auth, "admin.dashboard.viewed", "admin_dashboard");

  return {
    dashboard: {
      metrics: {
        totalUsers,
        todayNew,
        activeUsers,
        conversionRate: totalOrders ? Math.round((paidOrders / totalOrders) * 100) : 0,
        totalRevenue: await totalPaidRevenue(),
        paidOrders,
        pendingOrders,
        reviewQueue,
        totalContent,
        modelCalls,
        modelCost: Number(((modelCost._sum.costCents ?? 0) / 100).toFixed(2))
      },
      growthTrend: await userGrowthTrend(),
      health: {
        api: "ok",
        database: "ok",
        payment: "placeholder",
        aiKey: "server_env_only",
        audit: "enabled"
      },
      todo: [
        { item: "Configure real payment merchant credentials", priority: "high", status: "before production" },
        { item: "Run callback smoke tests with provider sandbox", priority: "high", status: "before production" },
        { item: "Review pending content before publishing", priority: "medium", status: "ongoing" }
      ]
    }
  };
}

export async function adminUsers(
  auth: AuthContext,
  query: { q?: string; type?: string; take?: number }
) {
  const take = clamp(query.take ?? 100, 1, 200);
  const users = await prisma.user.findMany({
    where: userWhere(query),
    include: { organization: true },
    orderBy: { createdAt: "desc" },
    take
  });

  await auditAdmin(auth, "admin.users.listed", "user", undefined, { count: users.length });

  return { users: users.map(formatAdminUser) };
}

export async function adminTenants(auth: AuthContext) {
  const organizations = await prisma.organization.findMany({
    include: {
      users: true,
      subscriptions: {
        include: { plan: true },
        orderBy: { updatedAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  await auditAdmin(auth, "admin.tenants.listed", "organization", undefined, { count: organizations.length });

  return {
    tenants: organizations.map((organization) => {
      const subscription = organization.subscriptions[0];

      return {
        id: organization.id,
        name: organization.name,
        type: organization.industry ?? "tenant",
        plan: subscription?.plan.name ?? "free_trial",
        users: organization.users.length,
        status: organization.status.toLowerCase(),
        quota: subscription?.plan.aiMonitorLimit ? `${subscription.plan.aiMonitorLimit}/month` : "-",
        createdAt: organization.createdAt.toISOString()
      };
    })
  };
}

export async function adminUserStats(auth: AuthContext) {
  const users = await prisma.user.findMany({
    include: { organization: true },
    orderBy: { createdAt: "desc" },
    take: 500
  });
  const tenantCount = await prisma.organization.count();
  const paidTenants = await prisma.subscription.count({
    where: { status: "ACTIVE" }
  });

  await auditAdmin(auth, "admin.user_stats.viewed", "user");

  return {
    stats: {
      totalUsers: users.length,
      todayNew: users.filter((user) => isToday(user.createdAt)).length,
      personalUsers: users.filter((user) => user.role === UserRole.USER).length,
      enterpriseUsers: users.filter((user) => user.role === UserRole.BUSINESS_USER).length,
      adminUsers: users.filter((user) => user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN).length,
      activeUsers: users.filter((user) => String(user.status) === "ACTIVE").length,
      tenantCount,
      paidTenants,
      trialTenants: Math.max(tenantCount - paidTenants, 0),
      conversionRate: tenantCount ? Math.round((paidTenants / tenantCount) * 100) : 0,
      trend: await userGrowthTrend()
    }
  };
}

export function adminRoles() {
  return {
    roles: [
      { role: "user", permission: "Own projects, questions, reports, and subscription", scope: "self", status: "enabled" },
      { role: "business_user", permission: "Organization projects, content tasks, and billing", scope: "organization", status: "enabled" },
      { role: "admin", permission: "Admin users, orders, moderation, config, and audit", scope: "platform", status: "enabled" },
      { role: "super_admin", permission: "All platform operations", scope: "platform", status: "enabled" }
    ]
  };
}

export async function adminOrders(
  auth: AuthContext,
  query: { status?: string; take?: number }
) {
  const status = mapOrderStatus(query.status);
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    include: { plan: true, user: true, organization: true },
    orderBy: { createdAt: "desc" },
    take: clamp(query.take ?? 100, 1, 200)
  });

  await auditAdmin(auth, "admin.orders.listed", "order", undefined, { count: orders.length, status: query.status ?? "all" });

  const paid = orders.filter((order) => order.status === OrderStatus.PAID);

  return {
    orders: orders.map(formatAdminOrder),
    summary: {
      totalOrders: orders.length,
      paidOrders: paid.length,
      pendingOrders: orders.filter((order) => order.status === OrderStatus.PENDING).length,
      totalRevenue: paid.reduce((sum, order) => sum + order.amountCents, 0) / 100,
      channels: channelSummary(orders)
    }
  };
}

export async function requestOrderRefund(
  auth: AuthContext,
  input: { orderId: string; reason?: string }
) {
  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: input.orderId }, { orderNo: input.orderId }]
    }
  });

  if (!order) {
    throw new HttpError(404, "ORDER_NOT_FOUND", "Order was not found.");
  }

  const metadata = {
    ...toRecord(order.metadata),
    refundRequested: true,
    refundReason: input.reason ?? "Admin refund review",
    refundRequestedAt: new Date().toISOString(),
    refundRequestedBy: auth.userId
  };
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      metadata: metadata as Prisma.InputJsonValue
    },
    include: { plan: true, user: true, organization: true }
  });

  await auditAdmin(auth, "admin.order.refund_requested", "order", order.id, {
    reason: input.reason ?? null
  });

  return { order: formatAdminOrder(updated) };
}

export async function moderationQueue(auth: AuthContext) {
  const queue = await prisma.content.findMany({
    where: {
      status: { in: [ContentStatus.PENDING_REVIEW, ContentStatus.GENERATING] }
    },
    include: {
      creator: true,
      project: true
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  await auditAdmin(auth, "admin.moderation.queue_viewed", "content", undefined, { count: queue.length });

  return {
    queue: queue.map(formatModerationContent),
    summary: {
      total: queue.length,
      highRisk: queue.filter((content) => riskTags(content).includes("script_risk")).length,
      qualityLow: queue.filter((content) => qualityScore(content) < 70).length,
      review: queue.filter((content) => content.status === ContentStatus.PENDING_REVIEW).length
    }
  };
}

export async function decideContentModeration(
  auth: AuthContext,
  input: { id: string; decision: "approve" | "reject"; note?: string }
) {
  const content = await prisma.content.findUnique({
    where: { id: input.id }
  });

  if (!content) {
    throw new HttpError(404, "CONTENT_NOT_FOUND", "Content was not found.");
  }

  const status = input.decision === "approve" ? ContentStatus.APPROVED : ContentStatus.REJECTED;
  const metadata = {
    ...toRecord(content.metadata),
    reviewedBy: auth.userId,
    reviewedAt: new Date().toISOString(),
    reviewDecision: input.decision
  };
  const updated = await prisma.content.update({
    where: { id: content.id },
    data: {
      status,
      reviewNotes: input.note ?? (input.decision === "approve" ? "Approved by admin review." : "Rejected by admin review."),
      metadata: metadata as Prisma.InputJsonValue
    }
  });

  await auditAdmin(
    auth,
    input.decision === "approve" ? "content.review.approved" : "content.review.rejected",
    "content",
    content.id,
    { previousStatus: content.status, nextStatus: status }
  );

  return { content: formatContentForClient(updated) };
}

export function adminPermissions() {
  return {
    permissions: {
      roles: [
        { id: "super_admin", name: "Super admin", desc: "Global management" },
        { id: "admin", name: "Admin", desc: "Users, orders, moderation, config, audit" },
        { id: "business_user", name: "Business user", desc: "Organization operations" },
        { id: "user", name: "User", desc: "Own account only" }
      ],
      modules: ["dashboard", "users", "orders", "moderation", "config", "permissions", "audit"],
      matrix: [
        ["super_admin", "manage", "manage", "manage", "manage", "manage", "manage", "manage"],
        ["admin", "view", "manage", "manage", "manage", "manage", "view", "view"],
        ["business_user", "none", "none", "none", "none", "none", "none", "none"],
        ["user", "none", "none", "none", "none", "none", "none", "none"]
      ],
      rules: [
        "All /api/admin/* routes require requireAdmin.",
        "Mutating admin routes write audit logs.",
        "Normal users cannot access admin data server-side."
      ]
    }
  };
}

export async function getSystemConfig(auth: AuthContext) {
  const latest = await prisma.auditLog.findFirst({
    where: { action: "admin.config.updated" },
    orderBy: { createdAt: "desc" }
  });
  const metadataConfig = toRecord(toRecord(latest?.metadata).config);

  await auditAdmin(auth, "admin.config.viewed", "system_config");

  return {
    config: {
      ...defaultConfig,
      ...metadataConfig,
      updatedAt: latest?.createdAt.toISOString() ?? null
    }
  };
}

export async function saveSystemConfig(auth: AuthContext, config: Record<string, unknown>) {
  const safeConfig = sanitizeConfig(config);

  await auditAdmin(auth, "admin.config.updated", "system_config", undefined, {
    config: safeConfig
  });

  return {
    config: {
      ...defaultConfig,
      ...safeConfig,
      updatedAt: new Date().toISOString()
    }
  };
}

export async function adminAuditLogs(
  auth: AuthContext,
  query: { category?: string; keyword?: string; take?: number }
) {
  const logs = await prisma.auditLog.findMany({
    where: auditWhere(query.category),
    include: { actor: true, organization: true },
    orderBy: { createdAt: "desc" },
    take: clamp(query.take ?? 100, 1, 300)
  });
  const keyword = query.keyword?.trim().toLowerCase();
  const filtered = keyword
    ? logs.filter((log) => JSON.stringify(formatAuditLog(log)).toLowerCase().includes(keyword))
    : logs;

  await auditAdmin(auth, "admin.audit.listed", "audit_log", undefined, {
    category: query.category ?? "all",
    count: filtered.length
  });

  return {
    logs: filtered.map(formatAuditLog),
    summary: auditSummary(logs)
  };
}

function userWhere(query: { q?: string; type?: string }) {
  const where: Prisma.UserWhereInput = {};
  const q = query.q?.trim();

  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } }
    ];
  }

  if (query.type === "个人") where.role = UserRole.USER;
  if (query.type === "企业") where.role = UserRole.BUSINESS_USER;
  if (query.type === "管理员") where.role = { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] };

  return where;
}

function mapOrderStatus(status: string | undefined) {
  const normalized = status?.toLowerCase();

  if (!normalized || normalized === "all") return undefined;
  if (normalized.includes("paid") || normalized.includes("支付")) return OrderStatus.PAID;
  if (normalized.includes("pending") || normalized.includes("待")) return OrderStatus.PENDING;
  if (normalized.includes("failed")) return OrderStatus.FAILED;
  if (normalized.includes("refund")) return OrderStatus.REFUNDED;
  return undefined;
}

function auditWhere(category: string | undefined): Prisma.AuditLogWhereInput | undefined {
  switch (category) {
    case "login":
      return { action: { startsWith: "auth." } };
    case "payment":
      return { OR: [{ action: { startsWith: "payment." } }, { action: { startsWith: "billing." } }] };
    case "billing":
      return { action: { startsWith: "billing." } };
    case "admin":
      return { action: { startsWith: "admin." } };
    case "security":
      return { OR: [{ severity: "WARNING" }, { severity: "CRITICAL" }] };
    case "models":
      return { action: "ai.call" };
    default:
      return undefined;
  }
}

async function auditAdmin(
  auth: AuthContext,
  action: string,
  resourceType?: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
) {
  await recordAuditEvent({
    organizationId: auth.organizationId,
    actorUserId: auth.userId,
    action,
    resourceType,
    resourceId,
    metadata
  });
}

async function totalPaidRevenue() {
  const result = await prisma.order.aggregate({
    _sum: { amountCents: true },
    where: { status: OrderStatus.PAID }
  });

  return Number(((result._sum.amountCents ?? 0) / 100).toFixed(2));
}

async function userGrowthTrend() {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - index));
    date.setHours(0, 0, 0, 0);
    return date;
  });

  return Promise.all(
    days.map(async (date) => {
      const end = new Date(date.getTime() + 86_400_000);
      const count = await prisma.user.count({
        where: {
          createdAt: {
            gte: date,
            lt: end
          }
        }
      });

      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        count
      };
    })
  );
}

function channelSummary(orders: Array<Order>) {
  const counts = new Map<string, number>();

  for (const order of orders) {
    const key = order.provider.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([channel, count]) => ({ channel, count }));
}

function formatAdminUser(user: User & { organization?: { name: string } | null }) {
  return {
    id: user.id,
    type: roleType(user.role),
    name: user.displayName ?? user.email ?? "-",
    email: user.email ?? "-",
    phone: user.phone ?? "",
    company: user.organization?.name ?? "",
    role: user.role.toLowerCase(),
    status: user.status.toLowerCase(),
    createdAt: user.createdAt.toISOString()
  };
}

function formatAdminOrder(order: Order & { plan?: Plan | null; user?: User | null; organization?: { name: string } | null }) {
  const metadata = toRecord(order.metadata);

  return {
    id: order.id,
    no: order.orderNo,
    tenantId: order.organization?.name ?? order.organizationId,
    user: order.user?.displayName ?? order.user?.email ?? "-",
    plan: order.plan?.name ?? order.subject,
    amount: `${(order.amountCents / 100).toFixed(2)} ${order.currency}`,
    amountCents: order.amountCents,
    channel: order.provider.toLowerCase(),
    status: metadata.refundRequested ? "refund_review" : order.status.toLowerCase(),
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString()
  };
}

function formatModerationContent(content: Content & { creator?: User | null; project?: { brandName: string } | null }) {
  return {
    id: content.id,
    title: content.title,
    tenantId: content.project?.brandName ?? content.projectId,
    contentType: content.contentType,
    status: content.status.toLowerCase(),
    qualityScore: qualityScore(content),
    riskTags: riskTags(content),
    createdAt: content.createdAt.toISOString()
  };
}

function formatContentForClient(content: Content) {
  return {
    id: content.id,
    title: content.title,
    contentType: content.contentType,
    status: content.status === ContentStatus.APPROVED ? "approved" : content.status === ContentStatus.REJECTED ? "rejected" : content.status.toLowerCase(),
    reviewNote: content.reviewNotes,
    qualityScore: qualityScore(content),
    channels: ["official knowledge base"],
    body: content.body ?? "",
    seo: { metaTitle: content.title },
    author: "backend",
    createdAt: content.createdAt.toISOString()
  };
}

function formatAuditLog(log: AuditLog & { actor?: User | null; organization?: { name: string } | null }) {
  return {
    id: log.id,
    ts: log.createdAt.toISOString(),
    createdAt: log.createdAt.toISOString(),
    userId: log.actor?.displayName ?? log.actor?.email ?? log.actorUserId ?? "-",
    tenantId: log.organization?.name ?? log.organizationId ?? "-",
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    severity: log.severity.toLowerCase(),
    details: toRecord(log.metadata)
  };
}

function auditSummary(logs: AuditLog[]) {
  return {
    total: logs.length,
    login: logs.filter((log) => log.action.startsWith("auth.")).length,
    payment: logs.filter((log) => log.action.startsWith("payment.") || log.action.startsWith("billing.")).length,
    admin: logs.filter((log) => log.action.startsWith("admin.")).length,
    security: logs.filter((log) => log.severity === "WARNING" || log.severity === "CRITICAL").length
  };
}

function riskTags(content: Content) {
  const tags: string[] = [];
  const body = content.body ?? "";

  if (/<script|javascript:/i.test(body)) tags.push("script_risk");
  if (/guarantee|100%|absolute/i.test(body)) tags.push("claim_review");
  if (qualityScore(content) < 70) tags.push("quality_low");
  if (!tags.length && content.status === ContentStatus.PENDING_REVIEW) tags.push("manual_review");

  return tags;
}

function qualityScore(content: Content) {
  const metadata = toRecord(content.metadata);
  const value = metadata.qualityScore;

  if (typeof value === "number") {
    return value;
  }

  return content.body && content.body.length > 200 ? 82 : 68;
}

function roleType(role: UserRole) {
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) return "admin";
  if (role === UserRole.BUSINESS_USER) return "business";
  return "personal";
}

function sanitizeConfig(config: Record<string, unknown>) {
  return {
    platformName: stringValue(config.platformName, defaultConfig.platformName),
    siteDomain: stringValue(config.siteDomain, defaultConfig.siteDomain),
    freeTrialDays: numberValue(config.freeTrialDays, defaultConfig.freeTrialDays),
    inviteReward: stringValue(config.inviteReward, defaultConfig.inviteReward),
    defaultPlan: stringValue(config.defaultPlan, defaultConfig.defaultPlan),
    supportEmail: stringValue(config.supportEmail, defaultConfig.supportEmail),
    contentReviewRequired: Boolean(config.contentReviewRequired)
  };
}

function isToday(date: Date) {
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Math.floor(value), min), max);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 240) : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
