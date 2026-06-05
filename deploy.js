import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GITHUB_USER = "eli281193-cpu";
const REPO_NAME = "eli-tools";
const ACCOUNT_ID = "88781688ab38b45bcd2b5f513036980a";

function ask(rl, q) {
  return new Promise(res => rl.question(q, res));
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      stdio: opts.silent ? "pipe" : "inherit",
      encoding: "utf8",
      cwd: __dirname
    });
  } catch (e) {
    if (opts.ignore) return "";
    console.error(`\n❌ נכשל: ${cmd}`);
    if (!opts.noExit) process.exit(1);
    return "";
  }
}

function ps(cmd, opts = {}) {
  const result = spawnSync("powershell", ["-Command", cmd], {
    encoding: "utf8",
    cwd: __dirname,
    stdio: opts.silent ? "pipe" : "inherit"
  });
  if (opts.silent) return result.stdout?.trim() || "";
  return result.status === 0;
}

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   🚀  eli-tools — Deploy Script v2       ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // ── 1. Git check ──────────────────────────────────────────────────────────
  process.stdout.write("🔍 בודק Git... ");
  try { execSync("git --version", { stdio: "pipe" }); console.log("✅"); }
  catch {
    console.log("❌\nGit לא מותקן: https://git-scm.com/download/win");
    process.exit(1);
  }

  // ── 2. טוקנים ─────────────────────────────────────────────────────────────
  const envPath = path.join(__dirname, ".env");
  let GITHUB_TOKEN = "", CF_TOKEN = "";

  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const [k, ...rest] = line.split("=");
      const v = rest.join("=").trim();
      if (k?.trim() === "GITHUB_TOKEN") GITHUB_TOKEN = v;
      if (k?.trim() === "CF_TOKEN") CF_TOKEN = v;
    }
    if (GITHUB_TOKEN && CF_TOKEN) console.log("🔑 טוקנים נטענו מ-.env ✅\n");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  if (!GITHUB_TOKEN) {
    console.log("🔑 הכנס GitHub Token (מתחיל ב-ghp_):");
    GITHUB_TOKEN = (await ask(rl, "   > ")).trim();
  }
  if (!CF_TOKEN) {
    console.log("🔑 הכנס Cloudflare API Token:");
    CF_TOKEN = (await ask(rl, "   > ")).trim();
  }

  writeFileSync(envPath, `GITHUB_TOKEN=${GITHUB_TOKEN}\nCF_TOKEN=${CF_TOKEN}\n`, { mode: 0o600 });
  console.log("✅ טוקנים נשמרו ב-.env\n");
  rl.close();

  // ── 3. .gitignore ─────────────────────────────────────────────────────────
  const gitignorePath = path.join(__dirname, ".gitignore");
  writeFileSync(gitignorePath, ".env\n.env.*\nnode_modules/\n.wrangler/\n.DS_Store\nThumbs.db\n");
  console.log("✅ .gitignore מעודכן\n");

  // ── 4. Git init ───────────────────────────────────────────────────────────
  console.log("📁 מגדיר Git...");
  if (!existsSync(path.join(__dirname, ".git"))) {
    run("git init");
    run("git branch -M main", { ignore: true });
  }
  run(`git remote remove origin`, { ignore: true });
  run(`git remote add origin https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git`);
  try { execSync("git config user.email", { stdio: "pipe", cwd: __dirname }); }
  catch { run(`git config user.email "eli281193@users.noreply.github.com"`); }
  try { execSync("git config user.name", { stdio: "pipe", cwd: __dirname }); }
  catch { run(`git config user.name "Eli"`); }
  console.log("✅ Git מוכן\n");

  // ── 5. ניקוי .env מ-Git history ──────────────────────────────────────────
  console.log("🔒 מנקה טוקנים מ-Git history...");
  
  // בדוק אם .env בכלל היה ב-history
  const envInHistory = run(`git log --all --full-history -- .env`, { silent: true, ignore: true });
  
  if (envInHistory && envInHistory.trim()) {
    console.log("   נמצא .env ב-history — מנקה...");
    
    // שיטה פשוטה: מחק את כל ה-history וצור commit חדש
    run(`git checkout --orphan clean-branch`, { ignore: true });
    run(`git reset`, { ignore: true });
    run(`git add .`, { ignore: true });
    run(`git commit -m "initial: eli-tools clean"`, { ignore: true });
    run(`git branch -D main`, { ignore: true });
    run(`git branch -m main`, { ignore: true });
    console.log("   ✅ History נוקה\n");
  } else {
    console.log("   ✅ History נקי\n");
  }

  // ── 6. GitHub repo ────────────────────────────────────────────────────────
  console.log("🔍 בודק GitHub repo...");
  const repoStatus = run(
    `git ls-remote https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${REPO_NAME}.git HEAD`,
    { silent: true, ignore: true, noExit: true }
  );

  if (!repoStatus || repoStatus.trim() === "") {
    console.log("📦 יוצר repo ב-GitHub...");
    spawnSync("curl", [
      "-s", "-X", "POST",
      "-H", `Authorization: token ${GITHUB_TOKEN}`,
      "-H", "Content-Type: application/json",
      "https://api.github.com/user/repos",
      "-d", JSON.stringify({ name: REPO_NAME, private: false, description: "Eli online tools" })
    ], { stdio: "pipe" });
    console.log(`✅ Repo נוצר\n`);
  } else {
    console.log(`✅ Repo קיים\n`);
  }

  // ── 7. Push ───────────────────────────────────────────────────────────────
  console.log("📤 מעלה ל-GitHub...");
  run("git add .");
  const status = run("git status --porcelain", { silent: true, ignore: true })?.trim();
  if (status) {
    run(`git commit -m "deploy: timer + privacy + ads.txt"`, { ignore: true });
  }
  
  const pushResult = spawnSync("git", ["push", "-u", "origin", "main", "--force"], {
    encoding: "utf8", cwd: __dirname, stdio: "inherit"
  });
  
  if (pushResult.status !== 0) {
    console.log("⚠️  נסיון push עם master...");
    spawnSync("git", ["push", "-u", "origin", "master", "--force"], {
      encoding: "utf8", cwd: __dirname, stdio: "inherit"
    });
  }
  console.log("✅ GitHub מעודכן\n");

  // ── 8. Cloudflare Pages deploy ────────────────────────────────────────────
  console.log("☁️  מעלה ל-Cloudflare Pages...");

  process.env.CLOUDFLARE_API_TOKEN = CF_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT_ID;

  try { execSync("npx wrangler --version", { stdio: "pipe" }); }
  catch {
    console.log("📦 מתקין wrangler...");
    execSync("npm install -g wrangler", { stdio: "inherit" });
  }

  // ודא שפרויקט ה-Pages קיים — wrangler לא יוצר אותו אוטומטית ב-deploy.
  // בודקים מול ה-API ישירות (אמין יותר מפענוח פלט הטבלה של wrangler).
  const check = spawnSync("curl", [
    "-s",
    "-H", `Authorization: Bearer ${CF_TOKEN}`,
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${REPO_NAME}`
  ], { encoding: "utf8", cwd: __dirname, stdio: "pipe" });
  const projectExists = /"success"\s*:\s*true/.test(check.stdout || "");
  if (!projectExists) {
    console.log(`📦 יוצר פרויקט Pages '${REPO_NAME}'...`);
    const create = spawnSync(
      "npx", ["wrangler", "pages", "project", "create", REPO_NAME, "--production-branch", "main"],
      { encoding: "utf8", cwd: __dirname, stdio: "inherit", env: { ...process.env }, shell: true }
    );
    if (create.status !== 0) {
      console.error(`\n❌ יצירת פרויקט Pages '${REPO_NAME}' נכשלה`);
      process.exit(1);
    }
  }

  let deploy = spawnSync(
    "npx", ["wrangler", "pages", "deploy", ".", "--project-name", REPO_NAME, "--commit-dirty=true"],
    { encoding: "utf8", cwd: __dirname, stdio: "inherit", env: { ...process.env }, shell: true }
  );

  if (deploy.status !== 0) {
    console.log("⚠️  נסיון שני...");
    deploy = spawnSync(
      "npx", ["wrangler", "pages", "deploy", ".", "--project-name", REPO_NAME, "--commit-dirty=true", "--branch", "main"],
      { encoding: "utf8", cwd: __dirname, stdio: "inherit", env: { ...process.env }, shell: true }
    );
  }

  if (deploy.status !== 0) {
    console.error("\n╔══════════════════════════════════════════╗");
    console.error("║   ❌  ההעלאה ל-Cloudflare נכשלה!         ║");
    console.error("╚══════════════════════════════════════════╝");
    console.error("\n   GitHub עודכן, אבל Cloudflare Pages לא.");
    console.error("   בדוק את הודעת השגיאה של wrangler למעלה.\n");
    process.exit(1);
  }

  // ── 9. סיום ───────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   ✅  הכל עלה בהצלחה!                    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\n🌐 דף בית:  https://${REPO_NAME}.pages.dev`);
  console.log(`⏱  טיימר:   https://${REPO_NAME}.pages.dev/timer`);
  console.log(`🔒 פרטיות:  https://${REPO_NAME}.pages.dev/privacy`);
  console.log(`📁 GitHub:  https://github.com/${GITHUB_USER}/${REPO_NAME}\n`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
