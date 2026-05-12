import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_AUTH_FILE = join(homedir(), ".codex", "auth.json");
const CODEX_USAGE_API = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_TIMEOUT_MS = 10000;
const CODEX_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

export interface CodexUsage {
  display: string;
  fiveHourResetAt: number;
  weeklyResetAt: number;
}

export async function getCodexUsage() {
  return (await getCodexUsageDetails()).display;
}

export async function getCodexUsageDetails(): Promise<CodexUsage> {
  const token = readCodexAccessToken();

  if (!token) {
    throw new Error("Not logged in");
  }

  const response = await fetchCodexUsage(token);

  if (response.status === 401) {
    throw new Error("Login expired");
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return formatCodexUsage(await response.json());
}

async function fetchCodexUsage(token: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CODEX_TIMEOUT_MS);

  try {
    return await fetch(CODEX_USAGE_API, {
      headers: {
        ...CODEX_HEADERS,
        Authorization: normalizeBearerToken(token),
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Timed out");
    }

    throw new Error("Network error");
  } finally {
    clearTimeout(timeoutId);
  }
}

function readCodexAccessToken() {
  try {
    if (!existsSync(CODEX_AUTH_FILE)) {
      return null;
    }

    const parsed = JSON.parse(readFileSync(CODEX_AUTH_FILE, "utf-8")) as {
      tokens?: { access_token?: string };
    };
    const token = parsed.tokens?.access_token?.trim();

    return token || null;
  } catch {
    return null;
  }
}

function normalizeBearerToken(token: string) {
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

function formatCodexUsage(data: unknown) {
  if (!data || typeof data !== "object") {
    throw new Error("Parse error");
  }

  const response = data as {
    rate_limit?: {
      primary_window?: { used_percent?: number; reset_at?: number };
      secondary_window?: { used_percent?: number; reset_at?: number };
    };
  };
  const primaryWindow = response.rate_limit?.primary_window;
  const secondaryWindow = response.rate_limit?.secondary_window;
  const primaryUsedPercent = primaryWindow?.used_percent;
  const secondaryUsedPercent = secondaryWindow?.used_percent;
  const primaryResetAt = primaryWindow?.reset_at;
  const secondaryResetAt = secondaryWindow?.reset_at;

  if (
    !isValidPercent(primaryUsedPercent) ||
    !isValidPercent(secondaryUsedPercent) ||
    !isValidUnixTimestamp(primaryResetAt) ||
    !isValidUnixTimestamp(secondaryResetAt)
  ) {
    throw new Error("Parse error");
  }

  return {
    display: `${formatRemainingPercent(primaryUsedPercent)} 5hr / ${formatRemainingPercent(secondaryUsedPercent)} weekly`,
    fiveHourResetAt: primaryResetAt,
    weeklyResetAt: secondaryResetAt,
  };
}

function formatRemainingPercent(usedPercent: number) {
  return `${Math.round(clamp(100 - usedPercent, 0, 100))}%`;
}

function isValidPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidUnixTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
