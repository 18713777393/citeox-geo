import { ProjectStatus, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";
import type { AuthContext } from "../middleware/auth.js";
import { checkBalance, deductCreditsInTransaction, estimateCost } from "./credits.js";
import { getEntitlementSnapshotForUser } from "./entitlements.js";
import { enqueueDiagnosisTask } from "./diagnosisQueue.js";
import { isKnownCategory, isKnownIndustry } from "./industry.js";

export interface BrandCreateInput {
  industry: string;
  subIndustry?: string;
  category?: string;
  brandName: string;
  website?: string;
  goal: string;
  platforms: string[];
  competitors?: string[];
  keywords?: string[];
}

const validGoals = new Set(["exposure", "traffic", "trust", "competitive", "all"]);
const validPlatforms = new Set([
  "doubao",
  "deepseek",
  "wenxin",
  "zhipu",
  "yuanbao",
  "tongyi",
  "kimi",
  "metaso",
  "ai360",
  "xinghuo"
]);
const proPlatforms = new Set(["doubao", "yuanbao", "deepseek", "tongyi"]);

export async function checkBrandCreateLimit(userId: string) {
  const snapshot = await getEntitlementSnapshotForUser(userId);
  const planCode = snapshot?.plan.code ?? "free";
  const limit = snapshot?.limits.projects ?? 1;
  const used = await prisma.brandProject.count({
    where: {
      userId,
      status: "active",
      deletedAt: null
    }
  });

  return {
    canCreate: limit === null || used < limit,
    used,
    limit,
    planCode,
    platformLimit: platformLimitForPlan(planCode)
  };
}

export async function createBrandProject(auth: AuthContext, input: BrandCreateInput) {
  const validated = validateBrandCreateInput(input);
  const limitDecision = await checkBrandCreateLimit(auth.userId);
  if (!limitDecision.canCreate) {
    throw new HttpError(403, "BRAND_LIMIT_EXCEEDED", "当前套餐可创建品牌数量已用完，请升级套餐后继续。");
  }

  assertPlatformLimit(limitDecision.planCode, validated.platforms);
  const cost = await estimateCost(validated.platforms, "brand_diagnosis");
  const enough = await checkBalance(auth.userId, cost.total);
  if (!enough) {
    throw new HttpError(402, "INSUFFICIENT_BALANCE", `余额不足，首次诊断预计消耗 ${cost.totalFormatted}，请先充值。`);
  }

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        organizationId: auth.organizationId,
        ownerId: auth.userId,
        name: validated.brandName,
        brandName: validated.brandName,
        industry: [validated.industry, validated.subIndustry].filter(Boolean).join(" > "),
        status: ProjectStatus.ACTIVE,
        settings: {
          source: "doc02_brand_create_wizard",
          website: validated.website,
          site: validated.website,
          goal: validated.goal,
          platforms: validated.platforms,
          competitors: validated.competitors,
          keywords: validated.keywords
        } as Prisma.InputJsonObject
      }
    });

    const brandProject = await tx.brandProject.create({
      data: {
        userId: auth.userId,
        projectId: project.id,
        industry: validated.industry,
        subIndustry: validated.subIndustry,
        brandName: validated.brandName,
        website: validated.website,
        goal: validated.goal,
        platforms: validated.platforms
      }
    });

    if (validated.competitors.length) {
      await tx.competitor.createMany({
        data: validated.competitors.map((name, index) => ({
          brandProjectId: brandProject.id,
          name,
          sortOrder: index
        }))
      });
    }

    if (validated.keywords.length) {
      await tx.keyword.createMany({
        data: validated.keywords.map((keyword, index) => ({
          brandProjectId: brandProject.id,
          keyword,
          category: "brand",
          sortOrder: index
        }))
      });
    }

    const diagnosisTask = await tx.diagnosisTask.create({
      data: {
        brandProjectId: brandProject.id,
        userId: auth.userId,
        status: "pending",
        progress: 0,
        currentStep: "正在保存品牌信息...",
        totalCost: cost.total
      }
    });

    await deductCreditsInTransaction(tx, {
      userId: auth.userId,
      amount: cost.total,
      models: validated.platforms,
      operation: "brand_diagnosis",
      operationId: diagnosisTask.id,
      description: "品牌首次诊断"
    });

    await tx.user.update({
      where: { id: auth.userId },
      data: { hasBrand: true }
    });

    return { project, brandProject, diagnosisTask };
  });

  await enqueueDiagnosisTask(result.diagnosisTask.id);

  return {
    brandId: result.brandProject.id,
    projectId: result.project.id,
    diagnosisTaskId: result.diagnosisTask.id,
    estimatedDuration: 300,
    cost,
    brand: await getBrandProject(auth.userId, result.brandProject.id)
  };
}

