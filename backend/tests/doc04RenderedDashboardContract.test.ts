import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";

const html = readFileSync(resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html"), "utf8");

const scriptMatch = html.match(
  /<script id="citeox-doc04-dashboard-commercial-final-20260701">([\s\S]*?)<\/script>/
);
assert.ok(scriptMatch, "DOC-04 must include the commercial final dashboard renderer script.");

const script = scriptMatch[1]!;
assert.ok(script.includes("window.__doc04RenderSnapshot"), "DOC-04 renderer must expose a render snapshot hook for real output tests.");
assert.ok(script.includes("doc04-preview=1") && script.includes("127\\.0\\.0\\.1") && script.includes("localhost"), "DOC-04 local preview must be guarded to local development hosts only.");
assert.ok(script.includes("doc04-dashboard-view") && script.includes(".content>.stats"), "DOC-04 dashboard mode must hide the old dashboard stats shell.");
assert.ok(script.includes(".content>.title") && script.includes("body.doc04-dashboard-view .tabs"), "DOC-04 dashboard mode must hide old title actions and legacy tabs so the document layout owns the page.");
assert.ok(script.includes("refreshRealtime()") && script.includes("runAll()"), "DOC-04 dashboard mode must hide old top action buttons that duplicate the document refresh flow.");
assert.ok(script.includes("syncDoc04Route") && script.includes('history.replaceState(null,"","/dashboard")'), "DOC-04 dashboard mode must sync the address bar to /dashboard.");
assert.ok(script.includes("isDoc02WizardOpen") && script.includes("canDoc04OwnCurrentView"), "DOC-04 route sync must be guarded so it cannot take over the DOC-02 brand-create wizard.");
assert.ok(script.includes("if(isDoc02WizardOpen()) return false;"), "DOC-04 must not sync /brand/create to /dashboard while the brand wizard overlay is open.");
assert.ok(script.includes("activateDoc04ShellForLocalDashboard") && script.includes('document.body.classList.add("logged-in")'), "DOC-04 local /dashboard preview must switch into the logged-in workspace shell instead of showing the landing page.");
assert.ok(!script.includes("plaintext"), "DOC-04 final renderer must not include the document plaintext example label.");
assert.ok(!/[┌├└│]/.test(script), "DOC-04 final renderer must not ship the plaintext wireframe box as UI.");

const sandbox: Record<string, any> = {
  window: {},
  console,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  requestAnimationFrame: (fn: (time: number) => void) => fn(800),
  performance: { now: () => 0 },
  document: {
    readyState: "loading",
    head: { appendChild: () => undefined },
    body: { appendChild: () => undefined },
    createElement: () => ({ id: "", className: "", textContent: "", innerHTML: "", style: {}, remove: () => undefined }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => undefined
  },
  location: { pathname: "/dashboard", href: "https://citeox.com/dashboard" },
  S: {
    brand: "Citeox",
    site: "https://citeox.com",
    industry: "GEO",
    preferredPlatforms: ["doubao", "yuanbao", "deepseek", "tongyi"],
    answers: [
      { platform: "doubao", mention: true },
      { platform: "deepseek", mention: true },
      { platform: "tongyi", mention: false }
    ],
    gaps: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}],
    done: { project: true, monitor: true, scoring: true }
  },
  storage: { setItem: () => undefined },
  key: "test",
  openSection: () => undefined,
  isLockedSection: () => false,
  cnErrorMessage: (message: string) => message,
  toastMsg: () => undefined,
  apiRequest: async () => ({}),
  ensureApiToken: async () => "token"
};

sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: "doc04-dashboard-commercial-final.js" });

assert.equal(typeof sandbox.window.__doc04RenderSnapshot, "function", "DOC-04 snapshot renderer must be executable.");

