"""
Route metrics computation and lexicographic route ranking.
"""
from typing import Any, Dict, List, Tuple
from .risk import LEVELS


def compute_route_summary(
    base_checkpoints: List[Dict[str, Any]],
    total_distance_mi: float,
    total_duration_s: float,
    arrival_at_iso: str
) -> Dict[str, Any]:
    """
    Computes distance-weighted risk metrics using the dense base checkpoints.
    Each checkpoint owns the distance from itself to the next checkpoint.
    """
    miles_by_level = {lvl: 0.0 for lvl in LEVELS}
    weighted_risk_sum = 0.0
    max_level_idx = 0

    num_pts = len(base_checkpoints)
    for i in range(num_pts):
        cp = base_checkpoints[i]
        lvl_idx = cp.get("level_index", 0)
        max_level_idx = max(max_level_idx, lvl_idx)
        level_name = LEVELS[lvl_idx]

        if i < num_pts - 1:
            next_cp = base_checkpoints[i + 1]
            seg_dist = max(0.0, next_cp["mile"] - cp["mile"])
        else:
            # End of route
            seg_dist = 0.0

        miles_by_level[level_name] += seg_dist
        weighted_risk_sum += seg_dist * lvl_idx

    # If base checkpoints didn't cover distance or only 1 point
    dist = total_distance_mi if total_distance_mi > 0 else sum(miles_by_level.values())
    avg_risk = (weighted_risk_sum / dist) if dist > 0 else 0.0

    return {
        "distance_mi": round(dist, 1),
        "duration_s": int(total_duration_s),
        "arrival_at": arrival_at_iso,
        "miles_by_level": {k: round(v, 1) for k, v in miles_by_level.items()},
        "avg_risk": round(avg_risk, 2),
        "max_level": LEVELS[max_level_idx],
    }


def get_ranking_tuple(route: Dict[str, Any]) -> Tuple[float, float, float, float, float]:
    """
    Ranking order tuple:
    1. Fewest No Travel miles
    2. Fewest Severe miles
    3. Fewest High miles
    4. Lowest average risk (distance-weighted, 0–4)
    5. Shortest travel time (duration_s)
    """
    summary = route["summary"]
    mbl = summary["miles_by_level"]
    return (
        round(mbl.get("No Travel", 0.0), 1),
        round(mbl.get("Severe", 0.0), 1),
        round(mbl.get("High", 0.0), 1),
        round(summary.get("avg_risk", 0.0), 2),
        round(summary.get("duration_s", 0), 1),
    )


def rank_routes(routes: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], str, bool]:
    """
    Sorts routes according to 4-step + duration tie-break criteria.
    Marks recommended route and generates human-readable comparison reason.
    """
    if not routes:
        return [], "No routes available", False

    sorted_routes = sorted(routes, key=get_ranking_tuple)

    for rank_idx, r in enumerate(sorted_routes, start=1):
        r["rank"] = rank_idx

    recommended = sorted_routes[0]
    runner_up = sorted_routes[1] if len(sorted_routes) > 1 else None

    reason = "Best overall weather profile and travel time"
    if runner_up:
        r0_tup = get_ranking_tuple(recommended)
        r1_tup = get_ranking_tuple(runner_up)
        r_name = runner_up.get("name") or f"Route {runner_up.get('id', 'B')}"

        if r0_tup[0] < r1_tup[0]:
            diff = r1_tup[0] - r0_tup[0]
            reason = f"{diff:.1f} fewer No Travel miles than {r_name}"
        elif r0_tup[1] < r1_tup[1]:
            diff = r1_tup[1] - r0_tup[1]
            reason = f"{diff:.1f} fewer Severe miles than {r_name}"
        elif r0_tup[2] < r1_tup[2]:
            diff = r1_tup[2] - r0_tup[2]
            reason = f"{diff:.1f} fewer High miles than {r_name}"
        elif r0_tup[3] < r1_tup[3]:
            reason = f"Lower average risk ({r0_tup[3]:.2f} vs {r1_tup[3]:.2f}) than {r_name}"
        elif r0_tup[4] < r1_tup[4]:
            diff_mins = max(1, round((r1_tup[4] - r0_tup[4]) / 60))
            reason = f"{diff_mins} min shorter travel time than {r_name}"

    all_have_no_travel = all(
        r["summary"]["miles_by_level"].get("No Travel", 0.0) > 0.0 for r in sorted_routes
    )

    return sorted_routes, reason, all_have_no_travel

