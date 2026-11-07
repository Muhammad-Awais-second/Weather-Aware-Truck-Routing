import React, { useState, useEffect } from "react";
import { formatSliderLabel } from "../lib/format";
import { Play, Pause, Flame } from "lucide-react";

interface ForecastSliderProps {
  departureIso: string;
  hourOffset: number;
  onHourChange: (hour: number) => void;
  showHeatmap: boolean;
  onToggleHeatmap: (show: boolean) => void;
}

export const ForecastSlider: React.FC<ForecastSliderProps> = ({
  departureIso,
  hourOffset,
  onHourChange,
  showHeatmap,
  onToggleHeatmap,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  // Play animation through 0..48 hours
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      onHourChange(hourOffset >= 48 ? 0 : hourOffset + 1);
    }, 400);
    return () => clearInterval(interval);
  }, [isPlaying, hourOffset, onHourChange]);

  const label = formatSliderLabel(departureIso, hourOffset);

  return (
    <div className="bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-lg border border-slate-200 flex flex-col gap-2 pointer-events-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleHeatmap(!showHeatmap)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
              showHeatmap
                ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            {showHeatmap ? "Heatmap Active" : "Heatmap Hidden"}
          </button>
          <span className="text-xs font-bold text-slate-800 tracking-tight">
            Corridor Risk Slider
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">
            {label}
          </span>
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            title={isPlaying ? "Pause scrubbing" : "Auto play hours"}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-slate-400 font-mono">0h</span>
        <input
          type="range"
          min="0"
          max="48"
          step="1"
          value={hourOffset}
          onChange={(e) => {
            setIsPlaying(false);
            onHourChange(Number(e.target.value));
          }}
          className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg appearance-none"
        />
        <span className="text-[10px] font-bold text-slate-400 font-mono">+48h</span>
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
        <span>Scrubbing runs client-side @ 60fps with zero network requests</span>
        <div className="flex gap-1.5">
          {[0, 6, 12, 24, 48].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => {
                setIsPlaying(false);
                onHourChange(h);
              }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                hourOffset === h
                  ? "bg-indigo-600 text-white font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              +{h}h
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
