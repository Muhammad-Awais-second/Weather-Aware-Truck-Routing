export type RiskLevel = "Low" | "Moderate" | "High" | "Severe" | "No Travel";

export interface LocationPoint {
  lat: number;
  lon: number;
  label?: string;
}

export interface WeatherCondition {
  wind_mph: number;
  gust_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
}

export interface Checkpoint {
  mile: number;
  lat: number;
  lon: number;
  intervals: number[];
  eta: string;
  weather: WeatherCondition;
  level: RiskLevel;
  reasons: string[];
}

export interface RouteSummary {
  distance_mi: number;
  duration_s: number;
  arrival_at: string;
  miles_by_level: {
    Low: number;
    Moderate: number;
    High: number;
    Severe: number;
    "No Travel": number;
  };
  avg_risk: number;
  max_level: RiskLevel;
}

export interface RoutePlan {
  id: string;
  name: string;
  rank: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  summary: RouteSummary;
  checkpoints: Checkpoint[];
}

export interface TripPlanResponse {
  trip_id: string;
  demo_mode?: boolean;
  recommended_route_id: string;
  recommendation_reason: string;
  no_safe_route: boolean;
  routes: RoutePlan[];
}

export interface TripPlanRequest {
  origin: LocationPoint;
  destination: LocationPoint;
  departure_at: string;
  load_weight_lb: number;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

export interface CorridorHeatmapFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: Record<string, number>;
}

export interface CorridorHeatmapGeoJSON {
  type: "FeatureCollection";
  features: CorridorHeatmapFeature[];
}

