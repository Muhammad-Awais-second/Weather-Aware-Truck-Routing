import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTripPlan } from "./hooks/useTripPlan";
import { TripForm } from "./components/TripForm";
import { RouteCards } from "./components/RouteCards";
import { MapView } from "./components/MapView";
import { ForecastSlider } from "./components/ForecastSlider";
import type { TripPlanRequest } from "./api/types";
import { Truck, CloudLightning, Shield, Layers, Info, CheckCircle2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppContent() {
  const {
    planMutation,
    planData,
    isLoading,
    error,
    heatmapData,
  } = useTripPlan();

  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [selectedInterval, setSelectedInterval] = useState<number>(25);
  const [hourOffset, setHourOffset] = useState<number>(0);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [activeDepartureIso, setActiveDepartureIso] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(6, 0, 0, 0);
    return d.toISOString();
  });

  // Auto-select recommended route on response
  useEffect(() => {
    if (planData && planData.recommended_route_id) {
      setSelectedRouteId(planData.recommended_route_id);
    }
  }, [planData]);

  // Initial plan load on mount for Dallas -> Denver
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(6, 0, 0, 0);

    const initialReq: TripPlanRequest = {
      origin: { lat: 32.7767, lon: -96.7970, label: "Dallas, TX" },
      destination: { lat: 39.7392, lon: -104.9903, label: "Denver, CO" },
      departure_at: tomorrow.toISOString(),
      load_weight_lb: 38000,
    };
    setActiveDepartureIso(initialReq.departure_at);
    planMutation.mutate(initialReq);
  }, []);

  const handlePlanSubmit = (req: TripPlanRequest) => {
    setActiveDepartureIso(req.departure_at);
    setHourOffset(0);
    planMutation.mutate(req);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden font-sans">
      {/* Top Navbar */}
      <header className="h-14 bg-slate-900 text-white px-5 flex items-center justify-between shadow-md shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-inner">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">Weather-Aware Truck Routing</h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Spotter Assessment
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Multi-Route Risk Evaluation & Safety Recommendation System
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300">
            <CloudLightning className="w-4 h-4 text-amber-400" />
            <span>Open-Meteo Hourly</span>
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="flex items-center gap-1.5 text-slate-300">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Load Risk Engine</span>
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="flex items-center gap-1.5 text-slate-300">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>MapLibre GL</span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Side Panel */}
        <aside className="w-full md:w-[440px] lg:w-[460px] h-full overflow-y-auto bg-slate-50 border-r border-slate-200 p-4 space-y-4 shrink-0 shadow-lg z-10">
          <TripForm
            onSubmit={handlePlanSubmit}
            isLoading={isLoading}
            selectedInterval={selectedInterval}
            onIntervalChange={setSelectedInterval}
            activeDepartureIso={activeDepartureIso}
          />

          {/* Loading State Banner */}
          {isLoading && (
            <div className="p-4 bg-white rounded-xl border border-indigo-100 shadow-sm space-y-2 animate-pulse">
              <div className="flex items-center gap-2 text-indigo-700 text-xs font-bold uppercase tracking-wider">
                <div className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                Calculating Weather-Risk Matrix
              </div>
              <div className="space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Generating 3 alternative truck highway corridors
                </div>
                <div className="flex items-center gap-1.5 text-slate-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Sampling 5-mile checkpoints & computing offset ETAs
                </div>
                <div className="flex items-center gap-1.5 text-indigo-600 font-medium">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  Querying batched Open-Meteo forecasts & applying load rules...
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-900">
                Trip Planning Error
              </div>
              <p>{error.message}</p>
            </div>
          )}

          {/* Route Comparison Cards */}
          {planData && !isLoading && (
            <RouteCards
              planData={planData}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
            />
          )}

          {/* Info Card */}
          <div className="p-3.5 bg-slate-200/50 rounded-xl border border-slate-200 text-slate-600 text-xs space-y-1.5">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Info className="w-3.5 h-3.5 text-indigo-600" />
              Evaluation Specification Highlights
            </div>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600 leading-relaxed">
              <li><strong>3 Truck Routes:</strong> Evaluated with vehicle load weight & ETA-specific weather.</li>
              <li><strong>Zero-Fetch Scrubbing:</strong> Heatmap slider and interval toggle operate instantly client-side.</li>
              <li><strong>4-Step Lexicographic Ranking:</strong> No Travel miles → Severe miles → High miles → Average risk → Duration.</li>
            </ul>
          </div>
        </aside>

        {/* Right Map Canvas */}
        <main className="flex-1 h-full relative overflow-hidden bg-slate-200">
          <MapView
            routes={planData?.routes || []}
            selectedRouteId={selectedRouteId}
            selectedInterval={selectedInterval}
            heatmapData={heatmapData}
            showHeatmap={showHeatmap}
            hourOffset={hourOffset}
            onSelectRoute={setSelectedRouteId}
          />

          {/* Floating Bottom Forecast Scrubbing Slider */}
          <div className="absolute bottom-5 left-4 right-4 md:left-8 md:right-8 z-10 max-w-2xl mx-auto">
            <ForecastSlider
              departureIso={activeDepartureIso}
              hourOffset={hourOffset}
              onHourChange={setHourOffset}
              showHeatmap={showHeatmap}
              onToggleHeatmap={setShowHeatmap}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
