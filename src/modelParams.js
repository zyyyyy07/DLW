export const MODEL_PARAMS = {
  "version": "ridge_linear_v1",
  "trainedAt": "2026-03-02T15:22:22.749Z",
  "target": "ExamScore",
  "trainingRows": 14003,
  "split": {
    "train": 11202,
    "test": 2801
  },
  "metrics": {
    "trainRmse": 17.645,
    "testRmse": 17.6743,
    "trainMae": 15.274,
    "testMae": 15.3652
  },
  "intercept": 71.456138,
  "features": [
    {
      "key": "studyHours",
      "csv": "StudyHours",
      "min": 5,
      "max": 44,
      "weight": 0.134744
    },
    {
      "key": "attendance",
      "csv": "Attendance",
      "min": 60,
      "max": 100,
      "weight": -0.992775
    },
    {
      "key": "resources",
      "csv": "Resources",
      "min": 0,
      "max": 2,
      "weight": 0.145064
    },
    {
      "key": "extracurricular",
      "csv": "Extracurricular",
      "min": 0,
      "max": 1,
      "weight": -0.424043
    },
    {
      "key": "motivation",
      "csv": "Motivation",
      "min": 0,
      "max": 2,
      "weight": -0.626037
    },
    {
      "key": "internet",
      "csv": "Internet",
      "min": 0,
      "max": 1,
      "weight": -0.459685
    },
    {
      "key": "gender",
      "csv": "Gender",
      "min": 0,
      "max": 1,
      "weight": 0.733722
    },
    {
      "key": "age",
      "csv": "Age",
      "min": 18,
      "max": 29,
      "weight": -0.624007
    },
    {
      "key": "learningStyle",
      "csv": "LearningStyle",
      "min": 0,
      "max": 3,
      "weight": 0.343848
    },
    {
      "key": "onlineCourses",
      "csv": "OnlineCourses",
      "min": 0,
      "max": 20,
      "weight": 0.982342
    },
    {
      "key": "discussions",
      "csv": "Discussions",
      "min": 0,
      "max": 1,
      "weight": -1.021775
    },
    {
      "key": "assignmentCompletion",
      "csv": "AssignmentCompletion",
      "min": 50,
      "max": 100,
      "weight": 1.493428
    },
    {
      "key": "eduTech",
      "csv": "EduTech",
      "min": 0,
      "max": 1,
      "weight": 0.358478
    },
    {
      "key": "stressLevel",
      "csv": "StressLevel",
      "min": 0,
      "max": 2,
      "weight": -1.390027
    }
  ],
  "scoreClamp": [
    0,
    100
  ],
  "gradeThresholds": [
    96,
    91,
    86,
    81,
    75,
    70,
    65,
    61,
    55,
    50,
    45
  ],
  "averages": {
    "predictedFinal": 70.337
  }
};
