const state = {
  indexData: null,
  selectedRunIds: new Set(),
};

function logInfo(message) {
  console.log("[CapacityDashboard]", message);
}

function getRuns() {
  const runs = state.indexData && Array.isArray(state.indexData.runs)
    ? state.indexData.runs
    : [];
  return runs;
}

function findRun(runId) {
  return getRuns().find((run) => run.runId === runId) || null;
}

function formatIso(value) {
  if (!value) return "n/a";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString().replace(".000Z", "Z");
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Math.round(value))
    : "n/a";
}

function verdictClass(verdict) {
  const v = String(verdict || "").toUpperCase();
  if (v === "PASS") return "ok";
  if (v === "FAIL") return "fail";
  return "review";
}

function selectedRunIdsInOrder() {
  return getRuns()
    .map((run) => run.runId)
    .filter((runId) => state.selectedRunIds.has(runId));
}

function ensureSelection() {
  const ordered = selectedRunIdsInOrder();
  if (ordered.length > 0) return;
  const runs = getRuns();
  if (runs.length > 0) {
    state.selectedRunIds.add(runs[0].runId);
  }
}

function renderRunList() {
  const container = document.getElementById("run-list");
  const indexMeta = document.getElementById("index-meta");
  container.innerHTML = "";

  const runs = getRuns();
  indexMeta.textContent =
    "index " +
    formatIso(state.indexData && state.indexData.generatedAtIso) +
    " | " +
    runs.length +
    " run(s)";

  if (runs.length <= 0) {
    container.innerHTML = "<div class='subtle'>No runs indexed yet.</div>";
    return;
  }

  for (const run of runs) {
    const checked = state.selectedRunIds.has(run.runId) ? "checked" : "";
    const item = document.createElement("label");
    item.className = "run-item";
    item.innerHTML =
      "<div class='run-head'>" +
      "<span class='run-select'>" +
      "<input type='checkbox' data-run-id='" +
      run.runId +
      "' " +
      checked +
      " />" +
      "<span class='run-id'>" +
      run.runId +
      "</span>" +
      "</span>" +
      "<span class='badge " +
      verdictClass(run.verdict) +
      "'>" +
      (run.verdict || "REVIEW") +
      "</span>" +
      "</div>" +
      "<div class='run-meta'>" +
      "runner=" +
      (run.runner || "n/a") +
      " usersPerRoom=" +
      formatNumber(run.usersPerRoom) +
      "<br/>" +
      "hard=" +
      formatNumber(run.hardCapacity) +
      " prod=" +
      formatNumber(run.prodCapacity) +
      " rooms=" +
      formatNumber(run.fullRoomsCapacity) +
      "<br/>" +
      "rttP95 max=" +
      formatNumber(run.rttP95MaxMs) +
      "ms leftUnconsented delta=" +
      formatNumber(run.leftUnconsentedDelta) +
      "</div>";

    container.appendChild(item);
  }

  for (const input of container.querySelectorAll("input[type='checkbox']")) {
    input.addEventListener("change", (event) => {
      const target = event.currentTarget;
      const runId = target && target.getAttribute("data-run-id");
      if (!runId) return;
      if (target.checked) state.selectedRunIds.add(runId);
      else state.selectedRunIds.delete(runId);
      renderAll();
    });
  }
}

function renderCards() {
  const container = document.getElementById("cards");
  const selectedIds = selectedRunIdsInOrder();
  const primary = selectedIds.length > 0 ? findRun(selectedIds[0]) : null;

  if (!primary) {
    container.innerHTML = "<div class='subtle'>Select at least one run.</div>";
    return;
  }

  const cards = [
    { label: "VERDICT", value: primary.verdict || "REVIEW" },
    { label: "HARD CAP", value: formatNumber(primary.hardCapacity) },
    { label: "PROD CAP", value: formatNumber(primary.prodCapacity) },
    { label: "FULL ROOMS", value: formatNumber(primary.fullRoomsCapacity) },
    { label: "RTT P95 MAX", value: formatNumber(primary.rttP95MaxMs) + " ms" },
  ];

  container.innerHTML = cards
    .map(
      (card) =>
        "<div class='card'>" +
        "<div class='label'>" +
        card.label +
        "</div>" +
        "<div class='value'>" +
        card.value +
        "</div>" +
        "</div>",
    )
    .join("");
}

