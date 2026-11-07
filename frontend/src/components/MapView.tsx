import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { CorridorHeatmapGeoJSON, RoutePlan } from "../api/types";
import { RISK_COLORS } from "../lib/riskColors";
import { formatDateTime } from "../lib/format";
import { Compass } from "lucide-react";

interface MapViewProps {
  routes: RoutePlan[];
  selectedRouteId: string;
  selectedInterval: number;
  heatmapData?: CorridorHeatmapGeoJSON;
  showHeatmap: boolean;
  hourOffset: number;
  onSelectRoute?: (routeId: string) => void;
}

const DEFAULT_STYLE =
  import.meta.env.VITE_MAP_STYLE_URL ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export const MapView: React.FC<MapViewProps> = ({
  routes,
  selectedRouteId,
  selectedInterval,
  heatmapData,
  showHeatmap,
  hourOffset,
  onSelectRoute,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: DEFAULT_STYLE,
      center: [-98.5795, 39.8283], // Geographic center of US
      zoom: 4,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Set up or update Route and Checkpoint sources/layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || routes.length === 0) return;

    // 1. Prepare GeoJSON FeatureCollections for routes
    const routeFeatures = routes.map((r) => ({
      type: "Feature" as const,
      properties: {
        id: r.id,
        name: r.name,
        isSelected: r.id === selectedRouteId,
        rank: r.rank,
      },
      geometry: r.geometry,
    }));

    const routeGeoJSON = {
      type: "FeatureCollection" as const,
      features: routeFeatures,
    };

    // 2. Prepare GeoJSON for checkpoints
    const checkpointFeatures: any[] = [];
    routes.forEach((r) => {
      r.checkpoints.forEach((cp) => {
        checkpointFeatures.push({
          type: "Feature",
          properties: {
            routeId: r.id,
            mile: cp.mile,
            eta: cp.eta,
            wind: cp.weather.wind_mph,
            gust: cp.weather.gust_mph,
            rain: cp.weather.rain_in_hr,
            snow: cp.weather.snow_in_hr,
            level: cp.level,
            color: RISK_COLORS[cp.level],
            intervals: cp.intervals,
            reasons: JSON.stringify(cp.reasons),
          },
          geometry: {
            type: "Point",
            coordinates: [cp.lon, cp.lat],
          },
        });
      });
    });

    const checkpointGeoJSON = {
      type: "FeatureCollection" as const,
      features: checkpointFeatures,
    };

    // Add or update 'routes-source'
    const routeSource = map.getSource("routes-source") as maplibregl.GeoJSONSource;
    if (routeSource) {
      routeSource.setData(routeGeoJSON);
    } else {
      map.addSource("routes-source", {
        type: "geojson",
        data: routeGeoJSON,
      });

      // Route line layer
      map.addLayer({
        id: "routes-line",
        type: "line",
        source: "routes-source",
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "id"], selectedRouteId],
            "#4f46e5", // Indigo for active
            "#94a3b8", // Muted slate for inactive
          ],
          "line-width": [
            "case",
            ["==", ["get", "id"], selectedRouteId],
            6,
            3.5,
          ],
          "line-opacity": [
            "case",
            ["==", ["get", "id"], selectedRouteId],
            1.0,
            0.4, // Inactive routes fade to 40% opacity per PRD
          ],
        },
      });

      // Click to select route from map
      map.on("click", "routes-line", (e: any) => {
        if (e.features && e.features[0] && onSelectRoute) {
          const clickedId = e.features[0].properties?.id;
          if (clickedId) onSelectRoute(clickedId);
        }
      });
    }

    // Add or update 'checkpoints-source'
    const cpSource = map.getSource("checkpoints-source") as maplibregl.GeoJSONSource;
    if (cpSource) {
      cpSource.setData(checkpointGeoJSON);
    } else {
      map.addSource("checkpoints-source", {
        type: "geojson",
        data: checkpointGeoJSON,
      });

      // Checkpoint circles layer
      map.addLayer({
        id: "checkpoints-layer",
        type: "circle",
        source: "checkpoints-source",
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": [
            "case",
            ["==", ["get", "routeId"], selectedRouteId],
            6.5,
            4,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": [
            "case",
            ["==", ["get", "routeId"], selectedRouteId],
            1.0,
            0.35,
          ],
        },
      });

      // Checkpoint click popup
      map.on("click", "checkpoints-layer", (e: any) => {
        if (!e.features || !e.features[0]) return;
        const feat = e.features[0];
        const geom = feat.geometry as any;
        const props = feat.properties as any;
        const reasons = props.reasons ? JSON.parse(props.reasons) : [];

        if (popupRef.current) popupRef.current.remove();

        const popupHtml = `
          <div style="font-family: inherit; font-size: 12px; width: 220px; line-height: 1.4;">
            <div style="padding: 10px 12px; background: ${props.color}; color: white; display: flex; justify-content: space-between; align-items: center;">
              <strong>Mile ${props.mile}</strong>
              <span style="background: rgba(255,255,255,0.25); padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 11px;">
                ${props.level}
              </span>
            </div>
            <div style="padding: 12px; background: white; color: #1e293b;">
              <div style="margin-bottom: 8px; color: #64748b; font-size: 11px;">
                <strong>ETA:</strong> ${formatDateTime(props.eta)}
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
                <div><span style="color:#64748b;">Wind:</span> <strong>${props.wind} mph</strong></div>
                <div><span style="color:#64748b;">Gust:</span> <strong>${props.gust} mph</strong></div>
                <div><span style="color:#64748b;">Rain:</span> <strong>${props.rain} in/h</strong></div>
                <div><span style="color:#64748b;">Snow:</span> <strong>${props.snow} in/h</strong></div>
              </div>
              ${
                reasons.length > 0
                  ? `<div style="padding: 6px 8px; background: #fef2f2; border-left: 3px solid #ef4444; color: #991b1b; font-size: 11px; border-radius: 2px;">
                      ${reasons.join("<br/>")}
                    </div>`
                  : ""
              }
            </div>
          </div>
        `;

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12 })
          .setLngLat(geom.coordinates)
          .setHTML(popupHtml)
          .addTo(map);

        popupRef.current = popup;
      });

      // Pointer cursor on checkpoint hover
      map.on("mouseenter", "checkpoints-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "checkpoints-layer", () => {
        map.getCanvas().style.cursor = "";
      });
    }

    // Fit map bounds to encompass the routes
    const bounds = new maplibregl.LngLatBounds();
    routes.forEach((r) => {
      r.geometry.coordinates.forEach((coord) => {
        bounds.extend(coord as [number, number]);
      });
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 800 });
    }
  }, [routes, mapLoaded]);

  // Update selected route styling on the fly (instant, 0 fetch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer("routes-line")) return;

    map.setPaintProperty("routes-line", "line-color", [
      "case",
      ["==", ["get", "id"], selectedRouteId],
      "#4f46e5",
      "#94a3b8",
    ]);

    map.setPaintProperty("routes-line", "line-width", [
      "case",
      ["==", ["get", "id"], selectedRouteId],
      6,
      3.5,
    ]);

    map.setPaintProperty("routes-line", "line-opacity", [
      "case",
      ["==", ["get", "id"], selectedRouteId],
      1.0,
      0.4,
    ]);

    if (map.getLayer("checkpoints-layer")) {
      map.setPaintProperty("checkpoints-layer", "circle-opacity", [
        "case",
        ["==", ["get", "routeId"], selectedRouteId],
        1.0,
        0.35,
      ]);
      map.setPaintProperty("checkpoints-layer", "circle-radius", [
        "case",
        ["==", ["get", "routeId"], selectedRouteId],
        6.5,
        4,
      ]);
    }
  }, [selectedRouteId, mapLoaded]);

  // Update checkpoint interval filter on the fly (instant, 0 fetch)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer("checkpoints-layer")) return;

    // Filter checkpoints where cp.intervals contains selectedInterval
    map.setFilter("checkpoints-layer", [
      "in",
      selectedInterval,
      ["get", "intervals"],
    ]);
  }, [selectedInterval, mapLoaded]);

  // Corridor Heatmap Layer handling
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !heatmapData) return;

    const heatmapSource = map.getSource("corridor-heatmap-source") as maplibregl.GeoJSONSource;
    if (heatmapSource) {
      heatmapSource.setData(heatmapData);
    } else {
      map.addSource("corridor-heatmap-source", {
        type: "geojson",
        data: heatmapData,
      });

      // Insert heatmap layer underneath route lines
      map.addLayer(
        {
          id: "corridor-heatmap",
          type: "heatmap",
          source: "corridor-heatmap-source",
          maxzoom: 13,
          paint: {
            "heatmap-weight": ["get", `r${hourOffset}`],
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0, 0.8,
              9, 2.5
            ],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(34, 197, 94, 0)",
              0.2, "rgba(34, 197, 94, 0.5)",
              0.4, "rgba(234, 179, 8, 0.65)",
              0.65, "rgba(249, 115, 22, 0.8)",
              0.85, "rgba(239, 68, 68, 0.9)",
              1.0, "rgba(88, 28, 135, 0.95)"
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0, 15,
              7, 35,
              12, 60
            ],
            "heatmap-opacity": 0.85,
          },
        },
        "routes-line"
      );
    }
  }, [heatmapData, mapLoaded]);

  // Update Heatmap Visibility on the fly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer("corridor-heatmap")) return;

    map.setLayoutProperty(
      "corridor-heatmap",
      "visibility",
      showHeatmap ? "visible" : "none"
    );
  }, [showHeatmap, mapLoaded]);

  // Scrub Heatmap Weight at 60fps on hour change (Zero network calls, instant paint property update)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.getLayer("corridor-heatmap")) return;

    requestAnimationFrame(() => {
      map.setPaintProperty("corridor-heatmap", "heatmap-weight", ["get", `r${hourOffset}`]);
    });
  }, [hourOffset, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainerRef} className="w-full h-full rounded-xl overflow-hidden shadow-inner" />

      {/* Map Legend */}
      <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-md rounded-xl p-3 shadow-md border border-slate-200 z-10 pointer-events-auto">
        <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-indigo-600" />
          Risk Levels
        </div>
        <div className="space-y-1 text-xs">
          {[
            { label: "Low", color: RISK_COLORS["Low"], desc: "<25 mph / clear" },
            { label: "Moderate", color: RISK_COLORS["Moderate"], desc: "25-34 mph / light" },
            { label: "High", color: RISK_COLORS["High"], desc: "35-44 mph / heavy" },
            { label: "Severe", color: RISK_COLORS["Severe"], desc: "45-54 mph / storm" },
            { label: "No Travel", color: RISK_COLORS["No Travel"], desc: "≥55 mph / extreme" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-semibold text-slate-800 w-16">{item.label}</span>
              <span className="text-[10px] text-slate-400">{item.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
