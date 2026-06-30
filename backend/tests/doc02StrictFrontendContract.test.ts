import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(process.cwd(), "../frontend/GEOFlow-Integrated-Final-White.html"), "utf8");

function mustInclude(token: string, message: string) {
  assert.ok(html.includes(token), message);
}

for (const token of [
  "function shouldOpenDoc02WizardForCurrentLocation(",
  'location.protocol === "file:"',
  "doc02-local-preview"
]) {
  mustInclude(token, `DOC-02 local preview must include ${token}.`);
}

for (const token of [
  ".doc02-wizard-overlay{position:fixed;inset:0;z-index:50;background:#fff",
  ".doc02-step-progress{position:sticky;top:40px",
  "#3B82F6",
  "#D1D5DB",
  "@keyframes pulse",
  "scale(1.3)",
  "opacity:.6",
  "animation:pulse 1.5s"
]) {
  mustInclude(token, `DOC-02 progress/fullscreen style must include ${token}.`);
}

for (const token of [
  "doc02-cascade-primary",
  "width:200px",
  "doc02-cascade-secondary",
  "width:220px",
  "transition:max-height 200ms ease",
  'id="doc02-category-search"',
  "position:sticky;top:0"
]) {
  mustInclude(token, `DOC-02 industry/category selector must include ${token}.`);
}

for (const token of [
  "doc02-tip-bubble",
  "transition-delay:300ms",
  "grid-template-columns:repeat(5,minmax(0,1fr))",
  "border:2px solid #3B82F6",
  "background:#EFF6FF",
  "grid-template-columns:repeat(4,minmax(0,1fr))",
  ".doc02-platform.disabled",
  "cursor:not-allowed"
]) {
  mustInclude(token, `DOC-02 first-step card details must include ${token}.`);
}

for (const token of [
  "transition:opacity 200ms ease,transform 200ms ease",
  "doc02-tags span:active",
  "scale(.98)",
  "[,\\uFF0C]",
  'event.key === "Enter"',
  'event.key === ","'
]) {
  mustInclude(token, `DOC-02 competitor/keyword interaction must include ${token}.`);
}

for (const token of [
  ".doc02-bottom-actions{position:sticky;bottom:0;background:#fff;box-shadow:0 -4px 12px rgba(0,0,0,.05);padding:16px 24px",
  "gap:16px",
  "min-width:120px",
  "height:44px",
  "border-radius:8px",
  "background:#fff;color:#374151;border:1px solid #D1D5DB",
  "background:#3B82F6;color:#fff"
]) {
  mustInclude(token, `DOC-02 bottom action bar must include ${token}.`);
}

for (const token of [
  "transform:scale(.96)",
  "opacity:0",
  "transition:opacity 200ms ease,transform 200ms ease",
  'location.href = "/dashboard"'
]) {
  mustInclude(token, `DOC-02 confirmation/progress flow must include ${token}.`);
}

for (const token of [
  "diagnosisSocket",
  "new WebSocket",
  "/api/v1/diagnosis/ws",
  "diagnosis.progress"
]) {
  mustInclude(token, `DOC-02 frontend realtime progress must include ${token}.`);
}

console.log("DOC-02 strict frontend detail contract checks passed.");
