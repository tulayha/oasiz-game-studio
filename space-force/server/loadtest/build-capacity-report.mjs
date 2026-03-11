import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out.set(key, "true");
      continue;
    }
    out.set(key, next);
    i += 1;
  }
  return out;
}

function toNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value));
}

function parseOpsLog(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      samples: 0,
      rttP95Max: null,
      leftUnconsentedStart: null,
      leftUnconsentedEnd: null,
      leftUnconsentedDelta: null,
    };
  }

  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const rttSamples = [];
  const leftSamples = [];

  for (const line of lines) {
    if (!line.includes("status=ok")) continue;

    const rttMatch = line.match(/rttP95ms=([-0-9.]+)/);
    if (rttMatch) {
      const rtt = toNumber(rttMatch[1]);
      if (rtt !== null && rtt >= 0) rttSamples.push(rtt);
    }

    const leftMatch = line.match(/leftUnconsented=([0-9]+)/);
    if (leftMatch) {
      const left = toNumber(leftMatch[1]);
      if (left !== null && left >= 0) leftSamples.push(left);
    }
  }

  const rttP95Max = rttSamples.length > 0 ? Math.max(...rttSamples) : null;
  const leftUnconsentedStart = leftSamples.length > 0 ? leftSamples[0] : null;
  const leftUnconsentedEnd =
    leftSamples.length > 0 ? leftSamples[leftSamples.length - 1] : null;
  const leftUnconsentedDelta =
    leftUnconsentedStart !== null && leftUnconsentedEnd !== null
      ? leftUnconsentedEnd - leftUnconsentedStart
      : null;

  return {
    samples: Math.max(rttSamples.length, leftSamples.length),
    rttP95Max,
    leftUnconsentedStart,
    leftUnconsentedEnd,
    leftUnconsentedDelta,
  };
}

