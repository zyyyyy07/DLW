# Student Learning AI Dashboard

React + Vite learning analytics app with:
- dataset-driven student performance benchmarking
- AI Coach insights powered by Hugging Face online LLMs
- interactive AI Coach chatbot for follow-up Q&A

## Quick Start

1. Install dependencies
```bash
npm install
```

2. Create env file from template
```bash
cp .env.example .env
```

3. Add your Hugging Face token in `.env`
```env
HF_API_KEY=hf_xxxxxxxxxxxxxxxxx
VITE_HF_MODEL=meta-llama/Llama-3.1-8B-Instruct:fastest
```

4. Start development server
```bash
npm run dev
```

## AI Coach Notes

- The app uses Hugging Face chat completions via `/api/hf-chat` in development.
- Vite proxy injects `HF_API_KEY` server-side in dev mode.
- If the model call fails, the UI falls back to data-driven insights.

## Branding

- Home page `BETA · v1.0` badge removed.
- App name: `Start Learning but 404 Brain Not Found AI`.
