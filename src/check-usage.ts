import { showToast, Toast } from "@raycast/api";
import { getAmpFreeRemaining } from "./amp";
import { getCodexUsage } from "./codex";

interface UsageResult {
  value: string | null;
  error: string | null;
}

export default async function Command() {
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Checking usage",
  });

  const [amp, codex] = await Promise.all([checkUsage("Amp", getAmpFreeRemaining), checkUsage("Codex", getCodexUsage)]);

  toast.style = amp.value || codex.value ? Toast.Style.Success : Toast.Style.Failure;
  toast.title = "Usage";
  toast.message = `Amp: ${formatUsageResult(amp)} · Codex: ${formatUsageResult(codex)}`;
}

async function checkUsage(provider: string, loadUsage: () => Promise<string>): Promise<UsageResult> {
  const startedAt = Date.now();

  try {
    const value = await loadUsage();

    console.log(`${provider} usage fetch completed in ${Date.now() - startedAt}ms`);

    return { value, error: null };
  } catch (error) {
    console.log(`${provider} usage fetch failed in ${Date.now() - startedAt}ms`);

    return { value: null, error: error instanceof Error ? error.message : "Error" };
  }
}

function formatUsageResult(result: UsageResult) {
  return result.value ?? result.error ?? "Error";
}
