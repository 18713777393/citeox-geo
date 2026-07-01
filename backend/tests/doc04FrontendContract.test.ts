import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html"), "utf8");
const redirects = readFileSync(resolve(process.cwd(), "../frontend/_redirects"), "utf8");

assert.ok(html.includes("让你的品牌，被AI看见、理解、引用、推荐"), "DOC-04 must keep the document main slogan card exactly.");

for (const fn of [
  "function renderDoc04Dashboard(",
  "function syncDoc04Dashboard(",
  "function renderDoc04Skeleton(",
  "function renderDoc04EmptyState(",
  "function renderDoc04ErrorState(",
  "function doc04MetricCountUp(",
  "function openDoc04RefreshModal(",
  "function confirmDoc04Refresh(",
  "function pollDoc04Refresh(",
  "function connectDoc04RefreshSocket(",
  "function openDoc04UpgradeGuide(",
  "function openBrandCreateFromDoc04("
]) {
  assert.ok(html.includes(fn), `DOC-04 frontend must include ${fn}.`);
}

for (const endpoint of [
  "/api/v1/dashboard/overview",
  "/api/v1/dashboard/refresh",
  "/api/v1/dashboard/ws"
]) {
  assert.ok(html.includes(endpoint), `DOC-04 frontend must call ${endpoint}.`);
}

for (const className of [
  "doc04-dashboard",
  "doc04-title-row",
  "doc04-slogan-card",
  "doc04-flow-grid",
  "doc04-flow-step",
  "doc04-step-done",
  "doc04-step-running",
  "doc04-step-pending",
  "doc04-step-locked",
  "doc04-metric-grid",
  "doc04-metric-card",
  "doc04-platform-grid",
  "doc04-platform-card",
  "doc04-platform-mentioned",
  "doc04-platform-missing",
  "doc04-platform-collecting",
  "doc04-platform-failed",
  "doc04-sentiment-bar",
  "doc04-refresh-modal",
  "doc04-refresh-progress",
  "doc04-upgrade-guide",
  "doc04-skeleton",
  "doc04-empty-state",
  "doc04-error-state"
]) {
  assert.ok(html.includes(className), `DOC-04 frontend must include .${className}.`);
}

for (const text of [
  "品牌建立",
  "引用采集",
  "诊断评分",
  "内容策略",
  "素材导入",
  "内容工厂",
  "平台分发",
  "效果复盘",
  "品牌 AI 可见度",
  "引用覆盖率",
  "诊断健康分",
  "优化机会数",
  "数据加载失败",
  "还没有品牌数据",
  "确认刷新数据",
  "刷新中……预计3-5分钟",
  "今日刷新次数已用完",
  "升级解锁"
]) {
  assert.ok(html.includes(text), `DOC-04 frontend must show ${text}.`);
}

assert.ok(html.includes("800") && html.includes("ease-out"), "DOC-04 metric count-up must animate for 800ms ease-out.");
assert.ok(html.includes("500ms ease"), "DOC-04 sentiment bars must animate for 500ms ease.");
assert.ok(html.includes("grid-template-columns:repeat(8") && html.includes("grid-template-columns:repeat(4") && html.includes("grid-template-columns:repeat(2"), "DOC-04 8-step flow must support desktop/tablet/mobile grids.");
assert.ok(html.includes("disabled") && html.includes("doc04-refresh-button"), "DOC-04 refresh button must disable during async refresh.");
assert.ok(html.includes("WebSocket") && html.includes("setTimeout") && html.includes("3000"), "DOC-04 refresh progress must use WebSocket with polling fallback.");
assert.ok(
  html.includes('onclick="openBrandCreateFromDoc04()"') && html.includes("window.bootDoc02Route"),
  "DOC-04 empty state create-brand button must open the DOC-02 wizard immediately, not only change location."
);

assert.ok(
  redirects.includes("/dashboard /GEOFlow-Integrated-Final-White"),
  "Cloudflare redirects must route /dashboard into the app."
);

console.log("DOC-04 frontend dashboard contract checks passed.");
