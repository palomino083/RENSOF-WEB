import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}

function isLoginPage(page) {
  const url = page.url().toLowerCase();
  return url.includes("/login");
}

async function maybeLogin(page, username, password) {
  if (!isLoginPage(page)) return;

  const userLocatorCandidates = [
    'input[placeholder*="usuario" i]',
    'input[name="usuario"]',
    'input[type="text"]',
  ];
  const passLocatorCandidates = [
    'input[placeholder*="contras" i]',
    'input[name="password"]',
    'input[type="password"]',
  ];

  let user = null;
  for (const selector of userLocatorCandidates) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) > 0) {
      user = loc;
      break;
    }
  }

  let pass = null;
  for (const selector of passLocatorCandidates) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) > 0) {
      pass = loc;
      break;
    }
  }

  if (!user || !pass) return;

  await user.fill(username);
  await pass.fill(password);

  const button = page.getByRole("button", { name: /iniciar sesi[oó]n|ingresar|entrar/i }).first();
  if ((await button.count()) > 0) {
    await button.click();
  } else {
    await pass.press("Enter");
  }

  await page.waitForTimeout(2500);
}

async function gotoStable(page, targetUrl, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      // Dejamos un pequeño margen para peticiones iniciales y chunks de Next.
      await page.waitForTimeout(1200);
      return;
    } catch (err) {
      lastError = err;
      await page.waitForTimeout(1200 + attempt * 700);
    }
  }
  throw lastError;
}

async function openModule(page, baseUrl, modPath, username, password) {
  const fullUrl = `${baseUrl}${modPath}`;
  await gotoStable(page, fullUrl, 2);

  // Si el módulo rebota al login, autenticamos y volvemos a abrir el módulo una vez.
  if (isLoginPage(page)) {
    await maybeLogin(page, username, password);
    await gotoStable(page, fullUrl, 2);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args.baseUrl || "http://127.0.0.1:3001").replace(/\/$/, "");
  const username = String(args.username || process.env.ALVENT_TEST_USER || "");
  const password = String(args.password || process.env.ALVENT_TEST_PASSWORD || "");
  const strictConsole = toBool(args.strictConsole, false);

  if (!username || !password) {
    throw new Error("Define --username/--password o ALVENT_TEST_USER/ALVENT_TEST_PASSWORD para ejecutar el smoke test.");
  }

  const modules = [
    { name: "Dashboard", path: "/alven/app/dashboard" },
    { name: "POS", path: "/alven/app/pos" },
    { name: "Ventas", path: "/alven/app/ventas" },
    { name: "configuracion", path: "/alven/app/configuracion" },
    { name: "Finanzas", path: "/alven/app/finanzas" },
  ];

  const defaultOutput = path.resolve(process.cwd(), "..", "..", "..", "..", "scripts", "reports", `alvent-ui-smoke-${nowStamp()}.json`);
  const outputPath = path.resolve(String(args.output || defaultOutput));
  ensureDir(path.dirname(outputPath));

  const evidence = {};
  let currentModule = "BOOT";

  const ensureBucket = (name) => {
    if (!evidence[name]) {
      evidence[name] = {
        status422_403_404: [],
        orbOrWs: [],
        consoleTarget: [],
        consoleNonHttp: [],
        consoleWarnings: [],
      };
    }
  };

  const addUnique = (arr, value) => {
    if (!arr.includes(value)) arr.push(value);
  };

  let browser;
  try {
    browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const onResponse = (resp) => {
    const status = resp.status();
    if (status < 400) return;
    const url = resp.url();
    if (!/\/alven\/api|\/uploads\/|_next\//i.test(url)) return;

    ensureBucket(currentModule);
    const line = `${status} ${url}`;
    if ([422, 403, 404].includes(status)) {
      addUnique(evidence[currentModule].status422_403_404, line);
    }
  };

  const onRequestFailed = (req) => {
    const failure = req.failure();
    const line = `${req.method()} ${req.url()} :: ${failure ? failure.errorText : "failed"}`;
    if (!/ORB|websocket|ws:|webpack-hmr|_next\/webpack-hmr/i.test(line)) return;

    ensureBucket(currentModule);
    addUnique(evidence[currentModule].orbOrWs, line);
  };

  const onConsole = (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;

    ensureBucket(currentModule);
    const txt = String(msg.text() || "");
    const networkTarget = /ORB|websocket|webpack-hmr/i.test(txt);
    const isHttpStatusConsole = /Failed to load resource: the server responded with a status of \d{3}/i.test(txt);
    const isNextRscFallbackNoise = /Failed to fetch RSC payload.*Falling back to browser navigation/i.test(txt);
    const normalized = `[${type}] ${txt.slice(0, 260)}`;

    // Next puede registrar este error de forma intermitente cuando reintenta
    // navegación entre rutas; no implica fallo funcional del módulo.
    if (isNextRscFallbackNoise) {
      return;
    }

    if (networkTarget) {
      addUnique(evidence[currentModule].consoleTarget, normalized);
    } else if (type === "error" && !isHttpStatusConsole) {
      // Modo estricto: errores de consola no relacionados a estados HTTP.
      addUnique(evidence[currentModule].consoleNonHttp, normalized);
    } else if (type === "warning") {
      addUnique(evidence[currentModule].consoleWarnings, normalized);
    }
  };

  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("console", onConsole);

  currentModule = "AUTH";
  ensureBucket(currentModule);
  await gotoStable(page, `${baseUrl}/alven/app/dashboard`, 2);
  await maybeLogin(page, username, password);

  for (const mod of modules) {
    currentModule = mod.name;
    ensureBucket(currentModule);
    await openModule(page, baseUrl, mod.path, username, password);
    await page.waitForTimeout(2200);
  }

  page.off("response", onResponse);
  page.off("requestfailed", onRequestFailed);
  page.off("console", onConsole);

  await context.close();
  await browser.close();

  const summary = modules.map((mod) => {
    const bucket = evidence[mod.name] || {
      status422_403_404: [],
      orbOrWs: [],
      consoleTarget: [],
      consoleNonHttp: [],
      consoleWarnings: [],
    };

    return {
      module: mod.name,
      clean:
        bucket.status422_403_404.length === 0
        && bucket.orbOrWs.length === 0
        && (!strictConsole || bucket.consoleNonHttp.length === 0),
      status422_403_404_count: bucket.status422_403_404.length,
      orb_or_ws_count: bucket.orbOrWs.length,
      console_target_count: bucket.consoleTarget.length,
      console_non_http_count: bucket.consoleNonHttp.length,
      console_warning_count: bucket.consoleWarnings.length,
    };
  });

  const allClean = summary.every((row) => row.clean);
  const result = {
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    username,
    modules: modules.map((m) => m.name),
    strict_console: strictConsole,
    all_clean: allClean,
    summary,
    evidence,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`ALVENT_UI_SMOKE_REPORT=${outputPath}`);
  console.log(`ALVENT_UI_SMOKE_ALL_CLEAN=${allClean}`);

  if (!allClean) {
    process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error("ALVENT_UI_SMOKE_ERROR", err);
  process.exit(1);
});