function renderComparisonTable() {
  const tbody = document.getElementById("comparison-body");
  const selectedIds = selectedRunIdsInOrder();
  if (selectedIds.length <= 0) {
    tbody.innerHTML =
      "<tr><td colspan='9' class='subtle'>Select one or more runs.</td></tr>";
    return;
  }

  const rows = [];
  for (const runId of selectedIds) {
    const run = findRun(runId);
    if (!run) continue;

    rows.push(
      "<tr>" +
        "<td>" +
        run.runId +
        "</td>" +
        "<td>" +
        formatIso(run.startedAtIso) +
        "</td>" +
        "<td><span class='badge " +
        verdictClass(run.verdict) +
        "'>" +
        (run.verdict || "REVIEW") +
        "</span></td>" +
        "<td>" +
        formatNumber(run.hardCapacity) +
        "</td>" +
        "<td>" +
        formatNumber(run.prodCapacity) +
        "</td>" +
        "<td>" +
        formatNumber(run.fullRoomsCapacity) +
        "</td>" +
        "<td>" +
        formatNumber(run.rttP95MaxMs) +
        "</td>" +
        "<td>" +
        formatNumber(run.leftUnconsentedDelta) +
        "</td>" +
        "<td>" +
        formatNumber(run.loadtestExitCode) +
        "</td>" +
        "</tr>",
    );
  }

  tbody.innerHTML = rows.join("");
}

function drawStageChart() {
  const canvas = document.getElementById("stage-chart");
  const meta = document.getElementById("chart-meta");
  const selectedIds = selectedRunIdsInOrder();
  const primary = selectedIds.length > 0 ? findRun(selectedIds[0]) : null;

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const widthCss = Math.max(300, canvas.clientWidth || 300);
  const heightCss = Math.max(200, canvas.clientHeight || 200);
  canvas.width = Math.floor(widthCss * dpr);
  canvas.height = Math.floor(heightCss * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, widthCss, heightCss);

  if (!primary || !Array.isArray(primary.stageResults) || primary.stageResults.length <= 0) {
    meta.textContent = "No stage data for selected run.";
    return;
  }

  const stages = [...primary.stageResults].sort((a, b) => a.clients - b.clients);
  const maxClients = Math.max(...stages.map((row) => row.clients), 1);
  const pad = { left: 40, right: 10, top: 12, bottom: 34 };
  const innerW = widthCss - pad.left - pad.right;
  const innerH = heightCss - pad.top - pad.bottom;
  const barW = innerW / stages.length;

  ctx.strokeStyle = "#c8d7e8";
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + innerH);
  ctx.lineTo(pad.left + innerW, pad.top + innerH);
  ctx.stroke();

  stages.forEach((stage, index) => {
    const x = pad.left + index * barW + 4;
    const ratio = Math.max(0, Math.min(1, stage.clients / maxClients));
    const h = ratio * (innerH - 6);
    const y = pad.top + innerH - h;
    const fill = stage.passLoadtest === true ? "#2da86d" : "#e18c33";

    ctx.fillStyle = fill;
    ctx.fillRect(x, y, Math.max(4, barW - 8), h);

    const label = String(stage.clients);
    ctx.fillStyle = "#4a607a";
    ctx.font = "11px IBM Plex Sans, sans-serif";
    ctx.fillText(label, x, pad.top + innerH + 13);
  });

  meta.textContent =
    "Primary run " +
    primary.runId +
    " | bars show stage client count, green=pass, orange=review/fail.";
}

function renderArtifactLinks() {
  const container = document.getElementById("artifact-links");
  const selectedIds = selectedRunIdsInOrder();
  const primary = selectedIds.length > 0 ? findRun(selectedIds[0]) : null;

  if (!primary || !primary.files) {
    container.innerHTML = "<div class='subtle'>No artifact links.</div>";
    return;
  }

  const map = [
    ["run-meta.json", primary.files.runMeta],
    ["capacity-report.json", primary.files.capacityReport],
    ["capacity-summary.json", primary.files.capacitySummary],
    ["host-metrics.log", primary.files.hostMetrics],
    ["ops-stats.log", primary.files.opsStats],
    ["capacity-run.log", primary.files.capacityRunLog],
  ];

  container.innerHTML = map
    .map(
      (entry) =>
        "<a href='../" +
        entry[1] +
        "' target='_blank' rel='noreferrer'>" +
        entry[0] +
        "</a>",
    )
    .join("");
}

function renderAll() {
  renderRunList();
  renderCards();
  renderComparisonTable();
  drawStageChart();
  renderArtifactLinks();
}

async function loadDashboard() {
  try {
    const response = await fetch("../index.json?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error("index fetch failed " + response.status);
    }
    state.indexData = await response.json();
    ensureSelection();
    renderAll();
  } catch (error) {
    logInfo("Failed to load dashboard index " + String(error));
    const meta = document.getElementById("index-meta");
    const runList = document.getElementById("run-list");
    meta.textContent = "Failed to load index.json";
    runList.innerHTML =
      "<div class='subtle'>Generate index with npm run capacity:index.</div>";
  }
}

window.addEventListener("resize", () => {
  drawStageChart();
});

void loadDashboard();
