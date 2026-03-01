const FEATURE_CONFIG = [
  { key: "StudyHours", label: "Study Hours / Week", min: 5, max: 44, step: 1, type: "number" },
  { key: "Attendance", label: "Attendance (%)", min: 60, max: 100, step: 1, type: "number" },
  { key: "Resources", label: "Learning Resources", min: 0, max: 2, step: 1, type: "select", options: ["Low", "Medium", "High"] },
  { key: "Extracurricular", label: "Extracurricular", min: 0, max: 1, step: 1, type: "select", options: ["No", "Yes"] },
  { key: "Motivation", label: "Motivation", min: 0, max: 2, step: 1, type: "select", options: ["Low", "Medium", "High"] },
  { key: "Internet", label: "Stable Internet", min: 0, max: 1, step: 1, type: "select", options: ["No", "Yes"] },
  { key: "Age", label: "Age", min: 18, max: 29, step: 1, type: "number" },
  { key: "LearningStyle", label: "Learning Style (Encoded)", min: 0, max: 3, step: 1, type: "number" },
  { key: "OnlineCourses", label: "Online Courses Completed", min: 0, max: 20, step: 1, type: "number" },
  { key: "Discussions", label: "Participates in Discussions", min: 0, max: 1, step: 1, type: "select", options: ["No", "Yes"] },
  { key: "AssignmentCompletion", label: "Assignment Completion (%)", min: 50, max: 100, step: 1, type: "number" },
  { key: "EduTech", label: "Uses EdTech Tools", min: 0, max: 1, step: 1, type: "select", options: ["No", "Yes"] },
  { key: "StressLevel", label: "Stress Level", min: 0, max: 2, step: 1, type: "select", options: ["Low", "Medium", "High"] },
];

const TARGET = "ExamScore";
const EPS = 1e-9;

const state = {
  rows: [],
  model: null,
  lastInput: null,
  lastPrediction: null,
};

const inputForm = document.getElementById("inputForm");
const trainBtn = document.getElementById("trainBtn");
const predictBtn = document.getElementById("predictBtn");
const simulateBtn = document.getElementById("simulateBtn");
const csvFileInput = document.getElementById("csvFile");
const modelStatus = document.getElementById("modelStatus");
const modelInfo = document.getElementById("modelInfo");

function initForm() {
  inputForm.innerHTML = FEATURE_CONFIG.map((f) => {
    if (f.type === "select") {
      return `
      <div class="field">
        <label for="${f.key}">${f.label}</label>
        <select id="${f.key}" data-key="${f.key}">
          ${f.options.map((opt, i) => `<option value="${i}">${opt}</option>`).join("")}
        </select>
      </div>`;
    }
    const defaultValue = Math.round((f.min + f.max) / 2);
    return `
    <div class="field">
      <label for="${f.key}">${f.label}</label>
      <input id="${f.key}" data-key="${f.key}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${defaultValue}" />
    </div>`;
  }).join("");
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const required = [...FEATURE_CONFIG.map((f) => f.key), TARGET];
  const hasAll = required.every((c) => headers.includes(c));
  if (!hasAll) {
    throw new Error("CSV is missing required columns.");
  }
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    if (cols.length !== headers.length) continue;
    const row = {};
    let valid = true;
    for (const f of FEATURE_CONFIG) {
      const v = Number(cols[idx[f.key]]);
      if (Number.isNaN(v)) {
        valid = false;
        break;
      }
      row[f.key] = v;
    }
    const y = Number(cols[idx[TARGET]]);
    if (Number.isNaN(y)) valid = false;
    row[TARGET] = y;
    if (valid) rows.push(row);
  }
  return rows;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function transpose(m) {
  return m[0].map((_, i) => m.map((row) => row[i]));
}

function multiply(a, b) {
  const out = Array.from({ length: a.length }, () => Array(b[0].length).fill(0));
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < b.length; k += 1) {
      const aik = a[i][k];
      for (let j = 0; j < b[0].length; j += 1) {
        out[i][j] += aik * b[k][j];
      }
    }
  }
  return out;
}

function solveLinearSystem(a, b) {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < EPS) continue;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const div = m[col][col];
    for (let c = col; c <= n; c += 1) m[col][c] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = m[r][col];
      for (let c = col; c <= n; c += 1) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row) => row[n]);
}