function parseCapacitySummary(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const summaryPath = args.get("summary") ?? "";
  const opsPath = args.get("ops") ?? "";
  const reportJsonPath = args.get("out-json") ?? "";
  const reportTxtPath = args.get("out-txt") ?? "";

  if (!reportJsonPath || !reportTxtPath) {
    throw new Error("Missing required --out-json or --out-txt");
  }

  const runId = args.get("run-id") ?? "";
  const endpoint = args.get("endpoint") ?? "";
  const usersPerRoom = Math.max(1, Math.floor(toNumber(args.get("users-per-room"), 4)));
  const headroomRatioRaw = toNumber(args.get("headroom-ratio"), 0.7);
  const headroomRatio = headroomRatioRaw > 0 ? headroomRatioRaw : 0.7;
  const sloRttP95Ms = toNumber(args.get("slo-rtt-p95-ms"), 120);
  const maxLeftUnconsentedDelta = toNumber(
    args.get("max-left-unconsented-delta"),
    0,
  );
  const failOn1006 = toBool(args.get("fail-on-1006") ?? "false");

  const ops = parseOpsLog(opsPath);
  const summary = parseCapacitySummary(summaryPath);

  let report;

  if (!summary || !Array.isArray(summary.stages)) {
    report = {
      runId,
      endpoint,
      verdict: "FAIL",
      reason: "capacity-summary.json missing or invalid",
      capacity: {
        hardCapacity: 0,
        prodCapacity: 0,
        fullRoomsCapacity: 0,
        headroomRatio,
        usersPerRoom,
      },
      checks: {
        loadtest: {
          passingStages: [],
          failOn1006,
        },
        rttP95: {
          status: "unknown",
          thresholdMs: sloRttP95Ms,
          observedMaxMs: ops.rttP95Max,
        },
        leftUnconsentedDelta: {
          status: "unknown",
          threshold: maxLeftUnconsentedDelta,
          observedDelta: ops.leftUnconsentedDelta,
        },
      },
      ops,
      stages: [],
    };
  } else {
    const stageEvaluations = summary.stages.map((stage) => {
      const parsedResult = stage?.parsedResult ?? {};
      const failedJoins = toNumber(parsedResult.failedJoins);
      const topLeaveCodes = String(parsedResult.topLeaveCodes ?? "");
      const has1006 =
        /(?:^|[,\s])1006:/.test(topLeaveCodes) || /\b1006\b/.test(topLeaveCodes);
      const loadtestExitCode = Number(stage?.loadtestExitCode ?? 1);

      const passLoadtest =
        loadtestExitCode === 0 &&
        failedJoins === 0 &&
        (!failOn1006 || !has1006);

      return {
        stageIndex: Number(stage?.stageIndex ?? 0),
        clients: Number(stage?.clients ?? 0),
        passLoadtest,
        loadtestExitCode,
        failedJoins,
        has1006,
        topLeaveCodes,
        joined: toNumber(parsedResult.joined),
        expected: toNumber(parsedResult.expected),
        disconnected: toNumber(parsedResult.disconnected),
      };
    });

    const passingStages = stageEvaluations
      .filter((stage) => stage.passLoadtest)
      .sort((a, b) => a.clients - b.clients);

    const hardCapacity =
      passingStages.length > 0
        ? passingStages[passingStages.length - 1].clients
        : 0;
    const prodCapacity = Math.floor(hardCapacity * headroomRatio);
    const fullRoomsCapacity = Math.floor(prodCapacity / usersPerRoom);

    const rttCheck =
      ops.rttP95Max === null
        ? {
            status: "unknown",
            thresholdMs: sloRttP95Ms,
            observedMaxMs: null,
          }
        : {
            status: ops.rttP95Max <= sloRttP95Ms ? "pass" : "fail",
            thresholdMs: sloRttP95Ms,
            observedMaxMs: ops.rttP95Max,
          };

    const leftCheck =
      ops.leftUnconsentedDelta === null
        ? {
            status: "unknown",
            threshold: maxLeftUnconsentedDelta,
            observedDelta: null,
          }
        : {
            status:
              ops.leftUnconsentedDelta <= maxLeftUnconsentedDelta ? "pass" : "fail",
            threshold: maxLeftUnconsentedDelta,
            observedDelta: ops.leftUnconsentedDelta,
          };

    const verdict =
      hardCapacity <= 0 || rttCheck.status === "fail" || leftCheck.status === "fail"
        ? "REVIEW"
        : "PASS";

    report = {
      runId,
      endpoint,
      verdict,
      capacity: {
        hardCapacity,
        prodCapacity,
        fullRoomsCapacity,
        headroomRatio,
        usersPerRoom,
      },
      checks: {
        loadtest: {
          passingStages: passingStages.map((stage) => stage.clients),
          failOn1006,
        },
        rttP95: rttCheck,
        leftUnconsentedDelta: leftCheck,
      },
      ops,
      stages: stageEvaluations,
    };
  }

  fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));

  const textLines = [
    "Space Force Capacity Report",
    "runId=" + (report.runId || "n/a"),
    "endpoint=" + (report.endpoint || "n/a"),
    "verdict=" + report.verdict,
    "hard_capacity=" + report.capacity.hardCapacity,
    "prod_capacity=" + report.capacity.prodCapacity,
    "full_rooms_capacity=" + report.capacity.fullRoomsCapacity,
    "headroom_ratio=" + report.capacity.headroomRatio,
    "users_per_room=" + report.capacity.usersPerRoom,
    "rtt_p95_check_status=" + report.checks.rttP95.status,
    "rtt_p95_observed_max_ms=" + (report.checks.rttP95.observedMaxMs ?? "n/a"),
    "rtt_p95_threshold_ms=" + report.checks.rttP95.thresholdMs,
    "left_unconsented_delta_check_status=" + report.checks.leftUnconsentedDelta.status,
    "left_unconsented_observed_delta=" + (report.checks.leftUnconsentedDelta.observedDelta ?? "n/a"),
    "left_unconsented_threshold=" + report.checks.leftUnconsentedDelta.threshold,
    "fail_on_1006=" + (report.checks.loadtest.failOn1006 ? "yes" : "no"),
    "passing_stages=" + report.checks.loadtest.passingStages.join(","),
  ];

  fs.writeFileSync(reportTxtPath, textLines.join("\n") + "\n");

  console.log("CAPACITY_VERDICT=" + report.verdict);
  console.log("HARD_CAPACITY=" + report.capacity.hardCapacity);
  console.log("PROD_CAPACITY=" + report.capacity.prodCapacity);
  console.log("FULL_ROOMS_CAPACITY=" + report.capacity.fullRoomsCapacity);
  console.log("CAPACITY_REPORT_JSON=" + reportJsonPath);
  console.log("CAPACITY_REPORT_TXT=" + reportTxtPath);
}

main();
