import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  LngLatBounds,
  type GeoJSONSource,
} from "maplibre-gl";
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
  "https://tiles.openfreemap.org/styles/liberty";

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
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Active route ID fallback
  const activeRouteId = selectedRouteId || (routes.length > 0 ? routes[0].id : "");

  // Fit bounds to selected route
  const fitRouteBounds = useCallback(
    (targetRouteId: string) => {
      const map = mapRef.current;
      if (!map || routes.length === 0) return;

      const activeRoute = routes.find((r) => r.id === targetRouteId) || routes[0];
      if (!activeRoute?.geometry?.coordinates?.length) return;

      const bounds = new LngLatBounds();
      activeRoute.geometry.coordinates.forEach((coord) => {
        const lon = Number(coord[0]);
        const lat = Number(coord[1]);
        if (!isNaN(lon) && !isNaN(lat)) {
          bounds.extend([lon, lat]);
        }
      });

      if (!bounds.isEmpty()) {
        try {
          map.fitBounds(bounds, {
            padding: { top: 60, bottom: 120, left: 60, right: 60 },
            maxZoom: 12,
            duration: 1000,
          });
        } catch (err) {
          console.warn("fitBounds error:", err);
        }
      }
    },
    [routes]
  );

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: DEFAULT_STYLE,
      center: [-98.5795, 39.8283],
      zoom: 4,
      attributionControl: false,
    });

    map.addControl(new NavigationControl({ showCompass: true }), "top-right");

    map.on("load", () => {
      setMapLoaded(true);
      map.resize();
    });

    map.on("error", (e) => {
      // Non-fatal tile or font warnings
      if (e?.error?.message?.includes?.("layer") || e?.error?.message?.includes?.("source")) {
        console.error("MapLibre layer/source error:", e.error);
      }
    });

    mapRef.current = map;

    // ResizeObserver ensures canvas updates if container dimensions change
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, []);

  // Update or render routes and checkpoints whenever routes or mapLoaded change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded() || routes.length === 0) return;

    // 1. Prepare GeoJSON FeatureCollection for routes (strictly [lon, lat])
    const routeFeatures = routes.map((r) => ({
      type: "Feature" as const,
      properties: {
        id: r.id,
        name: r.name,
        isSelected: r.id === activeRouteId,
        rank: r.rank,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: r.geometry.coordinates.map((coord) => [
          Number(coord[0]),
          Number(coord[1]),
        ]),
      },
    }));

    const routeGeoJSON = {
      type: "FeatureCollection" as const,
      features: routeFeatures,
    };

    // 2. Prepare GeoJSON FeatureCollection for checkpoints (strictly [lon, lat])
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
            reasons: JSON.stringify(cp.reasons || []),
          },
          geometry: {
            type: "Point",
            coordinates: [Number(cp.lon), Number(cp.lat)],
          },
        });
      });
    });

    const checkpointGeoJSON = {
      type: "FeatureCollection" as const,
      features: checkpointFeatures,
    };

    // Add or update routes source and layer
    const existingRouteSource = map.getSource("routes-source") as GeoJSONSource | undefined;
    if (existingRouteSource) {
      existingRouteSource.setData(routeGeoJSON);
    } else {
      map.addSource("routes-source", {
        type: "geojson",
        data: routeGeoJSON,
      });
    }

    if (!map.getLayer("routes-line")) {
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
            ["==", ["get", "id"], activeRouteId],
            "#4f46e5",
            "#94a3b8",
          ],
          "line-width": [
            "case",
            ["==", ["get", "id"], activeRouteId],
            6,
            3.5,
          ],
          "line-opacity": [
            "case",
            ["==", ["get", "id"], activeRouteId],
            1.0,
            0.4,
          ],
        },
      });

      // Click on route to select
      map.on("click", "routes-line", (e) => {
        if (e.features && e.features[0] && onSelectRoute) {
          const clickedId = e.features[0].properties?.id;
          if (clickedId) onSelectRoute(clickedId);
        }
      });
    }

    // Add or update checkpoints source and layer
    const existingCpSource = map.getSource("checkpoints-source") as GeoJSONSource | undefined;
    if (existingCpSource) {
      existingCpSource.setData(checkpointGeoJSON);
    } else {
      map.addSource("checkpoints-source", {
        type: "geojson",
        data: checkpointGeoJSON,
      });
    }

    if (!map.getLayer("checkpoints-layer")) {
      map.addLayer({
        id: "checkpoints-layer",
        type: "circle",
        source: "checkpoints-source",
        filter: ["in", selectedInterval, ["get", "intervals"]],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": [
            "case",
            ["==", ["get", "routeId"], activeRouteId],
            6.5,
            4,
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": [
            "case",
            ["==", ["get", "routeId"], activeRouteId],
            1.0,
            0.35,
          ],
        },
      });

      // Checkpoint click popup
      map.on("click", "checkpoints-layer", (e) => {
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
              ${reasons.length > 0
            ? `<div style="padding: 6px 8px; background: #fef2f2; border-left: 3px solid #ef4444; color: #991b1b; font-size: 11px; border-radius: 2px;">
                      ${reasons.join("<br/>")}
                    </div>`
            : ""
          }
            </div>
          </div>
        `;

        const popup = new Popup({ closeButton: true, closeOnClick: true, offset: 12 })
          .setLngLat(geom.coordinates)
          .setHTML(popupHtml)
          .addTo(map);

        popupRef.current = popup;
      });

      map.on("mouseenter", "checkpoints-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "checkpoints-layer", () => {
        map.getCanvas().style.cursor = "";
      });
    }

    // Always zoom/fit bounds to the selected route when new plan data arrives
    fitRouteBounds(activeRouteId);
  }, [routes, mapLoaded, fitRouteBounds]);

  // When selectedRouteId changes, update styles and zoom to the active route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded()) return;

    if (map.getLayer("routes-line")) {
      map.setPaintProperty("routes-line", "line-color", [
        "case",
        ["==", ["get", "id"], activeRouteId],
        "#4f46e5",
        "#94a3b8",
      ]);
      map.setPaintProperty("routes-line", "line-width", [
        "case",
        ["==", ["get", "id"], activeRouteId],
        6,
        3.5,
      ]);
      map.setPaintProperty("routes-line", "line-opacity", [
        "case",
        ["==", ["get", "id"], activeRouteId],
        1.0,
        0.4,
      ]);
    }

    if (map.getLayer("checkpoints-layer")) {
      map.setPaintProperty("checkpoints-layer", "circle-opacity", [
        "case",
        ["==", ["get", "routeId"], activeRouteId],
        1.0,
        0.35,
      ]);
      map.setPaintProperty("checkpoints-layer", "circle-radius", [
        "case",
        ["==", ["get", "routeId"], activeRouteId],
        6.5,
        4,
      ]);
    }

    // Zoom and pan smoothly to the newly selected route
    fitRouteBounds(activeRouteId);
  }, [activeRouteId, mapLoaded, fitRouteBounds]);

  // Filter checkpoints by interval (10, 25, 50 mi) instantly without network request
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded() || !map.getLayer("checkpoints-layer")) return;

    map.setFilter("checkpoints-layer", [
      "in",
      selectedInterval,
      ["get", "intervals"],
    ]);
  }, [selectedInterval, mapLoaded]);

  // Corridor Heatmap Layer handling
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded() || !heatmapData) return;

    const existingHeatmapSource = map.getSource("corridor-heatmap-source") as GeoJSONSource | undefined;
    if (existingHeatmapSource) {
      existingHeatmapSource.setData(heatmapData);
    } else {
      map.addSource("corridor-heatmap-source", {
        type: "geojson",
        data: heatmapData,
      });
    }

    if (!map.getLayer("corridor-heatmap")) {
      // Safe insertion: only pass beforeId if routes-line exists
      const beforeId = map.getLayer("routes-line") ? "routes-line" : undefined;
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
              9, 2.5,
            ],
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0, "rgba(34, 197, 94, 0)",
              0.2, RISK_COLORS["Low"],
              0.4, RISK_COLORS["Moderate"],
              0.65, RISK_COLORS["High"],
              0.85, RISK_COLORS["Severe"],
              1.0, RISK_COLORS["No Travel"],
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0, 15,
              7, 35,
              12, 60,
            ],
            "heatmap-opacity": 0.85,
          },
        },
        beforeId
      );
    }
  }, [heatmapData, mapLoaded, hourOffset]);

  // Toggle Heatmap visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded() || !map.getLayer("corridor-heatmap")) return;

    map.setLayoutProperty(
      "corridor-heatmap",
      "visibility",
      showHeatmap ? "visible" : "none"
    );
  }, [showHeatmap, mapLoaded]);

  // Scrub Heatmap at 60fps via paint property update
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !map.isStyleLoaded() || !map.getLayer("corridor-heatmap")) return;

    requestAnimationFrame(() => {
      if (map.getLayer("corridor-heatmap")) {
        map.setPaintProperty("corridor-heatmap", "heatmap-weight", ["get", `r${hourOffset}`]);
      }
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
