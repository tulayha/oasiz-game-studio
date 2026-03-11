import fs from "node:fs";
import path from "node:path";

interface CliOptions {
  runsDir: string;
  runIdFilter: string | null;
}

interface CapacityStageResult {
  stageIndex: number;
  clients: number;
  joined: number | null;
  expected: number | null;
  passLoadtest: boolean | null;
  loadtestExitCode: number | null;
  failedJoins: number | null;
  disconnected: number | null;
  has1006: boolean | null;
  topLeaveCodes: string | null;
}

interface CapacityRunIndexEntry {
  runId: string;
  runDir: string;
  startedAtIso: string | null;
  endedAtIso: string | null;
  endpoint: string | null;
  runner: string | null;
  usersPerRoom: number | null;
  loadtestExitCode: number | null;
  verdict: string | null;
  hardCapacity: number | null;
  prodCapacity: number | null;
  fullRoomsCapacity: number | null;
  rttP95MaxMs: number | null;
  leftUnconsentedDelta: number | null;
  passingStages: number[];
  stageResults: CapacityStageResult[];
  files: {
    runMeta: string;
    capacityReport: string;
    capacitySummary: string;
    hostMetrics: string;
    opsStats: string;
    capacityRunLog: string;
  };
}

interface CapacityRunsIndexFile {
  generatedAtIso: string;
  runs: CapacityRunIndexEntry[];
}

function logInfo(message: string): void {
  console.log("[CapacityIndex.main]", message);
}

function parseCliOptions(): CliOptions {
  let runsDir = process.env.CAPACITY_RUNS_DIR ?? "/root/space-force-loadtest-runs";
  let runIdFilter: string | null = null;

  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i] ?? "";
    if (arg === "--runsDir") {
      runsDir = process.argv[i + 1] ?? runsDir;
      i += 1;
      continue;
    }
    if (arg === "--runId") {
      runIdFilter = process.argv[i + 1] ?? null;
      i += 1;
      continue;
    }
  }

  return {
    runsDir: path.resolve(runsDir),
    runIdFilter,
  };
}

