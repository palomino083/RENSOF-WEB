const fs = require("fs");
const { execSync } = require("child_process");

function removeNextDir() {
  try {
    fs.rmSync(".next", {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 120,
    });
    return;
  } catch (err) {
    console.warn("[prebuild] fs.rmSync fallo, aplicando fallback:", err.message);
  }

  try {
    if (process.platform === "win32") {
      execSync('if exist .next rmdir /s /q .next', {
        stdio: "inherit",
        shell: "cmd.exe",
      });
    } else {
      execSync("rm -rf .next", { stdio: "inherit" });
    }
  } catch (err) {
    console.warn("[prebuild] fallback de limpieza fallo:", err.message);
  }
}

removeNextDir();