export async function getBrandProject(userId: string, brandId: string) {
  const brand = await prisma.brandProject.findFirst({
    where: {
      id: brandId,
      userId,
      deletedAt: null
    },
    include: {
      competitors: { orderBy: { sortOrder: "asc" } },
      keywords: { orderBy: { sortOrder: "asc" } },
      diagnosisTasks: { orderBy: { createdAt: "desc" }, take: 5 }
    }
  });

  if (!brand) {
    throw new HttpError(404, "BRAND_NOT_FOUND", "品牌项目不存在或您没有访问权限。");
  }

  return formatBrandProject(brand);
}

export function validateBrandCreateInput(input: BrandCreateInput) {
  const industry = cleanText(input.industry, 100);
  const subIndustry = cleanText(input.subIndustry ?? input.category, 100);
  const brandName = cleanText(input.brandName, 100);
  const goal = cleanText(input.goal, 50);
  const platforms = uniqueList(input.platforms, 10).map(normalizePlatform);
  const competitors = uniqueList(input.competitors ?? [], 5);
  const keywords = uniqueList(input.keywords ?? [], 10);
  const website = normalizeWebsite(input.website);

  if (!industry || !isKnownIndustry(industry)) {
    throw new HttpError(400, "VALIDATION_ERROR", "请选择有效的一级行业。");
  }
  if (!subIndustry) {
    throw new HttpError(400, "VALIDATION_ERROR", "请选择具体品类。");
  }
  if (!isKnownCategory(industry, subIndustry)) {
    throw new HttpError(400, "VALIDATION_ERROR", "所选品类与行业不匹配。");
  }
  if (!brandName) {
    throw new HttpError(400, "VALIDATION_ERROR", "请输入品牌名称。");
  }
  if (brandName.length < 2 || brandName.length > 30) {
    throw new HttpError(400, "VALIDATION_ERROR", "品牌名称需要2-30个字符。");
  }
  if (/^\d+$/.test(brandName)) {
    throw new HttpError(400, "VALIDATION_ERROR", "品牌名称不能为纯数字。");
  }
  if (!/^[\u3400-\u9fffA-Za-z0-9 &-]+$/.test(brandName)) {
    throw new HttpError(400, "VALIDATION_ERROR", "品牌名称仅支持中文、英文、数字、空格、&和-。");
  }
  if (!validGoals.has(goal)) {
    throw new HttpError(400, "VALIDATION_ERROR", "请选择品牌目标。");
  }
  if (!platforms.length) {
    throw new HttpError(400, "VALIDATION_ERROR", "请至少选择一个目标 AI 平台。");
  }
  for (const platform of platforms) {
    if (!validPlatforms.has(platform)) {
      throw new HttpError(400, "VALIDATION_ERROR", `目标 AI 平台 ${platform} 暂不支持。`);
    }
  }

  return {
    industry,
    subIndustry,
    brandName,
    website,
    goal,
    platforms,
    competitors,
    keywords
  };
}

