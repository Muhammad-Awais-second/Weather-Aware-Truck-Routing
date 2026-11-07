import type { CorridorHeatmapGeoJSON, GeocodeResult, TripPlanRequest, TripPlanResponse } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export async function planTrip(req: TripPlanRequest): Promise<TripPlanResponse> {
  const res = await fetch(`${API_BASE}/api/trips/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data?.error?.message || `Planning failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return data;
}

export async function fetchHeatmap(tripId: string): Promise<CorridorHeatmapGeoJSON> {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/heatmap`);
  if (!res.ok) {
    throw new Error(`Failed to load corridor heatmap (${res.status})`);
  }
  return res.json();
}

export async function searchGeocode(query: string): Promise<GeocodeResult[]> {
  if (!query || query.trim().length < 2) return [];
  const res = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  return res.json();
}
