import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html"), "utf8");
const redirects = readFileSync(resolve(process.cwd(), "../frontend/_redirects"), "utf8");

assert.ok(html.includes('id="citeox-doc02-brand-wizard"'), "DOC-02 frontend must include the final brand wizard script.");
assert.ok(html.includes("/brand/create"), "DOC-02 frontend must define /brand/create route.");
assert.ok(redirects.includes("/brand/create /GEOFlow-Integrated-Final-White"), "DOC-02 Cloudflare redirects must serve /brand/create.");

for (const token of [
  "citeoxBrandWizard",
  "brandWizardStep",
  "citeox_brand_create_draft",
  "doc02-guide-modal",
  "doc02-wizard-overlay",
  "doc02-step-progress",
  "doc02-bottom-actions",
  "doc02-confirm-modal",
  "doc02-progress-modal"
]) {
  assert.ok(html.includes(token), `DOC-02 frontend must include ${token}.`);
}

for (const text of [
  "第一步：告诉我们您的品牌",
  "第二步：设置竞品对标与关键词",
  "第三步：确认提交",
  "品牌信息",
  "竞品关键词",
  "确认提交",
  "欢迎来到 Citeox",
  "信息提交后将不可自行修改",
  "注意：每增加一个监测平台将消耗更多 API 调用费用",
  "重要提示",
  "新用户仅可创建 1个品牌",
  "首次诊断预计耗时 3-5 分钟",
  "确认提交品牌信息？",
  "预计消耗",
  "余额不足，请先充值",
  "正在保存品牌信息",
  "正在启动数据采集",
  "品牌创建成功"
]) {
  assert.ok(html.includes(text), `DOC-02 frontend must show "${text}".`);
}

for (const endpoint of [
  "/api/v1/brands",
  "/api/v1/brands/check-limit",
  "/api/v1/industry/categories",
  "/api/v1/industry/search",
  "/api/v1/diagnosis/tasks/"
]) {
  assert.ok(html.includes(endpoint), `DOC-02 frontend must call ${endpoint}.`);
}

for (const fn of [
  "function renderBrandCreateWizard()",
  "function openDoc02GuideModal(",
  "function saveBrandWizardDraft(",
  "function restoreBrandWizardDraft(",
  "function validateBrandWizardField(",
  "function debouncedBrandValidation(",
  "function loadDoc02IndustryCategories(",
  "function selectDoc02Goal(",
  "function toggleDoc02Platform(",
  "function addDoc02Competitor(",
  "function addDoc02Keyword(",
  "function openDoc02ConfirmModal(",
  "function submitDoc02Brand(",
  "function startDoc02DiagnosisPolling(",
  "function handleDoc02BeforeUnload("
]) {
  assert.ok(html.includes(fn), `DOC-02 frontend must include ${fn}.`);
}

assert.ok(html.includes("setInterval(saveBrandWizardDraft, 30000"), "DOC-02 draft must auto-save every 30 seconds.");
assert.ok(html.includes("beforeunload") && html.includes("handleDoc02BeforeUnload"), "DOC-02 must confirm before leaving with a draft.");
assert.ok(html.includes("setTimeout") && html.includes("300"), "DOC-02 validation should use a 300ms debounce.");
assert.ok(html.includes("pulse-brand-step"), "DOC-02 current step indicator must pulse.");
assert.ok(html.includes("slideDown") || html.includes("max-height"), "DOC-02 second industry selector/details should animate open.");
assert.ok(html.includes("free: 1") && html.includes("personal: 2") && html.includes("pro: 4") && html.includes("enterprise: Infinity"), "DOC-02 platform limits must match the plan rules.");
assert.ok(html.includes("豆包") && html.includes("DeepSeek") && html.includes("文心一言") && html.includes("腾讯元宝") && html.includes("通义千问"), "DOC-02 platform picker must include the main AI platforms.");
assert.ok(html.includes("最多添加5个竞品"), "DOC-02 competitor list must cap at 5.");
assert.ok(html.includes("最多10个关键词"), "DOC-02 keyword tag input must cap at 10.");
assert.ok(html.includes("Enter") && html.includes("，") && html.includes(","), "DOC-02 keyword input must add tags from Enter/comma/Chinese comma.");
assert.ok(html.includes("location.href = \"/dashboard\"") || html.includes("location.assign(\"/dashboard\")"), "DOC-02 success must redirect to /dashboard.");

console.log("DOC-02 frontend brand wizard contract checks passed.");
