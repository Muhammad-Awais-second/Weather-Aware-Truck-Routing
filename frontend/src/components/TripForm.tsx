import React, { useState, useEffect } from "react";
import { searchGeocode } from "../api/client";
import type { GeocodeResult, TripPlanRequest } from "../api/types";
import { MapPin, Navigation, Calendar, Weight, Sliders, Loader2, Sparkles } from "lucide-react";

interface TripFormProps {
  onSubmit: (request: TripPlanRequest) => void;
  isLoading: boolean;
  selectedInterval: number;
  onIntervalChange: (interval: number) => void;
  activeDepartureIso?: string;
}

export const TripForm: React.FC<TripFormProps> = ({
  onSubmit,
  isLoading,
  selectedInterval,
  onIntervalChange,
}) => {
  // Origin state
  const [originQuery, setOriginQuery] = useState("Dallas, TX");
  const [originPoint, setOriginPoint] = useState<GeocodeResult>({
    lat: 32.7767,
    lon: -96.7970,
    label: "Dallas, TX",
  });
  const [originSuggestions, setOriginSuggestions] = useState<GeocodeResult[]>([]);
  const [showOriginSuggestions, setShowOriginSuggestions] = useState(false);

  // Destination state
  const [destQuery, setDestQuery] = useState("Denver, CO");
  const [destPoint, setDestPoint] = useState<GeocodeResult>({
    lat: 39.7392,
    lon: -104.9903,
    label: "Denver, CO",
  });
  const [destSuggestions, setDestSuggestions] = useState<GeocodeResult[]>([]);
  const [showDestSuggestions, setShowDestSuggestions] = useState(false);

  // Departure & load weight state
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(6, 0, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [loadWeight, setLoadWeight] = useState<number | string>(38000);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Debounced search for origin
  useEffect(() => {
    if (!showOriginSuggestions) return;
    const timer = setTimeout(async () => {
      if (originQuery.trim().length >= 2) {
        const results = await searchGeocode(originQuery);
        setOriginSuggestions(results);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [originQuery, showOriginSuggestions]);

  // Debounced search for destination
  useEffect(() => {
    if (!showDestSuggestions) return;
    const timer = setTimeout(async () => {
      if (destQuery.trim().length >= 2) {
        const results = await searchGeocode(destQuery);
        setDestSuggestions(results);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [destQuery, showDestSuggestions]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!originPoint) {
      setValidationError("Please select a valid origin address.");
      return;
    }
    if (!destPoint) {
      setValidationError("Please select a valid destination address.");
      return;
    }
    if (
      Math.abs(originPoint.lat - destPoint.lat) < 0.001 &&
      Math.abs(originPoint.lon - destPoint.lon) < 0.001
    ) {
      setValidationError("Origin and destination must be different cities.");
      return;
    }
    const weightNum = Number(loadWeight);
    if (!loadWeight || isNaN(weightNum) || weightNum < 1 || weightNum > 80000) {
      setValidationError("Load weight must be between 1 and 80,000 lb.");
      return;
    }

    const depDate = new Date(departureTime);
    onSubmit({
      origin: originPoint,
      destination: destPoint,
      departure_at: depDate.toISOString(),
      load_weight_lb: weightNum,
    });
  };

  const setPreset = (oLabel: string, oLat: number, oLon: number, dLabel: string, dLat: number, dLon: number, wt: number) => {
    setOriginQuery(oLabel);
    setOriginPoint({ label: oLabel, lat: oLat, lon: oLon });
    setDestQuery(dLabel);
    setDestPoint({ label: dLabel, lat: dLat, lon: dLon });
    setLoadWeight(wt);
    setValidationError(null);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Trip Parameters
          </h2>
          <p className="text-xs text-slate-500">Weather-risk optimized truck dispatch</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <span className="text-[11px] font-semibold text-slate-600 px-1.5 flex items-center gap-1">
            <Sliders className="w-3 h-3" /> Interval:
          </span>
          {[10, 25, 50].map((mi) => (
            <button
              key={mi}
              type="button"
              onClick={() => onIntervalChange(mi)}
              className={`px-2 py-0.5 text-xs font-semibold rounded transition-all ${selectedInterval === mi
                  ? "bg-white text-indigo-700 shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
                }`}
            >
              {mi} mi
            </button>
          ))}
        </div>
      </div>

      {/* Quick Test Presets */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-500" /> Assessment Quick Presets
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setPreset("Dallas, TX", 32.7767, -96.797, "Denver, CO", 39.7392, -104.9903, 38000)}
            className="text-xs px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 rounded-md border border-slate-200 transition-colors"
          >
            Dallas → Denver (38k lb)
          </button>
          <button
            type="button"
            onClick={() => setPreset("Chicago, IL", 41.8781, -87.6298, "Minneapolis, MN", 44.9778, -93.265, 45000)}
            className="text-xs px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 rounded-md border border-slate-200 transition-colors"
          >
            Chicago → Minneapolis
          </button>
          <button
            type="button"
            onClick={() => setPreset("Los Angeles, CA", 34.0522, -118.2437, "Phoenix, AZ", 33.4484, -112.074, 25000)}
            className="text-xs px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 text-slate-700 rounded-md border border-slate-200 transition-colors"
          >
            LA → Phoenix
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Origin Field */}
        <div className="relative">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Origin</label>
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-emerald-600" />
            <input
              type="text"
              value={originQuery}
              onChange={(e) => {
                setOriginQuery(e.target.value);
                setShowOriginSuggestions(true);
              }}
              onFocus={() => setShowOriginSuggestions(true)}
              placeholder="Enter origin city or address"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          {showOriginSuggestions && originSuggestions.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
              {originSuggestions.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setOriginQuery(item.label);
                    setOriginPoint(item);
                    setShowOriginSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-900 border-b border-slate-100 last:border-0"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destination Field */}
        <div className="relative">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Destination</label>
          <div className="relative">
            <Navigation className="absolute left-3 top-2.5 w-4 h-4 text-rose-600" />
            <input
              type="text"
              value={destQuery}
              onChange={(e) => {
                setDestQuery(e.target.value);
                setShowDestSuggestions(true);
              }}
              onFocus={() => setShowDestSuggestions(true)}
              placeholder="Enter destination city or address"
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          {showDestSuggestions && destSuggestions.length > 0 && (
            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
              {destSuggestions.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDestQuery(item.label);
                    setDestPoint(item);
                    setShowDestSuggestions(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 hover:text-indigo-900 border-b border-slate-100 last:border-0"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Departure Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Departure (Local)
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full pl-9 pr-2 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Load Weight Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Load Weight (lb)
            </label>
            <div className="relative">
              <Weight className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="number"
                min="1"
                max="80000"
                step="1"
                value={loadWeight}
                onChange={(e) => setLoadWeight(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 focus:bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {/* Quick weight selector */}
            <div className="flex gap-1 mt-1">
              {[20000, 35000, 45000].map((wt) => (
                <button
                  key={wt}
                  type="button"
                  onClick={() => setLoadWeight(wt)}
                  className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${loadWeight === wt
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200"
                    }`}
                >
                  {wt / 1000}k
                </button>
              ))}
            </div>
          </div>
        </div>

        {validationError && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
            {validationError}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 text-sm transition-all cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing Weather & Truck Routes...
            </>
          ) : (
            <>Find Safest Truck Route</>
          )}
        </button>
      </form>
    </div>
  );
};
