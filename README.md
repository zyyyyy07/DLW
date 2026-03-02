# Student Learning AI Dashboard

AI-powered learning-state modeling app built with React + Vite.

## Problem Fit
This project addresses the hackathon goal of modeling a student's evolving learning state and giving personalized, actionable guidance by combining:
- deterministic score prediction from real dataset training
- explainable feature-level analysis
- online LLM coaching for natural-language guidance
- time-budgeted action planning

## Core Capabilities
- Deterministic `Predicted Final Score` and `Predicted Grade` from a trained regression model.
- AI Coach (Hugging Face online LLM) that returns structured JSON insights and supports follow-up chatbot Q&A.
- Explainability panel showing top positive/negative feature contributions.
- Risk detection panel with concrete factor-level warnings.
- Budget-optimized weekly plan (greedy selection by gain-per-hour).
- Learning trend chart across recent analyses (score/risk trajectory).

## Algorithms and Methods
### 1) Predictive Model (Deterministic)
- Model type: Ridge linear regression.
- Training data: `student_performance.csv` (14,003 rows).
- Target: `ExamScore`.
- Features: 14 behavioral/profile factors (`studyHours`, `attendance`, `assignmentCompletion`, `stressLevel`, etc.).
- Preprocessing: min-max normalization (based on train split statistics).
- Training: gradient descent with L2 regularization (ridge).
- Output artifact: `src/modelParams.js`.
- Runtime scoring: weighted normalized sum + intercept, clamped to `[0, 100]`.

### 2) Grade Band Prediction
- Continuous predicted score is mapped to NTU-style letter bands (A+ ... F).
- Thresholds are learned from score quantiles during training, then stored in `modelParams.js`.

### 3) Risk Analysis
- Rule-based risk engine over interpretable factors (attendance, study hours, stress, assignments, etc.).
- Each risk includes severity and actionable message.

### 4) Explainability
- Per-feature contribution computed as:
- `contribution = normalized_feature_value * learned_weight`
- UI displays top positive and top negative contributors.

### 5) Action Recommendation Optimization
- Candidate interventions are scored by estimated gain and hour cost.
- Greedy optimizer chooses highest gain-per-hour actions under weekly budget constraint.
- Produces concrete plan blocks with target outcomes.

### 6) AI Coach (Online LLM)
- Provider: Hugging Face chat completions API.
- Model endpoint configured by `VITE_HF_MODEL`.
- Prompt includes deterministic model outputs + risk summary + profile context.
- Response schema enforced as JSON for consistent UI rendering.
- If API is unavailable, app falls back to deterministic data-driven tips.

## Project Structure
- `src/App.jsx`: main UI, prediction logic, risk/plan/explainability panels, AI coach flows
- `src/modelParams.js`: trained model parameters used at runtime
- `scripts/train_model.mjs`: training pipeline for ridge model + thresholds export
- `student_performance.csv`: dataset used for parameter training

## Quick Start
1. Install dependencies:
```bash
npm install
```

2. Create `.env` from template:
```bash
copy .env.example .env
```
macOS/Linux alternative:
```bash
cp .env.example .env
```

3. Add Hugging Face token in `.env`:
```env
HF_API_KEY=hf_your_token_here
VITE_HF_MODEL=meta-llama/Llama-3.1-8B-Instruct:fastest
```

4. Train model params (optional if `src/modelParams.js` already exists):
```bash
npm run train:model
```

5. Run app:
```bash
npm run dev
```

PowerShell note:
- If `npm` script policy is blocked, run with `npm.cmd` (for example `npm.cmd run dev`).
