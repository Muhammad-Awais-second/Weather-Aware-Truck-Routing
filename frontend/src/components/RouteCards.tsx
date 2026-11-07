import React from "react";
import type { RoutePlan, TripPlanResponse } from "../api/types";
import { RISK_COLORS } from "../lib/riskColors";
import { formatDuration } from "../lib/format";
import { Award, AlertTriangle, ShieldCheck } from "lucide-react";

interface RouteCardsProps {
  planData: TripPlanResponse;
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
}

export const RouteCards: React.FC<RouteCardsProps> = ({
  planData,
  selectedRouteId,
  onSelectRoute,
}) => {
  const { routes, recommended_route_id, recommendation_reason, no_safe_route, demo_mode } = planData;

  return (
    <div className="space-y-3">
      {demo_mode && (
        <div className="p-3.5 bg-amber-50 text-amber-900 rounded-xl border border-amber-300 shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold tracking-tight flex items-center gap-1.5">
              <span>Demo Routes Active</span>
              <span className="text-[10px] uppercase font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                DEMO_MODE=true
              </span>
            </div>
            <div className="text-xs text-amber-800 mt-0.5 leading-relaxed">
              TomTom API key is not configured on the backend. Displaying synthetic highway corridors with live Open-Meteo weather sampling for evaluation.
            </div>
          </div>
        </div>
      )}

      {no_safe_route && (
        <div className="p-3.5 bg-purple-900 text-purple-100 rounded-xl border border-purple-700 shadow-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-bold tracking-tight">
              No Safe Route at this Departure Time
            </div>
            <div className="text-xs text-purple-200 mt-0.5">
              All 3 route options encounter extreme "No Travel" weather conditions (e.g. winds ≥55 mph or severe gusts).
              Consider delaying departure by 4–8 hours or choosing an alternate corridor.
            </div>
          </div>
        </div>
      )}

      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
        Route Comparison ({routes.length} Available)
      </div>

      <div className="space-y-2.5">
        {routes.map((route: RoutePlan) => {
          const isRecommended = route.id === recommended_route_id;
          const isSelected = route.id === selectedRouteId;
          const { summary } = route;

          return (
            <div
              key={route.id}
              onClick={() => onSelectRoute(route.id)}
              className={`cursor-pointer rounded-xl border transition-all duration-200 p-4 relative ${isSelected
                  ? "border-indigo-600 ring-2 ring-indigo-500/20 shadow-md bg-white"
                  : "border-slate-200 bg-white/80 hover:bg-white hover:border-slate-300 shadow-xs"
                } ${isRecommended ? "border-l-4 border-l-emerald-600" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                  >
                    {route.rank}
                  </span>
                  <span className="font-bold text-slate-900 text-sm">{route.name}</span>
                  {isRecommended && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      <Award className="w-3 h-3 text-emerald-600" /> Recommended
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className="text-xs px-2 py-0.5 rounded-md font-semibold border"
                    style={{
                      borderColor: RISK_COLORS[summary.max_level],
                      color: summary.max_level === "No Travel" ? "#581c87" : RISK_COLORS[summary.max_level],
                      backgroundColor: `${RISK_COLORS[summary.max_level]}15`,
                    }}
                  >
                    Worst: {summary.max_level}
                  </span>
                </div>
              </div>

              {/* Recommendation Reason Banner */}
              {isRecommended && recommendation_reason && (
                <div className="mt-2.5 px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-medium">{recommendation_reason}</span>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Distance</span>
                  <span className="font-semibold text-slate-800">{summary.distance_mi} mi</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Drive Time</span>
                  <span className="font-semibold text-slate-800">{formatDuration(summary.duration_s)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Avg Risk Score</span>
                  <span className="font-semibold text-slate-800">{summary.avg_risk.toFixed(2)} / 4.0</span>
                </div>
              </div>

              {/* Risk Miles Breakdown Mini Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                  <span>Weather Risk Corridor Exposure</span>
                  <span className="font-medium text-slate-700">
                    {summary.miles_by_level["Severe"] > 0 && (
                      <span className="text-rose-600 font-semibold mr-2">
                        {summary.miles_by_level["Severe"]} mi Severe
                      </span>
                    )}
                    {summary.miles_by_level["No Travel"] > 0 && (
                      <span className="text-purple-900 font-semibold mr-2">
                        {summary.miles_by_level["No Travel"]} mi No Travel
                      </span>
                    )}
                    {summary.miles_by_level["High"] > 0 && (
                      <span className="text-orange-600 font-medium">
                        {summary.miles_by_level["High"]} mi High
                      </span>
                    )}
                  </span>
                </div>

                {/* Progress-style segmented line */}
                <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-100">
                  {(["Low", "Moderate", "High", "Severe", "No Travel"] as const).map((lvl) => {
                    const miles = summary.miles_by_level[lvl] || 0;
                    if (miles <= 0) return null;
                    const pct = (miles / summary.distance_mi) * 100;
                    return (
                      <div
                        key={lvl}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: RISK_COLORS[lvl],
                        }}
                        title={`${lvl}: ${miles} mi (${pct.toFixed(0)}%)`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