const rendered = sandbox.window.__doc04RenderSnapshot({
  hasBrand: true,
  brand: { name: "Citeox" },
  updatedAt: "2026-06-21T03:00:00.000Z",
  updateLabel: "每日凌晨自动更新",
  metrics: [
    { key: "visibility", label: "品牌 AI 可见度", value: 67, valueText: "67%", trend: "up", trendText: "+6%", hint: "后端聚合评分" },
    { key: "coverage", label: "引用覆盖率", value: 60, valueText: "3/5 平台", trend: "up", trendText: "+1", hint: "实际采集数据" },
    { key: "health", label: "诊断健康分", value: 72, valueText: "72分", trend: "up", trendText: "+4分", hint: "综合评分" },
    { key: "opportunities", label: "优化机会数", value: 12, valueText: "12", trend: "flat", trendText: "12个待处理", hint: "待处理机会" }
  ],
  flowSteps: [
    ["01", "品牌建立", "品牌创建", "project", "done"],
    ["02", "引用采集", "回答监控", "monitor", "done"],
    ["03", "诊断评分", "曝光评分", "scoring", "running"],
    ["04", "内容策略", "内容策略", "strategy", "pending"],
    ["05", "素材导入", "素材库", "assets", "pending"],
    ["06", "内容工厂", "内容工厂", "factory", "pending"],
    ["07", "平台分发", "分发中心", "distribution", "locked"],
    ["08", "效果复盘", "效果复盘", "recheck", "locked"]
  ].map(([index, name, module, route, status]) => ({ index, name, module, route, status, statusText: status })),
  platformCards: [
    { name: "豆包", status: "mentioned", statusText: "已提及", mentioned: true, sourceCount: 12, answerCount: 47, message: "正常数据", sentiment: { positive: 70, neutral: 25, negative: 5 }, lastCollectedAt: "2026-06-21T03:00:00.000Z", detailRoute: "monitor" },
    { name: "DeepSeek", status: "missing", statusText: "未提及", mentioned: false, sourceCount: 0, answerCount: 8, message: "品牌暂未被该 AI 平台提及", sentiment: { positive: 18, neutral: 70, negative: 12 }, lastCollectedAt: "2026-06-21T03:00:00.000Z", detailRoute: "monitor" },
    { name: "通义千问", status: "collecting", statusText: "采集中", mentioned: false, sourceCount: 0, answerCount: 0, message: "数据采集中", sentiment: { positive: 0, neutral: 0, negative: 0 }, lastCollectedAt: null, detailRoute: "monitor" },
    { name: "腾讯元宝", status: "failed", statusText: "采集失败", mentioned: false, sourceCount: 0, answerCount: 0, message: "数据获取失败", sentiment: { positive: 0, neutral: 65, negative: 35 }, lastCollectedAt: null, detailRoute: "monitor" }
  ],
  refresh: { usedToday: 0, dailyLimit: 1, remainingToday: 1, estimatedCost: 2.5, estimatedCostFormatted: "¥2.50", balance: { formatted: "¥128.50" } },
  conversion: { title: "下一步优化建议", body: "先看清品牌表现，再自然引导升级。", preview: ["更多平台监控", "差距诊断", "内容策略", "效果复盘"] }
});

assert.ok(rendered.includes("doc04-dashboard"), "DOC-04 rendered output must be the dashboard component.");
assert.ok(rendered.includes("数据总览"), "DOC-04 rendered output must show the dashboard title.");
assert.ok(rendered.includes("让你的品牌，被AI看见、理解、引用、推荐"), "DOC-04 rendered output must keep the document main slogan exactly.");
assert.equal((rendered.match(/doc04-flow-step/g) ?? []).length, 8, "DOC-04 rendered output must include 8 flow steps.");
assert.equal((rendered.match(/doc04-metric-card/g) ?? []).length, 4, "DOC-04 rendered output must include 4 metric cards.");
assert.equal((rendered.match(/doc04-platform-card/g) ?? []).length, 4, "DOC-04 rendered output must include one card per selected AI platform.");

for (const text of ["品牌建立", "引用采集", "诊断评分", "内容策略", "素材导入", "内容工厂", "平台分发", "效果复盘", "品牌 AI 可见度", "引用覆盖率", "诊断健康分", "优化机会数", "刷新数据", "升级解锁"]) {
  assert.ok(rendered.includes(text), `DOC-04 rendered output must include ${text}.`);
}

assert.ok(!rendered.includes("plaintext"), "DOC-04 rendered output must not show the Markdown code block label.");
assert.ok(!/[┌├└│]/.test(rendered), "DOC-04 rendered output must not show the plaintext wireframe.");

console.log("DOC-04 rendered dashboard contract checks passed.");
