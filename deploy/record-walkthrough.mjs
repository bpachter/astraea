// Records the live deployment as a sequence of real screenshots, captioned,
// for the portfolio card's animated walkthrough. Nothing here is a mockup —
// every frame is the deployed system answering a real request.
//
//   node deploy/record-walkthrough.mjs [outDir]
//
// Playwright resolves from the sibling thessa checkout (this repo has no need
// for a browser dependency of its own).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";

// Playwright ships CommonJS, so require() it: a dynamic import() of a Windows
// path fails the ESM URL-scheme check, and importing the CJS entry yields the
// exports under .default rather than as named bindings.
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ?? "C:/dev/thessa/node_modules/playwright",
);

const OUT = process.argv[2] ?? "C:/Users/benpa/AppData/Local/Temp/claude/frames";
const APP = "https://bpachter.github.io/astraea/";
const GATE = "https://wmc38pwmtw.us-east-2.awsapprunner.com";
const PORTAL = "https://zsc9c6t7g3.us-east-2.awsapprunner.com";

mkdirSync(OUT, { recursive: true });

const frames = [];
async function shot(page, name, caption, hold = 1) {
  const file = `${OUT}/${String(frames.length).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file });
  frames.push({ file, caption, hold });
  console.log(`captured ${name}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });

// --- the static app -------------------------------------------------------
await page.goto(APP, { waitUntil: "networkidle" });
await page.waitForSelector(".ov-status", { timeout: 20000 });
await page.waitForFunction(
  () => document.querySelector(".ov-status")?.textContent?.includes("Live on AWS"),
  { timeout: 20000 },
).catch(() => console.log("  (live probe did not resolve in time)"));
await shot(page, "start", "One rule: nothing publishes unless it reconciles", 2);

// --- the 3D atlas ---------------------------------------------------------
await page.getByRole("button", { name: "ATLAS", exact: true }).click();
await page.waitForSelector(".at-stage canvas", { timeout: 30000 });
await page.waitForTimeout(6000);
await shot(page, "atlas", "24,240 entities: genes rise through reactions to metabolites", 2);

await page.locator(".at-browse summary").click();
await page.locator(".at-browse input[type=search]").fill("6-phosphotransferase");
await page.waitForTimeout(800);
await page.locator(".at-browse-item").first().click();
await page.waitForTimeout(2500);
await shot(page, "atlas-node", "Every node carries its real identifiers and equation", 2);

// --- the live .NET lookup API --------------------------------------------
await page.goto(`${GATE}/lookup`, { waitUntil: "networkidle" });
await page.fill("#q", "GCK");
await page.click("#controls button[type=submit]");
await page.waitForTimeout(1500);
await page.locator("#rows tr[data-id]").first().click();
await page.waitForTimeout(1500);
await shot(page, "lookup", "A versioned .NET lookup API — ASP.NET Core on App Runner", 2);

// --- the governance portal ------------------------------------------------
await page.goto(`${PORTAL}/admin/login/`, { waitUntil: "networkidle" });
await shot(page, "login", "The Django portal, running as a container beside it", 1);

await page.fill("#id_username", "demo");
await page.fill("#id_password", "astraea-demo");
await page.click('input[type="submit"]');
await page.waitForURL("**/admin/**", { timeout: 20000 });
await page.goto(`${PORTAL}/admin/adjudication/proposal/`, { waitUntil: "networkidle" });
await shot(page, "queue", "Seven proposals await a verdict", 1);

await page.locator("#action-toggle").check();
await page.selectOption('select[name="action"]', "run_gate");
await page.click('button[type="submit"][name="index"]');
await page.waitForTimeout(4000);
await shot(page, "verdicts", "Django calls the C# gate: each refusal is named, never 'failed'", 3);

// Attempt to publish something the gate refused.
await page.goto(`${PORTAL}/admin/adjudication/proposal/?gate_status=unreconciled`, {
  waitUntil: "networkidle",
});
await page.locator("#action-toggle").check();
await page.selectOption('select[name="action"]', "approve");
await page.click('button[type="submit"][name="index"]');
await page.waitForTimeout(3000);
await shot(page, "refusal", "Approval is structurally impossible without a passing verdict", 3);

await browser.close();
console.log(JSON.stringify(frames, null, 1));
