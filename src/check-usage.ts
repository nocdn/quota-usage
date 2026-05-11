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

  const [amp, codex] = await Promise.all([checkUsage(getAmpFreeRemaining), checkUsage(getCodexUsage)]);

  toast.style = amp.value || codex.value ? Toast.Style.Success : Toast.Style.Failure;
  toast.title = "Usage";
  toast.message = `Amp: ${formatUsageResult(amp)} · Codex: ${formatUsageResult(codex)}`;
}

async function checkUsage(loadUsage: () => Promise<string>): Promise<UsageResult> {
  try {
    return { value: await loadUsage(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Error" };
  }
}

function formatUsageResult(result: UsageResult) {
  return result.value ?? result.error ?? "Error";
}