function trainRidgeRegression(rows, lambda = 0.25) {
  const features = FEATURE_CONFIG.map((f) => f.key);
  const n = rows.length;
  const p = features.length;
  if (n < p + 2) throw new Error("Not enough rows to train model.");

  const means = {};
  const stds = {};
  for (const key of features) {
    const vals = rows.map((r) => r[key]);
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - avg) ** 2, 0) / vals.length;
    means[key] = avg;
    stds[key] = Math.sqrt(variance) || 1;
  }

  const X = rows.map((r) => {
    const row = [1];
    for (const key of features) row.push((r[key] - means[key]) / stds[key]);
    return row;
  });
  const y = rows.map((r) => [r[TARGET]]);

  const Xt = transpose(X);
  const XtX = multiply(Xt, X);
  const Xty = multiply(Xt, y).map((v) => v[0]);

  for (let i = 1; i < XtX.length; i += 1) XtX[i][i] += lambda;
  const beta = solveLinearSystem(XtX, Xty);

  const preds = X.map((row) => dot(row, beta));
  const ys = rows.map((r) => r[TARGET]);
  const yAvg = ys.reduce((s, v) => s + v, 0) / ys.length;
  const sse = ys.reduce((s, v, i) => s + (v - preds[i]) ** 2, 0);
  const sst = ys.reduce((s, v) => s + (v - yAvg) ** 2, 0);
  const r2 = 1 - sse / (sst + EPS);
  const mae = ys.reduce((s, v, i) => s + Math.abs(v - preds[i]), 0) / ys.length;

  return { beta, means, stds, features, r2, mae };
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function getInputVector() {
  const values = {};
  for (const f of FEATURE_CONFIG) {
    const el = document.getElementById(f.key);
    let val = Number(el.value);
    if (Number.isNaN(val)) val = f.min;
    val = Math.max(f.min, Math.min(f.max, val));
    values[f.key] = val;
    el.value = String(val);
  }
  return values;
}

function predictExamScore(input) {
  if (!state.model) return null;
  const x = [1];
  for (const key of state.model.features) {
    x.push((input[key] - state.model.means[key]) / state.model.stds[key]);
  }
  const raw = dot(x, state.model.beta);
  const clipped = Math.max(0, Math.min(100, raw));
  const contributions = state.model.features.map((k, i) => ({
    feature: k,
    value: input[k],
    contribution: state.model.beta[i + 1] * ((input[k] - state.model.means[k]) / state.model.stds[k]),
  }));
  return { score: clipped, raw, contributions };
}

function gradeBand(score) {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

function riskLabel(score) {
  if (score >= 80) return "Low";
  if (score >= 65) return "Moderate";
  return "High";
}

function generateRecommendations(input, currentScore) {
  const moves = [
    { key: "StudyHours", delta: 4, text: "Increase weekly study hours with a fixed 4-day schedule." },
    { key: "Attendance", delta: 8, text: "Raise attendance by preparing before class and minimizing absences." },
    { key: "AssignmentCompletion", delta: 10, text: "Push assignment completion above 90% with deadline batching." },
    { key: "OnlineCourses", delta: 3, text: "Complete 2-3 targeted online modules on weak topics." },
    { key: "Resources", delta: 1, text: "Use richer learning resources (videos + practice bank + notes)." },
    { key: "Motivation", delta: 1, text: "Set weekly goals and visible progress tracking to lift motivation." },
    { key: "Discussions", delta: 1, text: "Join discussions at least once per class to improve retention." },
    { key: "EduTech", delta: 1, text: "Use an adaptive quiz tool for daily 15-minute retrieval practice." },
    { key: "StressLevel", delta: -1, text: "Reduce stress through shorter focused sessions and break planning." },
  ];

  const scored = [];
  for (const m of moves) {
    const feature = FEATURE_CONFIG.find((f) => f.key === m.key);
    const nextInput = { ...input };
    nextInput[m.key] = Math.max(feature.min, Math.min(feature.max, input[m.key] + m.delta));
    const pred = predictExamScore(nextInput);
    if (!pred) continue;
    scored.push({
      key: m.key,
      action: m.text,
      gain: pred.score - currentScore,
      projectedScore: pred.score,
      newValue: nextInput[m.key],
    });
  }

  scored.sort((a, b) => b.gain - a.gain);
  return scored.slice(0, 4);
}

function prettyFeatureName(key) {
  const f = FEATURE_CONFIG.find((x) => x.key === key);
  return f ? f.label : key;
}

function renderPrediction(result) {
  document.getElementById("predictedScore").textContent = result.score.toFixed(1);
  document.getElementById("predictedGrade").textContent = gradeBand(result.score);
  document.getElementById("riskLevel").textContent = riskLabel(result.score);
}

function renderRecommendations(recs) {
  const el = document.getElementById("recommendationList");
  if (!recs.length) {
    el.innerHTML = `<div class="plan-item"><p>No improvement actions found for current input.</p></div>`;
    document.getElementById("gainScore").textContent = "0.0";
    return;
  }
  const bestGain = Math.max(0, recs[0].gain);
  document.getElementById("gainScore").textContent = `+${bestGain.toFixed(1)}`;
  el.innerHTML = recs
    .map(
      (r, idx) => `
      <div class="plan-item">
        <h3>#${idx + 1} ${prettyFeatureName(r.key)} <span class="chip ${r.gain > 0 ? "ok" : "warn"}">${r.gain >= 0 ? "+" : ""}${r.gain.toFixed(1)} pts</span></h3>
        <p>${r.action}</p>
        <p>Set <strong>${prettyFeatureName(r.key)}</strong> to <strong>${r.newValue}</strong> for projected score <strong>${r.projectedScore.toFixed(1)}</strong>.</p>
      </div>`
    )
    .join("");
}

function renderExplanations(contributions) {
  const el = document.getElementById("explanationList");
  const sorted = [...contributions].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const top = sorted.slice(0, 5);
  el.innerHTML = top
    .map((c) => {
      const sign = c.contribution >= 0 ? "positive" : "negative";
      const color = c.contribution >= 0 ? "ok" : "warn";
      return `
      <div class="topic-row">
        <div class="topic-row-top">
          <span class="topic-name">${prettyFeatureName(c.feature)}</span>
          <span class="chip ${color}">${sign} ${c.contribution.toFixed(2)}</span>
        </div>
        <p class="topic-hint">Current value: ${c.value}. This feature is one of the strongest drivers of the predicted score.</p>
      </div>`;
    })
    .join("");
}

function drawImportanceChart(model) {
  const canvas = document.getElementById("importanceCanvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const items = model.features.map((f, i) => ({ key: f, beta: model.beta[i + 1] }));
  items.sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta));
  const top = items.slice(0, 8);
  const maxAbs = Math.max(...top.map((x) => Math.abs(x.beta)), EPS);

  ctx.fillStyle = "rgba(167,192,211,0.18)";
  ctx.fillRect(30, 26, w - 60, h - 52);

  top.forEach((item, i) => {
    const y = 54 + i * 32;
    const width = (Math.abs(item.beta) / maxAbs) * (w - 300);
    const positive = item.beta >= 0;
    ctx.fillStyle = positive ? "#2ec4b6" : "#ff6b6b";
    ctx.fillRect(220, y - 12, width, 20);
    ctx.fillStyle = "#e7f2fa";
    ctx.font = "12px 'Plus Jakarta Sans'";
    ctx.fillText(prettyFeatureName(item.key), 40, y + 2);
    ctx.fillText(item.beta.toFixed(2), 230 + width, y + 2);
  });
}

