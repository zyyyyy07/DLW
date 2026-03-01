# DLW - AI Study Advisor Dashboard

An interactive web dashboard that trains a local model from student data and provides explainable learning recommendations.

## Features

- Upload and train directly from `student_performance.csv`
- In-browser ML model (Ridge Regression, no backend required)
- Predict:
  - Exam Score
  - Grade Band
  - Risk Level
- Explainability:
  - Feature importance chart
  - Top positive/negative contributors
- Actionable recommendations:
  - Prioritized improvement actions
  - Estimated score gain
  - What-if simulation plan

## Project Structure

```text
DLW/
├─ dashboard/
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
└─ README.md
```

## Quick Start
1. Download all the files

2. Open terminal in project root:

```powershell
python -m http.server 8080
```

3. Open:

```text
http://localhost:8080
```

4. In the page:
- Upload `student_performance.csv`
- Click `Train Model`
- Enter student profile values
- Click `Predict & Recommend`
- Optionally click `Simulate Improvement Plan`

## Dataset Requirements

Expected columns in CSV:

- `StudyHours`
- `Attendance`
- `Resources`
- `Extracurricular`
- `Motivation`
- `Internet`
- `Gender`
- `Age`
- `LearningStyle`
- `OnlineCourses`
- `Discussions`
- `AssignmentCompletion`
- `ExamScore`
- `EduTech`
- `StressLevel`
- `FinalGrade`

The model currently uses the behavioral and study-related fields and predicts `ExamScore`.

## Notes

- The app runs fully in the browser.
- No data is sent to any external server.
- A local web server is recommended (`python -m http.server`) to avoid file access restrictions.

## Future Improvements

- Connect to a FastAPI backend for persistent model management
- Add chat-based tutor recommendations
- Add exportable PDF student reports
- Add multi-student history tracking

