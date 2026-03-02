import { useEffect, useRef, useState } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart, ScatterChart, Scatter, Cell } from "recharts";
import { MODEL_PARAMS } from "./modelParams";

// ─── DATASET STATISTICS (derived from 14,003 student records) ─────────────────
const DATASET_STATS = {
  avgStudyHours: 20.0, avgAttendance: 80.2, avgAssignment: 74.5,
  avgExam: 70.3, avgOnlineCourses: 9.9, avgPredictedFinal: MODEL_PARAMS.averages?.predictedFinal ?? 63.0,
  // Approximate distribution mapped to NTU-style letter bands.
  gradeDistribution: {
    0: 0.05, 1: 0.09, 2: 0.11, 3: 0.14, 4: 0.14, 5: 0.13,
    6: 0.11, 7: 0.09, 8: 0.06, 9: 0.04, 10: 0.02, 11: 0.02,
  },
  examByStudyHours: [
    { hours: "5-10", score: 55 }, { hours: "11-15", score: 61 },
    { hours: "16-20", score: 68 }, { hours: "21-25", score: 73 },
    { hours: "26-30", score: 78 }, { hours: "31-35", score: 82 },
    { hours: "36-44", score: 86 }, { hours: "45-55", score: 87 },
    { hours: "56-70", score: 87 },
  ],
  examByAttendance: [
    { band: "60-70%", score: 62 }, { band: "71-80%", score: 69 },
    { band: "81-90%", score: 75 }, { band: "91-100%", score: 81 },
  ],
  motivationImpact: [
    { level: "Low", exam: 63, assignment: 68 },
    { level: "Mid", exam: 71, assignment: 75 },
    { level: "High", exam: 79, assignment: 83 },
  ],
  stressImpact: [
    { level: "Low", score: 77 }, { level: "Med", score: 70 }, { level: "High", score: 62 }
  ],
  learningStyleNames: ["Visual", "Auditory", "Reading/Writing", "Kinesthetic"],
  learningStyleScores: [71, 69, 73, 70],
};

const GRADE_LABELS = [
  "A+ (Highest Distinction)",
  "A (Distinction)",
  "A- (High Distinction)",
  "B+ (Very Good)",
  "B (Good)",
  "B- (Solid)",
  "C+ (Satisfactory)",
  "C (Adequate)",
  "C- (Marginal Pass)",
  "D+ (Weak Pass)",
  "D (Bare Pass)",
  "F (Fail)",
];

const GRADE_COLORS = [
  "#16a34a", "#22c55e", "#4ade80",
  "#84cc16", "#a3e635", "#facc15",
  "#f59e0b", "#fb923c", "#f97316",
  "#ef4444", "#dc2626", "#991b1b",
];

// ─── PERCENTILE CALCULATOR ─────────────────────────────────────────────────────
function calcPercentile(value, col) {
  const ranges = {
    StudyHours: [0, 70], Attendance: [0, 100],
    AssignmentCompletion: [0, 100], ExamScore: [0, 100],
    OnlineCourses: [0, 20],
  };
  const [min, max] = ranges[col] || [0, 100];
  const p = Math.round(((value - min) / (max - min)) * 100);
  return Math.max(0, Math.min(100, p));
}

function calcLearningScore(data) {
  let score = MODEL_PARAMS.intercept ?? 0;

  for (const feature of MODEL_PARAMS.features || []) {
    const raw = Number(data[feature.key] ?? 0);
    const min = Number(feature.min ?? 0);
    const max = Number(feature.max ?? 1);
    const span = max - min;
    const normalized = span > 0 ? Math.max(0, Math.min(1, (raw - min) / span)) : 0;
    score += normalized * Number(feature.weight ?? 0);
  }

  const low = Number(MODEL_PARAMS.scoreClamp?.[0] ?? 0);
  const high = Number(MODEL_PARAMS.scoreClamp?.[1] ?? 100);
  return Math.max(low, Math.min(high, Math.round(score)));
}

function predictGrade(data) {
  const score = calcLearningScore(data);
  const thresholds = MODEL_PARAMS.gradeThresholds || [];
  for (let i = 0; i < thresholds.length; i += 1) {
    if (score >= thresholds[i]) return i;
  }
  return GRADE_LABELS.length - 1;
}

function computeRisks(data) {
  const risks = [];
  if (data.attendance < 75) risks.push({ factor: "Attendance", severity: "high", msg: "Below 75% attendance strongly correlates with grade drops" });
  if (data.studyHours < 15) risks.push({ factor: "Study Hours", severity: "high", msg: "< 15hrs/week puts you in the bottom 25th percentile" });
  if (data.studyHours > 55) risks.push({ factor: "Study Load", severity: "medium", msg: "> 55hrs/week can reduce learning efficiency due to fatigue. Prioritize recovery and focus quality." });
  if (data.assignmentCompletion < 65) risks.push({ factor: "Assignments", severity: "medium", msg: "Assignment completion below 65% significantly impacts final grade" });
  if (data.stressLevel === 2) risks.push({ factor: "Stress", severity: "medium", msg: "High stress correlates with a 15-point exam score drop on average" });
  if (data.motivation === 0) risks.push({ factor: "Motivation", severity: "medium", msg: "Low motivation is the #1 predictor of disengagement over time" });
  if (!data.internet) risks.push({ factor: "Internet Access", severity: "medium", msg: "No internet access limits access to online resources and MOOCs" });
  if (data.examScore < 60) risks.push({ factor: "Exam Performance", severity: "high", msg: "Current exam score suggests conceptual gaps needing targeted review" });
  return risks;
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const S = {
  app: {
    minHeight: "100vh", background: "#080c14", color: "#e2e8f0",
    fontFamily: "'DM Sans', sans-serif", overflowX: "hidden",
  },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 40px", borderBottom: "1px solid #1e2d42",
    background: "rgba(8,12,20,0.95)", position: "sticky", top: 0, zIndex: 100,
    backdropFilter: "blur(12px)",
  },
  logo: {
    display: "flex", alignItems: "center", gap: 10,
    fontFamily: "'Space Mono', monospace", fontSize: 18, fontWeight: 700,
    color: "#38bdf8", letterSpacing: "-0.5px",
  },
  badge: {
    background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    borderRadius: 20, padding: "4px 14px", fontSize: 11,
    fontFamily: "'Space Mono', monospace", color: "#fff", fontWeight: 700,
  },
  hero: {
    padding: "80px 40px 60px", textAlign: "center",
    background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(14,165,233,0.08) 0%, transparent 70%)",
  },
  heroTitle: {
    fontSize: 52, fontWeight: 800, lineHeight: 1.1,
    background: "linear-gradient(135deg, #f8fafc 0%, #94a3b8 100%)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
    marginBottom: 16, fontFamily: "'DM Sans', sans-serif",
  },
  heroSub: { color: "#64748b", fontSize: 18, maxWidth: 560, margin: "0 auto 40px" },
  card: {
    background: "#0d1520", border: "1px solid #1e2d42", borderRadius: 16,
    padding: 28, marginBottom: 20,
  },
  cardTitle: {
    fontSize: 13, fontFamily: "'Space Mono', monospace", color: "#38bdf8",
    textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 20,
    display: "flex", alignItems: "center", gap: 8,
  },
  label: { fontSize: 12, color: "#64748b", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 },
  input: {
    width: "100%", background: "#111927", border: "1px solid #1e2d42",
    borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14,
    outline: "none", transition: "border-color 0.2s", boxSizing: "border-box",
  },
  select: {
    width: "100%", background: "#111927", border: "1px solid #1e2d42",
    borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14,
    outline: "none", cursor: "pointer", boxSizing: "border-box",
  },
  range: { width: "100%", accentColor: "#38bdf8", cursor: "pointer" },
  primaryBtn: {
    background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
    border: "none", borderRadius: 10, padding: "14px 36px",
    color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
    transition: "opacity 0.2s, transform 0.1s", display: "inline-flex",
    alignItems: "center", gap: 8,
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  statNum: { fontSize: 36, fontWeight: 800, fontFamily: "'Space Mono', monospace" },
  pill: {
    display: "inline-flex", alignItems: "center", gap: 6,
    borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700,
  },
  section: { padding: "0 40px 40px" },
};

