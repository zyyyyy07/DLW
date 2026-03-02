import fs from "node:fs";
import path from "node:path";

const FEATURE_COLUMNS = [
  { csv: "StudyHours", key: "studyHours" },
  { csv: "Attendance", key: "attendance" },
  { csv: "Resources", key: "resources" },
  { csv: "Extracurricular", key: "extracurricular" },
  { csv: "Motivation", key: "motivation" },
  { csv: "Internet", key: "internet" },
  { csv: "Gender", key: "gender" },
  { csv: "Age", key: "age" },
  { csv: "LearningStyle", key: "learningStyle" },
  { csv: "OnlineCourses", key: "onlineCourses" },
  { csv: "Discussions", key: "discussions" },
  { csv: "AssignmentCompletion", key: "assignmentCompletion" },
  { csv: "EduTech", key: "eduTech" },
  { csv: "StressLevel", key: "stressLevel" },
];

const TARGET_COLUMN = "ExamScore";
const OUTPUT_PATH = path.resolve(process.cwd(), "src", "modelParams.js");

function parseArgs() {
  const args = process.argv.slice(2);
  const map = new Map();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : "true";
    map.set(key, value);
    if (value !== "true") i += 1;
  }
  return {
    data: map.get("data") || "student_performance.csv",
  };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV appears empty.");

  const headers = lines[0].split(",").map((h) => h.trim());
  const index = Object.fromEntries(headers.map((h, i) => [h, i]));

  for (const col of FEATURE_COLUMNS.map((f) => f.csv).concat(TARGET_COLUMN)) {
    if (!(col in index)) throw new Error(`Missing required column: ${col}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(",").map((c) => c.trim());
    if (cells.length !== headers.length) continue;
    const row = {};
    let ok = true;
    for (const f of FEATURE_COLUMNS) {
      const v = Number(cells[index[f.csv]]);
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      row[f.key] = v;
    }
    const y = Number(cells[index[TARGET_COLUMN]]);
    if (!ok || !Number.isFinite(y)) continue;
    row.target = y;
    rows.push(row);
  }
  if (!rows.length) throw new Error("No valid rows parsed from CSV.");
  return rows;
}

function seededShuffle(rows, seed = 42) {
  const out = [...rows];
  let s = seed >>> 0;
  function rand() {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  }
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function computeMinMax(rows) {
  const stats = {};
  for (const f of FEATURE_COLUMNS) {
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      const v = r[f.key];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    stats[f.key] = { min, max };
  }
  return stats;
}

function normalize(value, min, max) {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return 0;
  const z = (value - min) / span;
  return Math.max(0, Math.min(1, z));
}

function vectorize(rows, minMax) {
  return rows.map((r) => ({
    x: FEATURE_COLUMNS.map((f) => normalize(r[f.key], minMax[f.key].min, minMax[f.key].max)),
    y: r.target,
  }));
}

function trainRidge(trainRows, featureCount) {
  const n = trainRows.length;
  const weights = new Array(featureCount).fill(0);
  let bias = trainRows.reduce((sum, r) => sum + r.y, 0) / n;

  const epochs = 3500;
  const learningRate = 0.06;
  const lambda = 0.002;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array(featureCount).fill(0);
    let gradB = 0;

    for (const row of trainRows) {
      let pred = bias;
      for (let j = 0; j < featureCount; j += 1) pred += weights[j] * row.x[j];
      const err = pred - row.y;
      gradB += err;
      for (let j = 0; j < featureCount; j += 1) gradW[j] += err * row.x[j];
    }

    gradB /= n;
    for (let j = 0; j < featureCount; j += 1) {
      gradW[j] = gradW[j] / n + lambda * weights[j];
      weights[j] -= learningRate * gradW[j];
    }
    bias -= learningRate * gradB;
  }

  return { weights, bias };
}

function predictOne(x, model) {
  let pred = model.bias;
  for (let j = 0; j < x.length; j += 1) pred += model.weights[j] * x[j];
  return pred;
}

function evaluate(rows, model) {
  let sse = 0;
  let sae = 0;
  for (const r of rows) {
    const pred = predictOne(r.x, model);
    const err = pred - r.y;
    sse += err * err;
    sae += Math.abs(err);
  }
  const n = rows.length || 1;
  return {
    rmse: Math.sqrt(sse / n),
    mae: sae / n,
  };
}

function clamp01Score(v) {
  return Math.max(0, Math.min(100, v));
}

function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  if (q <= 0) return sortedAsc[0];
  if (q >= 1) return sortedAsc[sortedAsc.length - 1];
  const idx = (sortedAsc.length - 1) * q;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

function toFixedNumber(v, digits = 6) {
  return Number(v.toFixed(digits));
}

function main() {
  const { data } = parseArgs();
  const dataPath = path.resolve(process.cwd(), data);
  if (!fs.existsSync(dataPath)) throw new Error(`Data file not found: ${dataPath}`);

  const csv = fs.readFileSync(dataPath, "utf8");
  const rows = parseCsv(csv);
  const shuffled = seededShuffle(rows);
  const split = Math.max(1, Math.floor(shuffled.length * 0.8));
  const trainRaw = shuffled.slice(0, split);
  const testRaw = shuffled.slice(split);

  const minMax = computeMinMax(trainRaw);
  const train = vectorize(trainRaw, minMax);
  const test = vectorize(testRaw.length ? testRaw : trainRaw, minMax);

  const model = trainRidge(train, FEATURE_COLUMNS.length);
  const trainMetrics = evaluate(train, model);
  const testMetrics = evaluate(test, model);

  const allVectors = vectorize(rows, minMax);
  const predictedScores = allVectors.map((r) => clamp01Score(predictOne(r.x, model))).sort((a, b) => a - b);
  const targetScores = rows.map((r) => clamp01Score(r.target)).sort((a, b) => a - b);

  const gradeCount = 12;
  const gradeThresholds = [];
  for (let i = 0; i < gradeCount - 1; i += 1) {
    const q = 1 - (i + 1) / gradeCount;
    gradeThresholds.push(toFixedNumber(quantile(targetScores, q), 4));
  }

  const avgPredictedFinal =
    predictedScores.reduce((sum, x) => sum + x, 0) / Math.max(1, predictedScores.length);

  const params = {
    version: "ridge_linear_v1",
    trainedAt: new Date().toISOString(),
    target: TARGET_COLUMN,
    trainingRows: rows.length,
    split: { train: trainRaw.length, test: testRaw.length },
    metrics: {
      trainRmse: toFixedNumber(trainMetrics.rmse, 4),
      testRmse: toFixedNumber(testMetrics.rmse, 4),
      trainMae: toFixedNumber(trainMetrics.mae, 4),
      testMae: toFixedNumber(testMetrics.mae, 4),
    },
    intercept: toFixedNumber(model.bias, 6),
    features: FEATURE_COLUMNS.map((f, i) => ({
      key: f.key,
      csv: f.csv,
      min: toFixedNumber(minMax[f.key].min, 6),
      max: toFixedNumber(minMax[f.key].max, 6),
      weight: toFixedNumber(model.weights[i], 6),
    })),
    scoreClamp: [0, 100],
    gradeThresholds,
    averages: {
      predictedFinal: toFixedNumber(avgPredictedFinal, 4),
    },
  };

  const out = `export const MODEL_PARAMS = ${JSON.stringify(params, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_PATH, out, "utf8");

  console.log("Model params written:", OUTPUT_PATH);
  console.log("Rows:", rows.length, "Train/Test:", trainRaw.length, "/", testRaw.length);
  console.log("RMSE(train/test):", params.metrics.trainRmse, "/", params.metrics.testRmse);
  console.log("MAE(train/test):", params.metrics.trainMae, "/", params.metrics.testMae);
}

main();