async function trainModelFromFile() {
  const file = csvFileInput.files[0];
  if (!file) {
    modelInfo.textContent = "Please choose a CSV file first.";
    return;
  }
  modelStatus.textContent = "Training...";
  try {
    const text = await readFileAsText(file);
    const rows = parseCsv(text);
    const model = trainRidgeRegression(rows);
    state.rows = rows;
    state.model = model;
    modelStatus.textContent = "Model ready";
    modelInfo.textContent = `Rows: ${rows.length} | R²: ${model.r2.toFixed(3)} | MAE: ${model.mae.toFixed(2)}`;
    drawImportanceChart(model);
  } catch (err) {
    modelStatus.textContent = "Training failed";
    modelInfo.textContent = `Error: ${err.message}`;
  }
}

function runPredictionAndAdvice() {
  if (!state.model) {
    modelInfo.textContent = "Train the model first.";
    return;
  }
  const input = getInputVector();
  const pred = predictExamScore(input);
  state.lastInput = input;
  state.lastPrediction = pred;
  renderPrediction(pred);
  const recs = generateRecommendations(input, pred.score);
  renderRecommendations(recs);
  renderExplanations(pred.contributions);
}

function simulatePlan() {
  if (!state.model || !state.lastInput || !state.lastPrediction) {
    modelInfo.textContent = "Run prediction first.";
    return;
  }
  const recs = generateRecommendations(state.lastInput, state.lastPrediction.score);
  if (!recs.length) return;
  const nextInput = { ...state.lastInput };
  for (const r of recs.slice(0, 2)) {
    nextInput[r.key] = r.newValue;
    const inputEl = document.getElementById(r.key);
    if (inputEl) inputEl.value = String(r.newValue);
  }
  const nextPred = predictExamScore(nextInput);
  state.lastInput = nextInput;
  state.lastPrediction = nextPred;
  renderPrediction(nextPred);
  renderRecommendations(generateRecommendations(nextInput, nextPred.score));
  renderExplanations(nextPred.contributions);
}

function bindEvents() {
  trainBtn.addEventListener("click", trainModelFromFile);
  predictBtn.addEventListener("click", runPredictionAndAdvice);
  simulateBtn.addEventListener("click", simulatePlan);
}

function bootstrap() {
  initForm();
  bindEvents();
}

bootstrap();