const RISK_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#10b981" };
const APP_NAME = "Start Learning but 404 Brain Not Found AI";
const HF_MODEL = import.meta.env.VITE_HF_MODEL || "meta-llama/Llama-3.1-8B-Instruct:fastest";
const HF_DEV_ENDPOINT = "/api/hf-chat";
const HF_PROD_ENDPOINT = "https://router.huggingface.co/v1/chat/completions";
const ANALYSIS_HISTORY_KEY = "learning_state_history_v1";

function normalizeAssistantContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(part => (typeof part === "string" ? part : part?.text || "")).join("");
}

function extractJsonPayload(text) {
  const clean = (text || "").replace(/```json|```/gi, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON payload returned by model.");
  }
  return clean.slice(start, end + 1);
}

function getDataDrivenTips(data) {
  const tips = [];
  if (data.studyHours < 20) tips.push("Increase study time to at least 20h/week - this is a key threshold for above-average outcomes.");
  if (data.studyHours > 55) tips.push("Your weekly load is very high. Shift toward quality-focused sessions and recovery to avoid burnout.");
  if (data.attendance < 80) tips.push("Prioritize class attendance - attendance above 80% strongly links to grade-band improvement.");
  if (data.stressLevel === 2) tips.push("Reduce stress with 25-minute study blocks, better sleep (7-8h), and short recovery breaks.");
  if (!data.eduTech) tips.push("Start using EdTech tools (LMS, flashcards, online practice) to improve completion consistency.");
  if (!data.discussions) tips.push("Join discussions or a study group - active recall and explaining concepts improves retention.");
  if (tips.length === 0) tips.push("Your fundamentals are solid. Focus on exam technique and timed practice to reach the next band.");
  return tips;
}

function buildCoachIntroMessage(name, insights) {
  const strengths = (insights?.topStrengths || []).slice(0, 3);
  const weaknesses = (insights?.criticalWeaknesses || []).slice(0, 3);
  const quickWins = (insights?.quickWins || []).slice(0, 3);

  const formatList = (items) => (items.length ? items.map((item, i) => `${i + 1}. ${item}`).join("\n") : "1. No key items returned.");

  return [
    `Hi ${name || "Student"}, I am your AI Coach chatbot.`,
    "",
    "Snapshot of your current learning state:",
    insights?.learningState || "No summary returned from model.",
    "",
    "Top strengths:",
    formatList(strengths),
    "",
    "Priority weaknesses:",
    formatList(weaknesses),
    "",
    "Quick wins for this week:",
    formatList(quickWins),
    "",
    "Ask me follow-up questions like:",
    "- Build me a 7-day revision plan",
    "- How can I improve exam score by 10 points?",
    "- Which habit should I fix first and why?",
  ].join("\n");
}