function ensureDirectory(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPosixRelativePath(baseDir: string, targetPath: string): string {
  return path.relative(baseDir, targetPath).split(path.sep).join("/");
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    logInfo("Failed to parse JSON " + filePath + " " + String(error));
    return null;
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseInteger(value: unknown): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;
  return Math.floor(parsed);
}

function parseIso(value: unknown): string | null {
  if (typeof value !== "string" || value.length <= 0) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function getObject(
  parent: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!parent) return null;
  const value = parent[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getArray(
  parent: Record<string, unknown> | null,
  key: string,
): Array<Record<string, unknown>> {
  if (!parent) return [];
  const value = parent[key];
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> =>
      !!item && typeof item === "object" && !Array.isArray(item),
  );
}

function parseStageResultsFromReport(
  reportJson: Record<string, unknown> | null,
): CapacityStageResult[] {
  const stageRows = getArray(reportJson, "stages");
  return stageRows.map((stageRow) => {
    const topLeaveCodesRaw = stageRow.topLeaveCodes;
    return {
      stageIndex: parseInteger(stageRow.stageIndex) ?? 0,
      clients: parseInteger(stageRow.clients) ?? 0,
      joined: parseInteger(stageRow.joined),
      expected: parseInteger(stageRow.expected),
      passLoadtest:
        typeof stageRow.passLoadtest === "boolean" ? stageRow.passLoadtest : null,
      loadtestExitCode: parseInteger(stageRow.loadtestExitCode),
      failedJoins: parseInteger(stageRow.failedJoins),
      disconnected: parseInteger(stageRow.disconnected),
      has1006: typeof stageRow.has1006 === "boolean" ? stageRow.has1006 : null,
      topLeaveCodes:
        typeof topLeaveCodesRaw === "string" && topLeaveCodesRaw.length > 0
          ? topLeaveCodesRaw
          : null,
    };
  });
}

function parseStageResultsFromSummary(
  summaryJson: Record<string, unknown> | null,
): CapacityStageResult[] {
  const stageRows = getArray(summaryJson, "stages");
  return stageRows.map((stageRow) => {
    const parsedResult = getObject(stageRow, "parsedResult");
    const topLeaveCodesRaw = parsedResult?.topLeaveCodes;
    const topLeaveCodes =
      typeof topLeaveCodesRaw === "string" && topLeaveCodesRaw.length > 0
        ? topLeaveCodesRaw
        : null;
    const has1006 =
      topLeaveCodes !== null
        ? /(?:^|[,\s])1006:/.test(topLeaveCodes) || /\b1006\b/.test(topLeaveCodes)
        : null;
    const loadtestExitCode = parseInteger(stageRow.loadtestExitCode);
    const failedJoins = parseInteger(parsedResult?.failedJoins);

    let passLoadtest: boolean | null = null;
    if (loadtestExitCode !== null || failedJoins !== null) {
      passLoadtest = loadtestExitCode === 0 && (failedJoins ?? 0) === 0;
    }

    return {
      stageIndex: parseInteger(stageRow.stageIndex) ?? 0,
      clients: parseInteger(stageRow.clients) ?? 0,
      joined: parseInteger(parsedResult?.joined),
      expected: parseInteger(parsedResult?.expected),
      passLoadtest,
      loadtestExitCode,
      failedJoins,
      disconnected: parseInteger(parsedResult?.disconnected),
      has1006,
      topLeaveCodes,
    };
  });
}

function parseIndexEntry(
  runsDir: string,
  runId: string,
): CapacityRunIndexEntry | null {
  const runDir = path.join(runsDir, runId);
  const runMetaPath = path.join(runDir, "run-meta.json");
  const reportPath = path.join(runDir, "capacity-report.json");
  const summaryPath = path.join(runDir, "loadtest", "capacity-summary.json");
  const hostMetricsPath = path.join(runDir, "host-metrics.log");
  const opsStatsPath = path.join(runDir, "ops-stats.log");
  const runLogPath = path.join(runDir, "capacity-run.log");

  const runMetaJson = readJsonObject(runMetaPath);
  const reportJson = readJsonObject(reportPath);
  const summaryJson = readJsonObject(summaryPath);

  if (!runMetaJson && !reportJson && !summaryJson) {
    return null;
  }

  const reportCapacity = getObject(reportJson, "capacity");
  const reportChecks = getObject(reportJson, "checks");
  const reportLoadtestCheck = getObject(reportChecks, "loadtest");
  const reportRttCheck = getObject(reportChecks, "rttP95");
  const reportLeftCheck = getObject(reportChecks, "leftUnconsentedDelta");

  const stageResultsFromReport = parseStageResultsFromReport(reportJson);
  const stageResultsFromSummary = parseStageResultsFromSummary(summaryJson);
  const stageResults =
    stageResultsFromReport.length > 0 ? stageResultsFromReport : stageResultsFromSummary;

  const passingStagesRaw = reportLoadtestCheck?.passingStages;
  const passingStages = Array.isArray(passingStagesRaw)
    ? passingStagesRaw
        .map((value) => parseInteger(value))
        .filter((value): value is number => value !== null && value > 0)
    : stageResults
        .filter((row) => row.passLoadtest === true && row.clients > 0)
        .map((row) => row.clients);

  const startedAtIso =
    parseIso(runMetaJson?.startedAtIso) ?? parseIso(summaryJson?.generatedAtIso);
  const endedAtIso = parseIso(runMetaJson?.endedAtIso);

  const endpointFromMeta = runMetaJson?.endpoint;
  const endpointFromReport = reportJson?.endpoint;
  const endpoint =
    typeof endpointFromMeta === "string"
      ? endpointFromMeta
      : typeof endpointFromReport === "string"
        ? endpointFromReport
        : null;

  const runnerRaw = runMetaJson?.runner;
  const runner = typeof runnerRaw === "string" ? runnerRaw : null;

  const usersPerRoom = parseInteger(runMetaJson?.usersPerRoom);
  const loadtestExitCode = parseInteger(runMetaJson?.loadtestExitCode);

  const verdictRaw = reportJson?.verdict;
  const verdict = typeof verdictRaw === "string" ? verdictRaw : null;

  const hardCapacity = parseInteger(reportCapacity?.hardCapacity);
  const prodCapacity = parseInteger(reportCapacity?.prodCapacity);
  const fullRoomsCapacity = parseInteger(reportCapacity?.fullRoomsCapacity);
  const rttP95MaxMs = parseNumber(reportRttCheck?.observedMaxMs);
  const leftUnconsentedDelta = parseNumber(reportLeftCheck?.observedDelta);

  return {
    runId,
    runDir: toPosixRelativePath(runsDir, runDir),
    startedAtIso,
    endedAtIso,
    endpoint,
    runner,
    usersPerRoom,
    loadtestExitCode,
    verdict,
    hardCapacity,
    prodCapacity,
    fullRoomsCapacity,
    rttP95MaxMs,
    leftUnconsentedDelta,
    passingStages,
    stageResults,
    files: {
      runMeta: toPosixRelativePath(runsDir, runMetaPath),
      capacityReport: toPosixRelativePath(runsDir, reportPath),
      capacitySummary: toPosixRelativePath(runsDir, summaryPath),
      hostMetrics: toPosixRelativePath(runsDir, hostMetricsPath),
      opsStats: toPosixRelativePath(runsDir, opsStatsPath),
      capacityRunLog: toPosixRelativePath(runsDir, runLogPath),
    },
  };
}

function sortRunsDesc(runs: CapacityRunIndexEntry[]): CapacityRunIndexEntry[] {
  return [...runs].sort((a, b) => {
    const aMs = a.startedAtIso ? Date.parse(a.startedAtIso) : Number.NaN;
    const bMs = b.startedAtIso ? Date.parse(b.startedAtIso) : Number.NaN;
    const aValid = Number.isFinite(aMs);
    const bValid = Number.isFinite(bMs);
    if (aValid && bValid) return bMs - aMs;
    if (aValid) return -1;
    if (bValid) return 1;
    return b.runId.localeCompare(a.runId);
  });
}

function main(): void {
  const options = parseCliOptions();
  ensureDirectory(options.runsDir);

  const entries = fs
    .readdirSync(options.runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== "dashboard")
    .filter((name) => (options.runIdFilter ? name === options.runIdFilter : true));

  const runs: CapacityRunIndexEntry[] = [];
  for (const runId of entries) {
    const parsed = parseIndexEntry(options.runsDir, runId);
    if (parsed) {
      runs.push(parsed);
    }
  }

  const payload: CapacityRunsIndexFile = {
    generatedAtIso: new Date().toISOString(),
    runs: sortRunsDesc(runs),
  };

  const indexPath = path.join(options.runsDir, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2));

  logInfo("Indexed " + payload.runs.length + " run(s)");
  logInfo("Wrote " + indexPath);
}

main();
