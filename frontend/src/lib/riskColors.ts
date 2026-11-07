import type { RiskLevel } from "../api/types";

export const RISK_COLORS: Record<RiskLevel, string> = {
  Low: "#22c55e",       // Green
  Moderate: "#eab308",  // Yellow
  High: "#f97316",      // Orange
  Severe: "#ef4444",    // Red
  "No Travel": "#581c87", // Dark Purple
};

export const RISK_BG_CLASSES: Record<RiskLevel, string> = {
  Low: "bg-emerald-50 text-emerald-800 border-emerald-300",
  Moderate: "bg-amber-50 text-amber-800 border-amber-300",
  High: "bg-orange-50 text-orange-800 border-orange-300",
  Severe: "bg-red-50 text-red-800 border-red-300",
  "No Travel": "bg-purple-100 text-purple-900 border-purple-400 font-semibold",
};

export const RISK_BADGE_CLASSES: Record<RiskLevel, string> = {
  Low: "bg-emerald-100 text-emerald-700",
  Moderate: "bg-yellow-100 text-yellow-800",
  High: "bg-orange-100 text-orange-700",
  Severe: "bg-rose-100 text-rose-700",
  "No Travel": "bg-purple-900 text-purple-100",
};

export const RISK_LEVEL_INDEX: Record<RiskLevel, number> = {
  Low: 0,
  Moderate: 1,
  High: 2,
  Severe: 3,
  "No Travel": 4,
};

export const RISK_LEVEL_NAMES: RiskLevel[] = [
  "Low",
  "Moderate",
  "High",
  "Severe",
  "No Travel",
];
