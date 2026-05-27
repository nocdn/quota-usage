import { environment, getPreferenceValues, LaunchType, showToast, Toast, updateCommandMetadata } from "@raycast/api";
import { AMP_FULL_QUOTA, AMP_REPLENISHMENT_RATE_PER_HOUR, AmpUsage, getAmpUsageDetails } from "./amp";
import { CodexUsage, getCodexUsageDetails } from "./codex";

const BACKGROUND_REFRESH_TIME_ZONE = "Europe/London";

interface UsageResult {
  value: string | null;
  error: string | null;
  status: "loading" | "success" | "error";
  details?: AmpUsage | CodexUsage;
}

interface UsageResults {
  amp?: UsageResult;
  codex?: UsageResult;
}

export default async function Command() {
  if (environment.launchType === LaunchType.Background) {
    if (isOvernight()) {
      console.log("Skipping Codex usage background refresh overnight");
      return;
    }

    await updateCodexSubtitle(await checkUsage("Codex", getCodexUsageDetails));
    return;
  }

  const providers = getEnabledProviders();

  if (!providers.amp && !providers.codex) {
    await showToast({
      style: Toast.Style.Failure,
      title: "No providers to check",
    });
    return;
  }

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Fetching Usage",
  });

  const results: UsageResults = {};
  const checks: Promise<void>[] = [];

  if (providers.amp) {
    checks.push(
      checkUsage("Amp", getAmpUsageDetails).then((result) => {
        results.amp = result;
      }),
    );
  }

  if (providers.codex) {
    checks.push(
      checkUsage("Codex", getCodexUsageDetails).then((result) => {
        results.codex = result;
      }),
    );
  }

  await Promise.all(checks);

  updateToast(toast, results);

  if (results.codex) {
    await updateCodexSubtitle(results.codex);
  }
}

async function checkUsage(provider: string, loadUsage: () => Promise<AmpUsage | CodexUsage>): Promise<UsageResult> {
  const startedAt = Date.now();

  try {
    const details = await loadUsage();

    console.log(`${provider} usage fetch completed in ${Date.now() - startedAt}ms`);

    return { value: details.display, details, error: null, status: "success" };
  } catch (error) {
    console.log(`${provider} usage fetch failed in ${Date.now() - startedAt}ms`);

    return { value: null, error: error instanceof Error ? error.message : "Error", status: "error" };
  }
}

function formatUsageResult(result: UsageResult) {
  if (result.status === "loading") {
    return "Fetching";
  }

  return result.value ?? result.error ?? "Error";
}

async function updateCodexSubtitle(codex: UsageResult) {
  await updateCommandMetadata({ subtitle: `Codex: ${formatUsageResult(codex)}` });
}

function getEnabledProviders() {
  const preferences = getPreferenceValues<Preferences.CheckUsage>();

  return {
    amp: preferences.showAmp !== false,
    codex: preferences.showCodex !== false,
  };
}

function isOvernight(date = new Date()) {
  const hour = getLondonHour(date);

  return hour >= 23 || hour < 7;
}

function getLondonHour(date: Date) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: BACKGROUND_REFRESH_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(date)
    .find((part) => part.type === "hour")?.value;

  return Number(hour);
}

function updateToast(toast: Toast, results: UsageResults) {
  const activeResults = [results.amp, results.codex].filter((result): result is UsageResult => Boolean(result));
  const isLoading = activeResults.some((result) => result.status === "loading");
  const isSuccess = activeResults.length > 0 && activeResults.every((result) => result.status === "success");
  const usageSummary = buildUsageSummary(results);

  toast.title = usageSummary || "Fetching Usage";
  toast.message = isSuccess ? buildUsageDetailsLines(results).join("\n") : undefined;
  toast.style = isLoading ? Toast.Style.Animated : isSuccess ? Toast.Style.Success : Toast.Style.Failure;
  toast.primaryAction = undefined;
  toast.secondaryAction = undefined;
}

function buildUsageSummary(results: UsageResults) {
  return [
    results.amp ? `Amp: ${formatUsageResult(results.amp)}` : null,
    results.codex ? `Codex: ${formatUsageResult(results.codex)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function buildUsageDetailsLines(results: UsageResults) {
  const hasMultipleProviders = Boolean(results.amp && results.codex);
  const lines: string[] = [];

  if (results.codex) {
    const codexDetails = results.codex.details as CodexUsage | undefined;
    const codexPrefix = hasMultipleProviders ? "Codex " : "";

    lines.push(
      `${codexPrefix}5hr reset: ${codexDetails ? formatRelativeDateTime(codexDetails.fiveHourResetAt * 1000) : formatDetailFallback(results.codex)}`,
      `${hasMultipleProviders ? "Codex weekly reset" : "Weekly reset"}: ${codexDetails ? formatRelativeDateTime(codexDetails.weeklyResetAt * 1000) : formatDetailFallback(results.codex)}`,
    );
  }

  if (results.amp) {
    const ampDetails = results.amp.details as AmpUsage | undefined;
    const ampPrefix = hasMultipleProviders ? "Amp " : "";

    lines.push(
      `${ampPrefix}replenished at: ${ampDetails ? formatAmpReplenishedAt(ampDetails.remaining) : formatDetailFallback(results.amp)}`,
    );
  }

  return lines;
}

function formatAmpReplenishedAt(remaining: number) {
  const hoursUntilFull = Math.max(0, (AMP_FULL_QUOTA - remaining) / AMP_REPLENISHMENT_RATE_PER_HOUR);

  if (hoursUntilFull === 0) {
    return "Now";
  }

  return formatRelativeDateTime(Date.now() + hoursUntilFull * 60 * 60 * 1000);
}

function formatDetailFallback(result: UsageResult) {
  if (result.status === "loading") {
    return "Fetching";
  }

  return result.error ?? "Unavailable";
}

function formatRelativeDateTime(timestamp: number) {
  const target = new Date(timestamp);
  const now = new Date();

  if (isSameLocalDay(target, now)) {
    return `Today at ${formatTime(target)}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (isSameLocalDay(target, tomorrow)) {
    return `Tomorrow at ${formatTime(target)}`;
  }

  return `${formatOrdinalDay(target.getDate())} ${target.toLocaleString("en-GB", { month: "short" })} at ${formatTime(target)}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatOrdinalDay(day: number) {
  const mod100 = day % 100;

  if (mod100 >= 11 && mod100 <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}
