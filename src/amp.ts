import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = [
  process.env.PATH,
  join(homedir(), ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
]
  .filter(Boolean)
  .join(delimiter);

export async function getAmpFreeRemaining() {
  let stdout: string;

  try {
    ({ stdout } = await execFileAsync("amp", ["usage"], { env: { ...process.env, PATH: cliPath } }));
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

  return match[1];
}
