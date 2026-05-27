import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const AMP_FULL_QUOTA = 5;
export const AMP_REPLENISHMENT_RATE_PER_HOUR = 0.21;
const cliPath = [
  process.env.PATH,
  join(homedir(), ".local", "bin"),
  process.env.APPDATA ? join(process.env.APPDATA, "npm") : null,
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : null,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
]
  .filter(Boolean)
  .join(delimiter);

export async function getAmpFreeRemaining() {
  return (await getAmpUsageDetails()).display;
}

export interface AmpUsage {
  display: string;
  remaining: number;
}

export async function getAmpUsageDetails(): Promise<AmpUsage> {
  let stdout: string;

  try {
    ({ stdout } = await execFileAsync("amp", ["usage"], {
      env: { ...process.env, PATH: cliPath },
      shell: process.platform === "win32",
    }));
  } catch {
    throw new Error("Unavailable");
  }

  return extractAmpFreeRemaining(stdout);
}

function extractAmpFreeRemaining(output: string) {
  const match = output.match(/^\s*Amp Free:\s*(\$[\d,.]+)/m);

  if (!match) {
    throw new Error("Parse error");
  }

  const remaining = Number.parseFloat(match[1].replace(/[$,]/g, ""));

  if (!Number.isFinite(remaining)) {
    throw new Error("Parse error");
  }

  return {
    display: match[1],
    remaining: clamp(remaining, 0, AMP_FULL_QUOTA),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