export function platformLimitForPlan(planCode = "free") {
  const code = planCode.toLowerCase();
  if (code.includes("enterprise") || code.includes("admin")) return Infinity;
  if (code.includes("pro")) return 4;
  if (code.includes("personal") || code.includes("starter")) return 2;
  return 1;
}

function assertPlatformLimit(planCode: string, platforms: string[]) {
  const limit = platformLimitForPlan(planCode);
  if (platforms.length > limit) {
    throw new HttpError(403, "PLATFORM_LIMIT_EXCEEDED", "已超过当前套餐可选择的 AI 平台数量。");
  }

  if (planCode.toLowerCase().includes("pro")) {
    const blocked = platforms.find((platform) => !proPlatforms.has(platform));
    if (blocked) {
      throw new HttpError(403, "PLATFORM_LIMIT_EXCEEDED", "专业版仅支持豆包、腾讯元宝、DeepSeek、通义千问。");
    }
  }
}

function formatBrandProject(brand: {
  id: string;
  projectId: string | null;
  industry: string;
  subIndustry: string | null;
  brandName: string;
  website: string | null;
  goal: string;
  platforms: Prisma.JsonValue;
  diagnosisCount: number;
  maxDiagnosis: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  competitors?: Array<{ id: string; name: string; sortOrder: number }>;
  keywords?: Array<{ id: string; keyword: string; category: string; sortOrder: number }>;
  diagnosisTasks?: Array<{
    id: string;
    status: string;
    progress: number;
    currentStep: string | null;
    totalCost: Prisma.Decimal | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: brand.id,
    projectId: brand.projectId,
    industry: brand.industry,
    subIndustry: brand.subIndustry,
    brandName: brand.brandName,
    website: brand.website,
    goal: brand.goal,
    platforms: Array.isArray(brand.platforms) ? brand.platforms : [],
    diagnosisCount: brand.diagnosisCount,
    maxDiagnosis: brand.maxDiagnosis,
    status: brand.status,
    competitors: (brand.competitors ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      sortOrder: item.sortOrder
    })),
    keywords: (brand.keywords ?? []).map((item) => ({
      id: item.id,
      keyword: item.keyword,
      category: item.category,
      sortOrder: item.sortOrder
    })),
    diagnosisTasks: (brand.diagnosisTasks ?? []).map((item) => ({
      id: item.id,
      status: item.status,
      progress: item.progress,
      currentStep: item.currentStep,
      totalCost: item.totalCost == null ? null : Number(item.totalCost.toString()),
      createdAt: item.createdAt.toISOString()
    })),
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString()
  };
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function uniqueList(value: unknown, maxLength: number) {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map((item) => cleanText(item, 100)).filter(Boolean))].slice(0, maxLength);
}

function normalizePlatform(value: string) {
  const normalized = value.toLowerCase().trim();
  const aliases: Record<string, string> = {
    "360": "ai360",
    "360智脑": "ai360",
    doubao: "doubao",
    "豆包": "doubao",
    deepseek: "deepseek",
    ds: "deepseek",
    wenxin: "wenxin",
    "文心一言": "wenxin",
    zhipu: "zhipu",
    "智谱清言": "zhipu",
    yuanbao: "yuanbao",
    "腾讯元宝": "yuanbao",
    tongyi: "tongyi",
    "通义千问": "tongyi",
    kimi: "kimi",
    metaso: "metaso",
    "秘塔 ai 搜索": "metaso",
    "秘塔AI搜索": "metaso",
    xinghuo: "xinghuo",
    "讯飞星火": "xinghuo"
  };
  return aliases[normalized] ?? normalized.replace(/[^a-z0-9]/g, "");
}

function normalizeWebsite(value: unknown) {
  const raw = cleanText(value, 500);
  if (!raw) return null;
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(candidate).toString();
  } catch {
    throw new HttpError(400, "VALIDATION_ERROR", "请输入正确的网址格式。");
  }
}