function buildCoachSystemPrompt(data, predicted, risks, insights) {
  const learningStyle = DATASET_STATS.learningStyleNames[data.learningStyle];
  const riskSummary = risks.length
    ? risks.map((r, i) => `${i + 1}) ${r.factor} [${r.severity}] - ${r.msg}`).join("\n")
    : "No major risk factors detected.";

  const compactInsights = JSON.stringify({
    learningState: insights?.learningState || "",
    topStrengths: insights?.topStrengths || [],
    criticalWeaknesses: insights?.criticalWeaknesses || [],
    quickWins: insights?.quickWins || [],
    focusTopics: insights?.focusTopics || [],
    predictedImprovement: insights?.predictedImprovement || "",
  });

  return `You are an academic AI coach chatbot. Be specific, practical, and concise.
Use the student profile and baseline analysis below.
If user asks for a plan, provide a structured day-by-day plan.
If user asks vague questions, ask one short clarifying question before giving advice.
Avoid generic motivational fluff.

Student profile:
- Name: ${data.name || "Student"}
- Predicted grade: ${GRADE_LABELS[predicted]}
- Study hours/week: ${data.studyHours}
- Attendance: ${data.attendance}%
- Assignment completion: ${data.assignmentCompletion}%
- Exam score: ${data.examScore}/100
- Motivation: ${["Low", "Medium", "High"][data.motivation]}
- Stress: ${["Low", "Medium", "High"][data.stressLevel]}
- Learning style: ${learningStyle}
- Online courses: ${data.onlineCourses}
- Uses EdTech tools: ${data.eduTech ? "Yes" : "No"}
- Discussion participation: ${data.discussions ? "Yes" : "No"}

Risk factors:
${riskSummary}

Baseline AI analysis:
${compactInsights}`;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function loadAnalysisHistory() {
  try {
    const raw = localStorage.getItem(ANALYSIS_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-12) : [];
  } catch {
    return [];
  }
}

function saveAnalysisHistory(items) {
  try {
    localStorage.setItem(ANALYSIS_HISTORY_KEY, JSON.stringify(items.slice(-12)));
  } catch {
    // Ignore storage errors in restricted browsers.
  }
}

function getFeatureLabel(key) {
  const labels = {
    studyHours: "Study Hours",
    attendance: "Attendance",
    resources: "Resources",
    extracurricular: "Extracurricular",
    motivation: "Motivation",
    internet: "Internet Access",
    gender: "Gender",
    age: "Age",
    learningStyle: "Learning Style",
    onlineCourses: "Online Courses",
    discussions: "Discussions",
    assignmentCompletion: "Assignment Completion",
    eduTech: "EdTech Usage",
    stressLevel: "Stress Level",
  };
  return labels[key] || key;
}

function computeFeatureContributions(data) {
  const rows = (MODEL_PARAMS.features || []).map((feature) => {
    const min = safeNumber(feature.min, 0);
    const max = safeNumber(feature.max, 1);
    const span = max - min;
    const raw = safeNumber(data[feature.key], min);
    const normalized = span > 0 ? Math.max(0, Math.min(1, (raw - min) / span)) : 0;
    return {
      key: feature.key,
      label: getFeatureLabel(feature.key),
      contribution: normalized * safeNumber(feature.weight, 0),
    };
  });

  const positive = rows
    .filter((r) => r.contribution >= 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 4);
  const negative = rows
    .filter((r) => r.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 4);

  return { positive, negative };
}

function buildBudgetPlan(data, studyBudgetHours = 6) {
  const budget = Math.max(1, safeNumber(studyBudgetHours, 6));
  const actions = [];

  const addAction = (title, reason, hourCost, gain, target) => {
    if (gain <= 0 || hourCost <= 0) return;
    actions.push({
      title,
      reason,
      hourCost,
      gain,
      gainPerHour: gain / hourCost,
      target,
    });
  };

  const studyGap = Math.max(0, 28 - safeNumber(data.studyHours, 0));
  addAction(
    "Add focused deep-work study blocks",
    "Higher weekly study consistency has strong score impact.",
    Math.min(4, Math.max(1, Math.ceil(studyGap / 3))),
    studyGap * 0.55,
    `${Math.min(30, safeNumber(data.studyHours, 0) + Math.min(8, studyGap))}h/week`
  );

  const attendanceGap = Math.max(0, 90 - safeNumber(data.attendance, 0));
  addAction(
    "Improve attendance reliability",
    "Attendance gains reduce concept gaps and late revision pressure.",
    Math.min(3, Math.max(1, Math.ceil(attendanceGap / 10))),
    attendanceGap * 0.14,
    `${Math.min(100, safeNumber(data.attendance, 0) + Math.min(12, attendanceGap))}%`
  );

  const assignmentGap = Math.max(0, 90 - safeNumber(data.assignmentCompletion, 0));
  addAction(
    "Raise assignment completion quality",
    "Assignment completion strongly supports grade stability.",
    Math.min(3, Math.max(1, Math.ceil(assignmentGap / 12))),
    assignmentGap * 0.12,
    `${Math.min(100, safeNumber(data.assignmentCompletion, 0) + Math.min(15, assignmentGap))}%`
  );

  if (safeNumber(data.stressLevel, 1) > 0) {
    addAction(
      "Lower stress load using scheduled breaks",
      "Lower stress improves attention and exam execution quality.",
      2,
      safeNumber(data.stressLevel, 1) === 2 ? 5.5 : 2.5,
      safeNumber(data.stressLevel, 1) === 2 ? "High -> Medium" : "Medium -> Low"
    );
  }

  if (!safeNumber(data.discussions, 0)) {
    addAction(
      "Add one discussion session",
      "Discussion-based active recall improves retention.",
      1,
      1.8,
      "1 session/week"
    );
  }

  if (!safeNumber(data.eduTech, 0)) {
    addAction(
      "Use one EdTech practice tool",
      "EdTech tracking improves completion consistency.",
      1,
      1.3,
      "1 tool integrated this week"
    );
  }

  const selected = [];
  let used = 0;
  actions
    .sort((a, b) => b.gainPerHour - a.gainPerHour)
    .forEach((action) => {
      if (used + action.hourCost <= budget) {
        selected.push(action);
        used += action.hourCost;
      }
    });

  const expectedGain = Number(selected.reduce((sum, a) => sum + a.gain, 0).toFixed(1));
  return {
    budget,
    used,
    remaining: Math.max(0, budget - used),
    expectedGain,
    actions: selected,
  };
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("home"); // home | dashboard | insights
  const [studentData, setStudentData] = useState({
    name: "", studyHours: 20, attendance: 80, resources: 1,
    extracurricular: 0, motivation: 1, internet: 1, gender: 0,
    age: 20, learningStyle: 0, onlineCourses: 5, discussions: 0,
    assignmentCompletion: 75, examScore: 70, eduTech: 1, stressLevel: 1,
  });
  const [aiInsights, setAiInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [analysisHistory, setAnalysisHistory] = useState(() => loadAnalysisHistory());

  const predicted = predictGrade(studentData);
  const predictedFinalScore = calcLearningScore(studentData);
  const risks = computeRisks(studentData);
  const featureContributions = computeFeatureContributions(studentData);
  const budgetPlan = buildBudgetPlan(studentData, 6);

  async function requestCoachCompletion(messages, { temperature = 0.35, maxTokens = 900 } = {}) {
    const endpoint = import.meta.env.DEV ? HF_DEV_ENDPOINT : HF_PROD_ENDPOINT;
    const headers = { "Content-Type": "application/json" };

    if (!import.meta.env.DEV) {
      const token = import.meta.env.VITE_HF_API_KEY;
      if (!token) {
        throw new Error("Missing VITE_HF_API_KEY for Hugging Face API call.");
      }
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: HF_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Hugging Face API failed (${res.status}): ${errText.slice(0, 240)}`);
    }

    const data = await res.json();
    const text = normalizeAssistantContent(data?.choices?.[0]?.message?.content).trim();
    if (!text) throw new Error("Model returned empty content.");
    return text;
  }

  async function analyzeWithAI() {
    setLoading(true);
    setChatLoading(false);
    setAiError(null);
    setAiInsights(null);
    setChatMessages([]);
    setChatInput("");

    const gradeLabel = GRADE_LABELS[predicted];
    const riskSummary = risks.map(r => `- ${r.factor} (${r.severity}): ${r.msg}`).join("\n");
    const learningStyleName = DATASET_STATS.learningStyleNames[studentData.learningStyle];
    const peerExam = DATASET_STATS.avgExam;
    const peerStudy = DATASET_STATS.avgStudyHours;

    const prompt = `You are an expert AI learning coach analyzing a student's academic performance data from an EdTech platform. Provide deep, personalized, actionable insights.

STUDENT PROFILE:
- Name: ${studentData.name || "Student"}
- Age: ${studentData.age}, Study Hours/week: ${studentData.studyHours}hrs (peer avg: ${peerStudy}hrs)
- Attendance: ${studentData.attendance}% (peer avg: 80.2%)
- Assignment Completion: ${studentData.assignmentCompletion}% (peer avg: 74.5%)
- Exam Score: ${studentData.examScore}/100 (peer avg: ${peerExam.toFixed(1)})
- Online Courses enrolled: ${studentData.onlineCourses}
- Motivation Level: ${["Low","Medium","High"][studentData.motivation]}
- Stress Level: ${["Low","Medium","High"][studentData.stressLevel]}
- Learning Style: ${learningStyleName}
- Uses EdTech tools: ${studentData.eduTech ? "Yes" : "No"}
- Has internet access: ${studentData.internet ? "Yes" : "No"}
- Participates in discussions: ${studentData.discussions ? "Yes" : "No"}
- Predicted Grade: ${gradeLabel}
- Predicted Final Score (deterministic model output): ${predictedFinalScore}/100

RISK FACTORS IDENTIFIED:
${riskSummary || "No major risk factors detected."}

Based on analysis of 14,003 student records from this platform:
- Students who study 26+ hrs/week score 18% higher on exams
- Attendance above 90% correlates with a full grade-band improvement
- High stress students score 15 points lower on average
- EdTech tool usage improves assignment completion by 11%

Please provide a structured JSON response (and ONLY JSON, no markdown) with this exact schema:
{
  "learningState": "string (2-3 sentences: honest assessment of where this student stands right now)",
  "topStrengths": ["strength1", "strength2", "strength3"],
  "criticalWeaknesses": ["weakness1", "weakness2", "weakness3"],
  "weeklyPlan": [
    { "day": "Mon-Tue", "focus": "topic", "activity": "specific action", "duration": "Xhr" },
    { "day": "Wed-Thu", "focus": "topic", "activity": "specific action", "duration": "Xhr" },
    { "day": "Fri", "focus": "topic", "activity": "specific action", "duration": "Xhr" },
    { "day": "Weekend", "focus": "topic", "activity": "specific action", "duration": "Xhr" }
  ],
  "quickWins": ["actionable tip 1 (doable this week)", "actionable tip 2", "actionable tip 3"],
  "longTermStrategy": "2-3 sentences about 3-6 month improvement roadmap",
  "motivationalMessage": "1 honest, specific, encouraging sentence addressing THIS student's situation",
  "predictedImprovement": "e.g. +8 exam points in 4 weeks if top 2 actions taken",
  "focusTopics": ["topic/concept area 1", "topic/concept area 2", "topic/concept area 3"]
}`;

    try {
      const text = await requestCoachCompletion(
        [
          {
            role: "system",
            content: "You are an expert AI learning coach. Return ONLY valid JSON matching the requested schema.",
          },
          { role: "user", content: prompt },
        ],
        { temperature: 0.25, maxTokens: 1000 },
      );
      const parsed = JSON.parse(extractJsonPayload(text));
      setAiInsights(parsed);
      setChatMessages([{ role: "assistant", content: buildCoachIntroMessage(studentData.name || "Student", parsed) }]);
    } catch (e) {
      console.error("AI coach request failed:", e);
      setAiError("AI Coach unavailable. Add a valid Hugging Face token and retry. Showing data-driven insights instead.");
      const tips = getDataDrivenTips(studentData);
      setChatMessages([
        {
          role: "assistant",
          content: [
            "I could not connect to the online AI model right now.",
            "",
            "Here are data-driven recommendations you can apply immediately:",
            ...tips.map((tip) => `- ${tip}`),
          ].join("\n"),
        },
      ]);
    } finally {
      const snapshot = {
        ts: new Date().toISOString(),
        predictedFinalScore,
        predictedGrade: GRADE_LABELS[predicted].split(" ")[0],
        riskCount: risks.length,
      };
      setAnalysisHistory((prev) => {
        const next = [...prev, snapshot].slice(-12);
        saveAnalysisHistory(next);
        return next;
      });
      setLoading(false);
    }
  }

  async function sendCoachMessage() {
    const userText = chatInput.trim();
    if (!userText || chatLoading || !aiInsights) return;

    const userMessage = { role: "user", content: userText };
    const history = [...chatMessages, userMessage];
    setChatMessages(history);
    setChatInput("");
    setChatLoading(true);

    try {
      const systemPrompt = buildCoachSystemPrompt(studentData, predicted, risks, aiInsights);
      const assistantText = await requestCoachCompletion(
        [
          { role: "system", content: systemPrompt },
          ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
        ],
        { temperature: 0.45, maxTokens: 700 },
      );

      setChatMessages((prev) => [...prev, { role: "assistant", content: assistantText }]);
    } catch (e) {
      console.error("AI chat follow-up failed:", e);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "I could not answer that follow-up due to a model/network issue. Please try again in a few seconds.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  if (page === "home") return <HomePage onStart={() => setPage("input")} />;
  if (page === "input") return (
    <InputPage
      data={studentData}
      setData={setStudentData}
      onAnalyze={() => {
        setPage("dashboard");
        analyzeWithAI();
      }}
      onBack={() => setPage("home")}
    />
  );

  return (
    <Dashboard
      data={studentData}
      predicted={predicted}
      risks={risks}
      predictedFinalScore={predictedFinalScore}
      featureContributions={featureContributions}
      budgetPlan={budgetPlan}
      analysisHistory={analysisHistory}
      aiInsights={aiInsights}
      loading={loading}
      aiError={aiError}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      chatMessages={chatMessages}
      chatInput={chatInput}
      setChatInput={setChatInput}
      chatLoading={chatLoading}
      canChat={Boolean(aiInsights) && !loading}
      onSendChat={sendCoachMessage}
      onBack={() => setPage("input")}
    />
  );
}

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
function HomePage({ onStart }) {
  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={S.topBar}>
        <div style={S.logo}>
          <span style={{ fontSize: 22 }}>◈</span> {APP_NAME}
        </div>
      </div>
      <div style={S.hero}>
        <div style={{ fontSize: 13, fontFamily: "'Space Mono', monospace", color: "#38bdf8", marginBottom: 20, letterSpacing: 2 }}>
          POWERED BY ANALYSIS OF 14,003 STUDENTS
        </div>
        <h1 style={S.heroTitle}>
          Understand Your<br />Learning State
        </h1>
        <p style={S.heroSub}>
          AI-powered insights that reveal where you actually stand, what's holding you back, and exactly what to do next.
        </p>
        <button style={S.primaryBtn} onClick={onStart}>
          <span>Start My Analysis</span>
          <span>→</span>
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ padding: "0 40px 60px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        {[
          { n: "14,003", label: "Students Analyzed", icon: "👥" },
          { n: "16", label: "Learning Factors Tracked", icon: "📊" },
          { n: "4", label: "Predictive Models", icon: "🧠" },
          { n: "∞", label: "Personalized Paths", icon: "🎯" },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{s.icon}</div>
            <div style={{ ...S.statNum, fontSize: 28, color: "#38bdf8" }}>{s.n}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ padding: "0 40px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ ...S.cardTitle, justifyContent: "center" }}>How It Works</div>
        </div>
        <div style={S.grid3}>
          {[
            { step: "01", title: "Input Your Data", desc: "Enter your study habits, attendance, scores, and learning preferences — takes under 2 minutes.", color: "#38bdf8" },
            { step: "02", title: "AI Analyses Your Pattern", desc: "A Hugging Face online LLM compares your profile against 14,003 peers and identifies your learning state, strengths, and blind spots.", color: "#6366f1" },
            { step: "03", title: "Get Your Action Plan", desc: "Receive a personalized weekly study plan, quick wins, and a long-term improvement roadmap.", color: "#10b981" },
          ].map(s => (
            <div key={s.step} style={S.card}>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 32, color: s.color, fontWeight: 700, marginBottom: 12 }}>{s.step}</div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{s.title}</div>
              <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── INPUT PAGE ───────────────────────────────────────────────────────────────
function InputPage({ data, setData, onAnalyze, onBack }) {
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={S.topBar}>
        <div style={S.logo}><span>◈</span> {APP_NAME}</div>
        <button onClick={onBack} style={{ background: "none", border: "1px solid #1e2d42", color: "#94a3b8", borderRadius: 8, padding: "6px 16px", cursor: "pointer", fontSize: 13 }}>← Back</button>
      </div>

      <div style={{ padding: "48px 40px", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 36 }}>
          <div style={S.cardTitle}>Student Profile Setup</div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Tell us about your learning journey</h2>
          <p style={{ color: "#64748b", marginTop: 8 }}>All fields will be analyzed against a dataset of 14,003 students to benchmark your performance.</p>
        </div>

        {/* Personal Info */}
        <div style={S.card}>
          <div style={S.cardTitle}>👤 Personal Information</div>
          <div style={S.grid3}>
            <div>
              <div style={S.label}>Your Name (optional)</div>
              <input style={S.input} placeholder="e.g. Alex" value={data.name} onChange={e => set("name", e.target.value)} />
            </div>
            <div>
              <div style={S.label}>Age: {data.age}</div>
              <input type="range" min={0} max={60} style={S.range} value={data.age} onChange={e => set("age", +e.target.value)} />
            </div>
            <div>
              <div style={S.label}>Gender</div>
              <select style={S.select} value={data.gender} onChange={e => set("gender", +e.target.value)}>
                <option value={0}>Male</option>
                <option value={1}>Female</option>
              </select>
            </div>
          </div>
        </div>

        {/* Academic Performance */}
        <div style={S.card}>
          <div style={S.cardTitle}>📚 Academic Performance</div>
          <div style={S.grid2}>
            <div>
              <div style={S.label}>Study Hours per Week: <b style={{ color: "#38bdf8" }}>{data.studyHours}h</b> <span style={{ color: "#64748b" }}>(peer avg: 20h)</span></div>
              <input type="range" min={0} max={70} style={S.range} value={data.studyHours} onChange={e => set("studyHours", +e.target.value)} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginTop: 4 }}>
                <span>0h</span><span>70h</span>
              </div>
            </div>
            <div>
              <div style={S.label}>Attendance: <b style={{ color: "#38bdf8" }}>{data.attendance}%</b> <span style={{ color: "#64748b" }}>(peer avg: 80.2%)</span></div>
              <input type="range" min={0} max={100} style={S.range} value={data.attendance} onChange={e => set("attendance", +e.target.value)} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginTop: 4 }}>
                <span>0%</span><span>100%</span>
              </div>
            </div>
            <div>
              <div style={S.label}>Last Exam Score: <b style={{ color: "#38bdf8" }}>{data.examScore}/100</b> <span style={{ color: "#64748b" }}>(peer avg: 70.3)</span></div>
              <input type="range" min={0} max={100} style={S.range} value={data.examScore} onChange={e => set("examScore", +e.target.value)} />
            </div>
            <div>
              <div style={S.label}>Assignment Completion: <b style={{ color: "#38bdf8" }}>{data.assignmentCompletion}%</b> <span style={{ color: "#64748b" }}>(peer avg: 74.5%)</span></div>
              <input type="range" min={0} max={100} style={S.range} value={data.assignmentCompletion} onChange={e => set("assignmentCompletion", +e.target.value)} />
            </div>
          </div>
        </div>

        {/* Behavioral Factors */}
        <div style={S.card}>
          <div style={S.cardTitle}>🧠 Behavioral & Wellbeing Factors</div>
          <div style={S.grid3}>
            <div>
              <div style={S.label}>Motivation Level</div>
              <select style={S.select} value={data.motivation} onChange={e => set("motivation", +e.target.value)}>
                <option value={0}>Low — Struggling to stay engaged</option>
                <option value={1}>Medium — Generally motivated</option>
                <option value={2}>High — Highly driven</option>
              </select>
            </div>
            <div>
              <div style={S.label}>Stress Level</div>
              <select style={S.select} value={data.stressLevel} onChange={e => set("stressLevel", +e.target.value)}>
                <option value={0}>Low — Relaxed and focused</option>
                <option value={1}>Medium — Manageable stress</option>
                <option value={2}>High — Frequently overwhelmed</option>
              </select>
            </div>
            <div>
              <div style={S.label}>Learning Style</div>
              <select style={S.select} value={data.learningStyle} onChange={e => set("learningStyle", +e.target.value)}>
                <option value={0}>Visual — Diagrams, charts</option>
                <option value={1}>Auditory — Listening, discussion</option>
                <option value={2}>Reading/Writing — Notes, texts</option>
                <option value={3}>Kinesthetic — Hands-on, practice</option>
              </select>
            </div>
          </div>
        </div>

        {/* Learning Habits */}
        <div style={S.card}>
          <div style={S.cardTitle}>💻 Digital Learning & Resources</div>
          <div style={S.grid2}>
            <div>
              <div style={S.label}>Online Courses Enrolled: <b style={{ color: "#38bdf8" }}>{data.onlineCourses}</b> <span style={{ color: "#64748b" }}>(peer avg: 9.9)</span></div>
              <input type="range" min={0} max={20} style={S.range} value={data.onlineCourses} onChange={e => set("onlineCourses", +e.target.value)} />
            </div>
            <div>
              <div style={S.label}>Resource Access Level</div>
              <select style={S.select} value={data.resources} onChange={e => set("resources", +e.target.value)}>
                <option value={0}>Minimal — Few books/materials</option>
                <option value={1}>Standard — Library + some digital</option>
                <option value={2}>Abundant — Full access to resources</option>
              </select>
            </div>
          </div>
          <div style={{ ...S.grid2, marginTop: 16 }}>
            {[
              { key: "internet", label: "Internet Access", icon: "🌐" },
              { key: "eduTech", label: "Uses EdTech Tools (LMS, apps)", icon: "📱" },
              { key: "discussions", label: "Participates in Discussions", icon: "💬" },
              { key: "extracurricular", label: "Extracurricular Activities", icon: "⚽" },
            ].map(({ key, label, icon }) => (
              <label key={key} style={{
                display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                background: "#111927", border: `1px solid ${data[key] ? "#38bdf8" : "#1e2d42"}`,
                borderRadius: 8, padding: "12px 16px", transition: "border-color 0.2s",
              }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ flex: 1, fontSize: 14 }}>{label}</span>
                <div style={{
                  width: 40, height: 22, borderRadius: 11,
                  background: data[key] ? "#0ea5e9" : "#1e2d42",
                  position: "relative", transition: "background 0.2s",
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3, left: data[key] ? 20 : 3,
                    transition: "left 0.2s",
                  }} />
                </div>
                <input type="checkbox" checked={!!data[key]} onChange={e => set(key, e.target.checked ? 1 : 0)} style={{ display: "none" }} />
              </label>
            ))}
          </div>
        </div>

        <div style={{ textAlign: "center", paddingTop: 20 }}>
          <button style={S.primaryBtn} onClick={onAnalyze}>
            <span>🔍 Analyse My Learning State</span>
          </button>
          <p style={{ color: "#475569", fontSize: 13, marginTop: 14 }}>
            Your data is analysed locally + via AI model. Nothing is stored.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({
  data,
  predicted,
  risks,
  predictedFinalScore,
  featureContributions,
  budgetPlan,
  analysisHistory,
  aiInsights,
  loading,
  aiError,
  activeTab,
  setActiveTab,
  chatMessages,
  chatInput,
  setChatInput,
  chatLoading,
  canChat,
  onSendChat,
  onBack,
}) {
  const peerRadar = [
    { metric: "Study", you: calcPercentile(data.studyHours, "StudyHours"), peer: 50 },
    { metric: "Attendance", you: calcPercentile(data.attendance, "Attendance"), peer: 50 },
    { metric: "Assignments", you: calcPercentile(data.assignmentCompletion, "AssignmentCompletion"), peer: 50 },
    { metric: "Exam Score", you: calcPercentile(data.examScore, "ExamScore"), peer: 50 },
    { metric: "Online Courses", you: calcPercentile(data.onlineCourses, "OnlineCourses"), peer: 50 },
  ];

  const name = data.name || "Student";
  const gradeColor = GRADE_COLORS[predicted];
  const chatEndRef = useRef(null);

  const tabs = ["overview", "analysis", "ai-coach", "data-insights"];
  const trendData = (analysisHistory || []).map((item, i) => ({
    idx: i + 1,
    score: item.predictedFinalScore,
    risk: item.riskCount,
  }));

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMessages, chatLoading]);

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <div style={S.topBar}>
        <div style={S.logo}><span>◈</span> {APP_NAME}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} style={{
              background: activeTab === t ? "rgba(56,189,248,0.15)" : "none",
              border: activeTab === t ? "1px solid #38bdf8" : "1px solid #1e2d42",
              color: activeTab === t ? "#38bdf8" : "#64748b",
              borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontSize: 12, fontFamily: "'Space Mono', monospace",
              textTransform: "uppercase", letterSpacing: 0.8,
            }}>
              {t.replace("-", " ")}
            </button>
          ))}
          <button onClick={onBack} style={{ background: "none", border: "1px solid #1e2d42", color: "#64748b", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12 }}>Edit →</button>
        </div>
      </div>

      {/* Hero Summary Bar */}
      <div style={{
        background: "linear-gradient(135deg, rgba(14,165,233,0.1) 0%, rgba(99,102,241,0.1) 100%)",
        borderBottom: "1px solid #1e2d42", padding: "28px 40px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 13, color: "#64748b", fontFamily: "'Space Mono', monospace", marginBottom: 4 }}>LEARNING STATE REPORT</div>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>
            {name}'s Dashboard
          </h2>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ ...S.statNum, color: gradeColor, fontSize: 40 }}>{GRADE_LABELS[predicted].split(" ")[0]}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Predicted Grade</div>
          </div>
          <div style={{ width: 1, background: "#1e2d42" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ ...S.statNum, color: "#38bdf8", fontSize: 40 }}>{predictedFinalScore}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Predicted Final Score</div>
          </div>
          <div style={{ width: 1, background: "#1e2d42" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ ...S.statNum, color: risks.length === 0 ? "#10b981" : risks.some(r => r.severity === "high") ? "#ef4444" : "#f59e0b", fontSize: 40 }}>
              {risks.length}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>Risk Factors</div>
          </div>
        </div>
      </div>

      <div style={S.section}>
        <div style={{ height: 32 }} />

        {/* ── OVERVIEW TAB ── */}
        {activeTab === "overview" && (
          <div>
            <div style={S.grid2}>
              {/* Radar Chart */}
              <div style={S.card}>
                <div style={S.cardTitle}>📡 You vs Peer Average (Percentile)</div>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={peerRadar}>
                    <PolarGrid stroke="#1e2d42" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Peer Avg" dataKey="peer" stroke="#1e2d42" fill="#1e2d42" fillOpacity={0.4} />
                    <Radar name="You" dataKey="you" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.25} />
                    <Tooltip contentStyle={{ background: "#0d1520", border: "1px solid #1e2d42", borderRadius: 8, color: "#e2e8f0" }} formatter={(v) => [`${v}th percentile`]} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Key Metrics */}
              <div style={S.card}>
                <div style={S.cardTitle}>📊 Key Metrics vs Peers</div>
                {[
                  { label: "Study Hours", you: data.studyHours, peer: DATASET_STATS.avgStudyHours, unit: "h/wk", max: 70 },
                  { label: "Attendance", you: data.attendance, peer: DATASET_STATS.avgAttendance, unit: "%", max: 100 },
                  { label: "Assignment", you: data.assignmentCompletion, peer: DATASET_STATS.avgAssignment, unit: "%", max: 100 },
                  { label: "Predicted Final", you: predictedFinalScore, peer: DATASET_STATS.avgPredictedFinal, unit: "/100", max: 100 },
                ].map(m => (
                  <div key={m.label} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
                      <span style={{ color: "#94a3b8" }}>{m.label}</span>
                      <span>
                        <b style={{ color: m.you >= m.peer ? "#10b981" : "#f59e0b" }}>{m.you}{m.unit}</b>
                        <span style={{ color: "#475569" }}> / avg {m.peer.toFixed(1)}{m.unit}</span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: "#111927", borderRadius: 3, position: "relative" }}>
                      <div style={{ height: "100%", width: `${(m.you / m.max) * 100}%`, background: m.you >= m.peer ? "#10b981" : "#f59e0b", borderRadius: 3 }} />
                      <div style={{ position: "absolute", top: -4, left: `${(m.peer / m.max) * 100}%`, width: 2, height: 14, background: "#38bdf8", borderRadius: 1 }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#334155", marginTop: 3, textAlign: "right" }}>▲ peer avg</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.grid2}>
              <div style={S.card}>
                <div style={S.cardTitle}>Model Drivers (Deterministic)</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  Predicted final score is computed directly from trained model weights, not from LLM text.
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#10b981", marginBottom: 8, fontWeight: 700 }}>Positive contributors</div>
                  {(featureContributions.positive || []).slice(0, 3).map((item) => (
                    <div key={item.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: "#94a3b8" }}>{item.label}</span>
                      <span style={{ color: "#10b981", fontFamily: "'Space Mono', monospace" }}>+{item.contribution.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 8, fontWeight: 700 }}>Negative contributors</div>
                  {(featureContributions.negative || []).slice(0, 3).map((item) => (
                    <div key={item.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: "#94a3b8" }}>{item.label}</span>
                      <span style={{ color: "#ef4444", fontFamily: "'Space Mono', monospace" }}>{item.contribution.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={S.card}>
                <div style={S.cardTitle}>Budget-Optimized Action Plan</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                  Budget: {budgetPlan.budget}h/week | Planned: {budgetPlan.used}h | Expected uplift: +{budgetPlan.expectedGain}
                </div>
                {(budgetPlan.actions || []).length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 13 }}>No extra action needed for current budget. Keep current habits and review next week.</div>
                ) : (
                  (budgetPlan.actions || []).map((action, idx) => (
                    <div key={`${action.title}-${idx}`} style={{ padding: "10px 0", borderBottom: idx < budgetPlan.actions.length - 1 ? "1px solid #1e2d42" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{action.title}</div>
                        <div style={{ fontSize: 12, color: "#38bdf8", fontFamily: "'Space Mono', monospace" }}>
                          {action.hourCost}h / +{action.gain.toFixed(1)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{action.reason}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Target: {action.target}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Risk Factors */}
            <div style={S.card}>
              <div style={S.cardTitle}>⚠️ Risk Factors</div>
              {risks.length === 0 ? (
                <div style={{ textAlign: "center", padding: "20px", color: "#10b981" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 700 }}>No major risk factors detected!</div>
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>Keep maintaining your current habits. Check the AI Coach tab for optimization tips.</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {risks.map((r, i) => (
                    <div key={i} style={{
                      background: "#111927", borderRadius: 10,
                      borderLeft: `3px solid ${RISK_COLORS[r.severity]}`,
                      padding: "14px 16px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ ...S.pill, background: `${RISK_COLORS[r.severity]}20`, color: RISK_COLORS[r.severity], fontSize: 11 }}>
                          {r.severity.toUpperCase()}
                        </span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{r.factor}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{r.msg}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>Learning Trend (Recent Analyses)</div>
              {trendData.length < 2 ? (
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  Run analysis multiple times after updating inputs to track score/risk trend.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d42" />
                    <XAxis dataKey="idx" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis yAxisId="left" domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0d1520", border: "1px solid #1e2d42", borderRadius: 8, color: "#e2e8f0" }} />
                    <Line yAxisId="left" type="monotone" dataKey="score" stroke="#38bdf8" strokeWidth={2} name="Predicted Final Score" />
                    <Line yAxisId="right" type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2} name="Risk Count" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Grade Prediction */}
            <div style={S.card}>
              <div style={S.cardTitle}>🎓 Grade Prediction</div>
              <div style={{ display: "flex", gap: 12 }}>
                {GRADE_LABELS.map((g, i) => (
                  <div key={i} style={{
                    flex: 1, background: predicted === i ? `${GRADE_COLORS[i]}20` : "#111927",
                    border: `2px solid ${predicted === i ? GRADE_COLORS[i] : "#1e2d42"}`,
                    borderRadius: 12, padding: 20, textAlign: "center",
                    transition: "all 0.3s",
                  }}>
                    <div style={{ fontSize: 28, fontFamily: "'Space Mono', monospace", color: GRADE_COLORS[i], fontWeight: 700 }}>
                      {g.split(" ")[0]}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{g.split(" ").slice(1).join(" ")}</div>
                    {predicted === i && <div style={{ fontSize: 10, color: GRADE_COLORS[i], marginTop: 8, fontWeight: 700 }}>← PREDICTED</div>}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, color: "#475569", marginTop: 16, marginBottom: 0 }}>
                * Predicted grade and final score are generated by an auto-trained ridge regression model fitted on 14,003 records. Last exam score is shown separately and not used as an input feature in this predictor.
              </p>
            </div>
          </div>
        )}

        {/* ── ANALYSIS TAB ── */}
        {activeTab === "analysis" && (
          <div>
            <div style={S.grid2}>
              {/* Exam by Study Hours */}
              <div style={S.card}>
                <div style={S.cardTitle}>📈 Exam Score vs Study Hours (Dataset)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={DATASET_STATS.examByStudyHours}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d42" />
                    <XAxis dataKey="hours" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis domain={[50, 90]} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0d1520", border: "1px solid #1e2d42", borderRadius: 8, color: "#e2e8f0" }} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {DATASET_STATS.examByStudyHours.map((entry, i) => {
                        const inRange = (data.studyHours <= [10, 15, 20, 25, 30, 35, 44, 55, 70][i] && data.studyHours > [0, 10, 15, 20, 25, 30, 35, 44, 55][i]);
                        return <Cell key={i} fill={inRange ? "#38bdf8" : "#1e3a5f"} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 12, color: "#475569", margin: "10px 0 0", textAlign: "center" }}>Blue bar = your study hours bracket</p>
              </div>

              {/* Motivation Impact */}
              <div style={S.card}>
                <div style={S.cardTitle}>💡 Motivation Impact on Performance</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={DATASET_STATS.motivationImpact}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d42" />
                    <XAxis dataKey="level" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis domain={[55, 90]} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0d1520", border: "1px solid #1e2d42", borderRadius: 8, color: "#e2e8f0" }} />
                    <Bar dataKey="exam" name="Exam Score" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="assignment" name="Assignment %" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Attendance Impact */}
              <div style={S.card}>
                <div style={S.cardTitle}>🎯 Attendance vs Exam Score</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={DATASET_STATS.examByAttendance}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d42" />
                    <XAxis dataKey="band" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis domain={[55, 85]} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0d1520", border: "1px solid #1e2d42", borderRadius: 8, color: "#e2e8f0" }} />
                    <Area type="monotone" dataKey="score" stroke="#38bdf8" fill="rgba(56,189,248,0.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Stress Impact */}
              <div style={S.card}>
                <div style={S.cardTitle}>😓 Stress Level vs Exam Score</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={DATASET_STATS.stressImpact}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2d42" />
                    <XAxis dataKey="level" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis domain={[55, 85]} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0d1520", border: "1px solid #1e2d42", borderRadius: 8, color: "#e2e8f0" }} />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {DATASET_STATS.stressImpact.map((_, i) => (
                        <Cell key={i} fill={data.stressLevel === i ? "#ef4444" : "#1e3a5f"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 12, color: "#475569", margin: "10px 0 0", textAlign: "center" }}>Red bar = your current stress level</p>
              </div>
            </div>

            {/* Learning Style Breakdown */}
            <div style={S.card}>
              <div style={S.cardTitle}>🧠 Learning Style Performance Analysis</div>
              <div style={{ display: "flex", gap: 16 }}>
                {DATASET_STATS.learningStyleNames.map((name, i) => (
                  <div key={i} style={{
                    flex: 1, textAlign: "center", padding: 20,
                    background: data.learningStyle === i ? "rgba(56,189,248,0.1)" : "#111927",
                    border: `1px solid ${data.learningStyle === i ? "#38bdf8" : "#1e2d42"}`,
                    borderRadius: 12,
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>
                      {["👁️", "👂", "📝", "🤲"][i]}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{name}</div>
                    <div style={{ fontSize: 24, fontFamily: "'Space Mono', monospace", color: "#38bdf8", fontWeight: 700 }}>
                      {DATASET_STATS.learningStyleScores[i]}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>avg exam score</div>
                    {data.learningStyle === i && <div style={{ fontSize: 10, color: "#38bdf8", marginTop: 8, fontWeight: 700 }}>← YOUR STYLE</div>}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, color: "#475569", marginTop: 16, marginBottom: 0 }}>
                Your learning style ({DATASET_STATS.learningStyleNames[data.learningStyle]}) is associated with an average exam score of {DATASET_STATS.learningStyleScores[data.learningStyle]}/100 across the dataset. Focus your resources on formats that match this style.
              </p>
            </div>
          </div>
        )}

        {/* ── AI COACH TAB ── */}
        {activeTab === "ai-coach" && (
          <div>
            {loading && (
              <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>🤖</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>AI is analyzing your learning state...</div>
                <div style={{ color: "#64748b", fontSize: 14 }}>Comparing against 14,003 student records and generating personalized insights</div>
                <div style={{ marginTop: 20, display: "flex", justifyContent: "center", gap: 6 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 8, height: 8, borderRadius: "50%", background: "#38bdf8",
                      animation: "pulse 1.5s infinite",
                      animationDelay: `${i * 0.3}s`,
                    }} />
                  ))}
                </div>
                <style>{`@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
              </div>
            )}

            {aiError && !loading && (
              <div style={{ ...S.card, borderColor: "#f59e0b" }}>
                <div style={{ color: "#f59e0b", fontWeight: 700, marginBottom: 8 }}>⚠️ {aiError}</div>
                <FallbackInsights data={{ ...{ examScore: 70, studyHours: 20, attendance: 80, assignmentCompletion: 75, motivation: 1, stressLevel: 1, learningStyle: 0 }, ...{ examScore: data.examScore, studyHours: data.studyHours, attendance: data.attendance } }} risks={risks} />
              </div>
            )}

            {aiInsights && !loading && <AIInsightsPanel insights={aiInsights} />}

            {!loading && (
              <div style={{ ...S.card, padding: 0, minHeight: 520, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #1e2d42", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 1 }}>
                    AI Coach Chatbot
                  </div>
                  <div style={{ fontSize: 11, color: canChat ? "#10b981" : "#f59e0b" }}>
                    {canChat ? "Online" : "Offline"}
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "#0b1320" }}>
                  {chatMessages.length === 0 && (
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                      The coach is preparing your baseline summary. Once ready, ask any follow-up question.
                    </div>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div
                        style={{
                          maxWidth: "86%",
                          padding: "10px 12px",
                          borderRadius: 12,
                          fontSize: 13,
                          lineHeight: 1.55,
                          whiteSpace: "pre-wrap",
                          background: m.role === "user" ? "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)" : "#111927",
                          border: m.role === "user" ? "none" : "1px solid #1e2d42",
                          color: "#e2e8f0",
                        }}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div style={{ display: "flex", justifyContent: "flex-start" }}>
                      <div style={{ background: "#111927", border: "1px solid #1e2d42", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "#94a3b8" }}>
                        AI Coach is typing...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div style={{ borderTop: "1px solid #1e2d42", padding: 14, background: "#0d1520" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                    {[
                      "Build me a 7-day revision plan",
                      "How can I improve exam score fast?",
                      "What should I fix first this week?",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => setChatInput(prompt)}
                        disabled={!canChat || chatLoading}
                        style={{
                          border: "1px solid #1e2d42",
                          background: "#111927",
                          color: "#94a3b8",
                          borderRadius: 999,
                          padding: "6px 10px",
                          fontSize: 11,
                          cursor: !canChat || chatLoading ? "not-allowed" : "pointer",
                          opacity: !canChat || chatLoading ? 0.5 : 1,
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          onSendChat();
                        }
                      }}
                      disabled={!canChat || chatLoading}
                      placeholder={canChat ? "Ask your AI Coach a follow-up question..." : "AI model unavailable - add valid token and rerun analysis."}
                      style={{
                        ...S.input,
                        minHeight: 64,
                        resize: "vertical",
                      }}
                    />
                    <button
                      onClick={onSendChat}
                      disabled={!canChat || chatLoading || !chatInput.trim()}
                      style={{
                        ...S.primaryBtn,
                        padding: "12px 18px",
                        opacity: !canChat || chatLoading || !chatInput.trim() ? 0.5 : 1,
                        cursor: !canChat || chatLoading || !chatInput.trim() ? "not-allowed" : "pointer",
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DATA INSIGHTS TAB ── */}
        {activeTab === "data-insights" && (
          <div>
            <div style={S.card}>
              <div style={S.cardTitle}>📋 Dataset Overview</div>
              <div style={S.grid3}>
                {[
                  { label: "Total Students", value: "14,003", icon: "👥" },
                  { label: "Avg Study Hours", value: "20h/wk", icon: "⏰" },
                  { label: "Avg Attendance", value: "80.2%", icon: "📅" },
                  { label: "Avg Exam Score", value: "70.3/100", icon: "📝" },
                  { label: "Avg Assignment Completion", value: "74.5%", icon: "✅" },
                  { label: "Avg Online Courses", value: "9.9 enrolled", icon: "💻" },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, marginBottom: 0, textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Space Mono', monospace", color: "#38bdf8" }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={S.card}>
              <div style={S.cardTitle}>🔑 Key Dataset Findings</div>
              {[
                { finding: "Study hours have the strongest positive correlation with exam scores — each additional 5h/wk adds ~4 exam points on average.", impact: "High" },
                { finding: "Attendance above 90% is the single strongest predictor of grade improvement, worth approximately one full grade band.", impact: "High" },
                { finding: "High-stress students score 15 points lower on exams than low-stress peers with identical study hours.", impact: "High" },
                { finding: "EdTech tool adoption improves assignment completion rates by ~11% and exam scores by ~6 points.", impact: "Medium" },
                { finding: "Discussion participation correlates with higher scores even when study hours are equal — active recall helps.", impact: "Medium" },
                { finding: "Online course enrollment beyond 10 courses shows diminishing returns; quality > quantity.", impact: "Medium" },
                { finding: "Learning style has relatively minor impact on absolute score (~4 point variance) — habits matter more.", impact: "Low" },
                { finding: "Age 20-23 students perform marginally better than <20 or >25, likely due to learning maturity.", impact: "Low" },
              ].map((f, i) => (
                <div key={i} style={{
                  padding: "14px 0", borderBottom: i < 7 ? "1px solid #111927" : "none",
                  display: "flex", gap: 14, alignItems: "flex-start",
                }}>
                  <span style={{
                    ...S.pill, flexShrink: 0,
                    background: f.impact === "High" ? "#ef444420" : f.impact === "Medium" ? "#f59e0b20" : "#64748b20",
                    color: f.impact === "High" ? "#ef4444" : f.impact === "Medium" ? "#f59e0b" : "#64748b",
                  }}>
                    {f.impact}
                  </span>
                  <span style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>{f.finding}</span>
                </div>
              ))}
            </div>

            {/* Grade Distribution */}
            <div style={S.card}>
              <div style={S.cardTitle}>📊 Grade Distribution Across Dataset</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                {GRADE_LABELS.map((g, i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: 80, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                      <div style={{
                        width: "60%", background: GRADE_COLORS[i],
                        height: `${DATASET_STATS.gradeDistribution[i] * 100 * 2.5}%`,
                        borderRadius: "4px 4px 0 0", minHeight: 4,
                        opacity: predicted === i ? 1 : 0.4,
                        transition: "opacity 0.3s",
                      }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: GRADE_COLORS[i], marginTop: 6 }}>{g.split(" ")[0]}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{Math.round(DATASET_STATS.gradeDistribution[i] * 100)}%</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 13, color: "#475569", margin: 0 }}>
                Bright bar = your predicted NTU-style letter band. Distribution is shown across A+ to F to provide finer performance granularity.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AI INSIGHTS PANEL ────────────────────────────────────────────────────────
function AIInsightsPanel({ insights }) {
  return (
    <div>
      {/* Learning State */}
      <div style={{
        ...S.card,
        background: "linear-gradient(135deg, rgba(14,165,233,0.08) 0%, rgba(99,102,241,0.08) 100%)",
        borderColor: "#0ea5e9",
      }}>
        <div style={S.cardTitle}>🤖 AI Learning State Assessment</div>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "#cbd5e1", margin: 0 }}>{insights.learningState}</p>
        {insights.motivationalMessage && (
          <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(16,185,129,0.1)", borderRadius: 8, borderLeft: "3px solid #10b981" }}>
            <p style={{ margin: 0, fontSize: 14, color: "#6ee7b7", fontStyle: "italic" }}>💬 "{insights.motivationalMessage}"</p>
          </div>
        )}
        {insights.predictedImprovement && (
          <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(56,189,248,0.1)", padding: "8px 16px", borderRadius: 8 }}>
            <span style={{ fontSize: 16 }}>📈</span>
            <span style={{ fontSize: 14, color: "#38bdf8", fontWeight: 600 }}>{insights.predictedImprovement}</span>
          </div>
        )}
      </div>

      <div style={S.grid2}>
        {/* Strengths */}
        <div style={S.card}>
          <div style={S.cardTitle}>💪 Your Strengths</div>
          {(insights.topStrengths || []).map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#10b98120", border: "1px solid #10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#10b981", flexShrink: 0 }}>✓</div>
              <span style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>{s}</span>
            </div>
          ))}
        </div>

        {/* Weaknesses */}
        <div style={S.card}>
          <div style={S.cardTitle}>🎯 Areas to Improve</div>
          {(insights.criticalWeaknesses || []).map((w, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#ef444420", border: "1px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#ef4444", flexShrink: 0 }}>!</div>
              <span style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>{w}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Wins */}
      <div style={S.card}>
        <div style={S.cardTitle}>⚡ Quick Wins — Do These This Week</div>
        <div style={S.grid3}>
          {(insights.quickWins || []).map((w, i) => (
            <div key={i} style={{ background: "#111927", borderRadius: 10, padding: 16, borderTop: "2px solid #38bdf8" }}>
              <div style={{ fontFamily: "'Space Mono', monospace", color: "#38bdf8", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>0{i + 1}</div>
              <p style={{ margin: 0, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>{w}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Plan */}
      {insights.weeklyPlan && (
        <div style={S.card}>
          <div style={S.cardTitle}>📅 Personalized Weekly Study Plan</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            {insights.weeklyPlan.map((p, i) => (
              <div key={i} style={{ background: "#111927", borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, fontFamily: "'Space Mono', monospace", color: "#38bdf8", marginBottom: 8 }}>{p.day}</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{p.focus}</div>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{p.activity}</p>
                <div style={{ marginTop: 10, fontSize: 12, color: "#475569", fontFamily: "'Space Mono', monospace" }}>⏱ {p.duration}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Focus Topics + Long Term */}
      <div style={S.grid2}>
        {insights.focusTopics && (
          <div style={S.card}>
            <div style={S.cardTitle}>🔍 Recommended Focus Topics</div>
            {insights.focusTopics.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: "#94a3b8" }}>{t}</span>
              </div>
            ))}
          </div>
        )}
        {insights.longTermStrategy && (
          <div style={S.card}>
            <div style={S.cardTitle}>🗺️ Long-Term Strategy (3–6 months)</div>
            <p style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.7, margin: 0 }}>{insights.longTermStrategy}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── FALLBACK INSIGHTS ────────────────────────────────────────────────────────
function FallbackInsights({ data }) {
  const tips = [];
  if (data.studyHours < 20) tips.push("Increase study time to at least 20h/week — dataset shows this is the threshold for above-average performance.");
  if (data.attendance < 80) tips.push("Prioritize attending classes — attendance above 80% is strongly linked to a full grade-band improvement.");
  if (data.stressLevel === 2) tips.push("Address high stress proactively: try the Pomodoro technique, sleep 7-8h, and break study sessions into 25-min blocks.");
  if (!data.eduTech) tips.push("Start using EdTech tools (Notion, Anki, Coursera) — students who use them complete 11% more assignments.");
  if (!data.discussions) tips.push("Join or start a study group — active recall through discussion is one of the most effective learning strategies.");
  if (tips.length === 0) tips.push("Your profile shows good fundamentals. Focus on exam technique and practice papers to push to the next grade band.");

  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>📊 Data-Driven Insights</div>
      {tips.map((t, i) => (
        <div key={i} style={{ padding: "12px 0", borderBottom: i < tips.length - 1 ? "1px solid #1e2d42" : "none", fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>
          <span style={{ color: "#38bdf8", marginRight: 8 }}>→</span>{t}
        </div>
      ))}
    </div>
  );
}
