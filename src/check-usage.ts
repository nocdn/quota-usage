import { environment, LaunchType, showToast, Toast, updateCommandMetadata } from "@raycast/api";
import { AmpUsage, getAmpUsageDetails } from "./amp";
import { CodexUsage, getCodexUsageDetails } from "./codex";

const BACKGROUND_REFRESH_TIME_ZONE = "Europe/London";

interface UsageResult {
  value: string | null;
  error: string | null;
  status: "loading" | "success" | "error";
  details?: AmpUsage | CodexUsage;
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

  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Fetching Usage",
  });

  const [amp, codex] = await Promise.all([
    checkUsage("Amp", getAmpUsageDetails),
    checkUsage("Codex", getCodexUsageDetails),
  ]);

  updateToast(toast, amp, codex);
  await updateCodexSubtitle(codex);
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

function updateToast(toast: Toast, amp: UsageResult, codex: UsageResult) {
  const isLoading = amp.status === "loading" || codex.status === "loading";
  const hasResult = amp.status !== "loading" || codex.status !== "loading";
  const isSuccess = amp.status === "success" && codex.status === "success";
  const usageSummary = `Amp: ${formatUsageResult(amp)} · Codex: ${formatUsageResult(codex)}`;

  toast.title = hasResult ? usageSummary : "Fetching Usage";
  toast.message = hasResult && isSuccess ? buildUsageDetailsLines(amp, codex).join("\n") : undefined;
  toast.style = isLoading ? Toast.Style.Animated : isSuccess ? Toast.Style.Success : Toast.Style.Failure;
  toast.primaryAction = undefined;
  toast.secondaryAction = undefined;
}

function buildUsageDetailsLines(amp: UsageResult, codex: UsageResult) {
  const codexDetails = codex.details as CodexUsage | undefined;
  const ampDetails = amp.details as AmpUsage | undefined;

  return [
    `Codex 5hr reset: ${codexDetails ? formatRelativeDateTime(codexDetails.fiveHourResetAt * 1000) : formatDetailFallback(codex)}`,
    `Codex weekly reset: ${codexDetails ? formatRelativeDateTime(codexDetails.weeklyResetAt * 1000) : formatDetailFallback(codex)}`,
    `Amp replenished at: ${ampDetails ? formatAmpReplenishedAt(ampDetails.remaining) : formatDetailFallback(amp)}`,
  ];
}

function formatAmpReplenishedAt(remaining: number) {
  const replenishmentRatePerHour = 0.42;
  const fullQuota = 10;
  const hoursUntilFull = Math.max(0, (fullQuota - remaining) / replenishmentRatePerHour);

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
