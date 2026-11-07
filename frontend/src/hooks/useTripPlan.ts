import { useMutation, useQuery } from "@tanstack/react-query";
import { planTrip, fetchHeatmap } from "../api/client";
import type { TripPlanRequest, TripPlanResponse, CorridorHeatmapGeoJSON } from "../api/types";

export function useTripPlan() {
  const mutation = useMutation<TripPlanResponse, Error, TripPlanRequest>({
    mutationFn: planTrip,
  });

  const tripId = mutation.data?.trip_id;

  const heatmapQuery = useQuery<CorridorHeatmapGeoJSON, Error>({
    queryKey: ["heatmap", tripId],
    queryFn: () => fetchHeatmap(tripId!),
    enabled: Boolean(tripId),
    staleTime: 1000 * 60 * 30, // 30 mins
  });

  return {
    planMutation: mutation,
    planData: mutation.data,
    isLoading: mutation.isPending,
    error: mutation.error,
    heatmapData: heatmapQuery.data,
    isHeatmapLoading: heatmapQuery.isLoading,
  };
}
