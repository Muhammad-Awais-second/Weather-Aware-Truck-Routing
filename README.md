# Weather-Aware Truck Routing — Spotter Assessment

> **A React + Django web app that returns 3 truck routes, scores each for weather risk at the truck's arrival time at every checkpoint, and recommends the safest one.**

---

## 🚀 Quick Start (Local Setup in Under 5 Commands)

### Backend (Django 5 + DRF)
```bash
cd backend
python -m venv venv && source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python manage.py runserver 8000
```
*API is live at `http://127.0.0.1:8000/api/` (Zero-config ready: works immediately with TomTom API or built-in fallback router).*

### Frontend (React 18/19 + Vite + MapLibre GL)
```bash
cd frontend
npm install
npm run dev
```
*App is live at `http://localhost:5173/`.*

---

## 🧪 Running Automated Tests

The test suite validates every boundary condition, vehicle load rule, 4-step lexicographic tie-break, ETA piecewise interpolation, and API contract with mocked networks (`respx`).

```bash
cd backend
pytest
```
**Test Results (19/19 passing):**
- `test_wind_boundaries`: 24.9 / 25 / 34.9 / 35 / 44.9 / 45 / 54.9 / 55 mph
- `test_rain_boundaries`: 0.09 / 0.10 / 0.24 / 0.25 / 0.49 / 0.50 / 1.00 / 1.01 in/hr
- `test_snow_boundaries`: 0.49 / 0.50 / 0.99 / 1.00 / 1.99 / 2.00 / 3.00 / 3.01 in/hr
- `test_load_rule_45mph`: 45 mph @ 30,000 lb (Severe) vs 30,001 lb (No Travel)
- `test_load_rule_35mph`: 35 mph @ 40,000 lb (High) vs 40,001 lb (Severe)
- `test_load_rule_55mph_any_load`: 55 mph @ 1,000 lb (No Travel)
- `test_load_rules_never_lower_level`: Level cannot be downgraded by load rules
- `test_step1_no_travel_miles_decides`: Step 1 tie-breaker
- `test_step2_severe_miles_decides`: Step 2 tie-breaker
- `test_step3_high_miles_decides`: Step 3 tie-breaker
- `test_step4_avg_risk_decides`: Step 4 tie-breaker
- `test_step5_duration_decides`: Step 5 tie-breaker
- `test_all_routes_have_no_travel`: `no_safe_route` warning banner trigger
- `test_straight_line_sampling`: 100-mile straight line interval tagging (10, 25, 50 mi)
- `test_piecewise_eta_interpolation_slow_first_segment`: Accurate piecewise ETA vs average speed
- `test_health_check_endpoint`: `/api/health`
- `test_geocode_endpoint`: `/api/geocode`
- `test_plan_trip_validation_same_origin_dest`: 400 validation error
- `test_plan_trip_and_heatmap_flow`: Complete trip planning + heatmap GeoJSON flow

---

## ⚙️ Environment Variables

| Variable | Location | Default / Fallback | Purpose |
| --- | --- | --- | --- |
| `TOMTOM_API_KEY` | Backend | Built-in fallback router | TomTom Calculate Route & Geocoding |
| `REDIS_URL` | Backend | `LocMemCache` | Production Redis cache for forecasts & trips |
| `DJANGO_SECRET_KEY` | Backend | Development secret | Django security key |
| `ALLOWED_HOSTS` | Backend | `*` | Comma-separated allowed hostnames |
| `CORS_ALLOWED_ORIGINS`| Backend | All origins permitted | CORS frontend origins |
| `VITE_API_BASE_URL` | Frontend | `""` (proxies to backend) | Backend API host URL |
| `VITE_MAP_STYLE_URL` | Frontend | CARTO Positron / OpenFreeMap | MapLibre vector style URL |

---

## 📐 Implemented Risk Rules & Technical Assumptions

### 1. Inclusive Lower Bounds
The specification note regarding overlapping ranges is resolved by treating lower bounds as inclusive:
- **Wind (mph):** Low (<25), Moderate [25, 35), High [35, 45), Severe [45, 55), No Travel (≥55)
- **Rain (in/hr):** Low (<0.10), Moderate [0.10, 0.25), High [0.25, 0.50), Severe [0.50, 1.00], No Travel (>1.00)
- **Snow (in/hr):** Low (<0.5), Moderate [0.5, 1.0), High [1.0, 2.0), Severe [2.0, 3.0], No Travel (>3.0)

### 2. Vehicle Load Rules
Load rules only escalate a risk level, never de-escalate:
- Wind ≥ 55 mph → **No Travel** for any load.
- Wind 45–54 mph and load > 30,000 lb → **No Travel** (records reason: *"Wind 48.0 mph + 35,000 lb load: raised to No Travel"*).
- Wind 35–44 mph and load > 40,000 lb → **Severe** (records reason: *"Wind 39.0 mph + 42,000 lb load: raised to Severe"*).

### 3. Sustained Wind vs Gusts
- Sustained 10m wind (`wind_speed_10m`) is evaluated against the risk thresholds and load rules.
- Peak wind gusts (`wind_gusts_10m`) are captured and displayed in the interactive checkpoint popup card.

### 4. Rain Rate Aggregation
- Open-Meteo splits rain into large-scale `rain` and convective `showers`. Total rain rate is `rain + showers` (in/hr).

### 5. Lexicographic 4-Step Recommendation Ordering
Routes are ordered ascending by the tuple:
```python
(no_travel_mi, severe_mi, high_mi, round(avg_risk, 2), duration_s)
```
1. Route with the fewest **No Travel** miles wins.
2. If tied, route with the fewest **Severe** miles wins.
3. If tied, route with the fewest **High** miles wins.
4. If tied, route with lowest distance-weighted **average risk** (0.00–4.00) wins.
5. If tied, shortest **duration** (seconds) wins.
- If all 3 routes contain No Travel miles, the app flags `"no_safe_route": true` and shows a warning banner: *"No safe route at this departure — try a later time."*

### 6. Zero-Fetch 60 FPS Heatmap Scrubbing
- The corridor heatmap returns a GeoJSON FeatureCollection where each point contains pre-computed risk attributes `r0...r48` (0 to 48 hours relative to departure).
- Scrubbing the slider dynamically adjusts MapLibre's `heatmap-weight` paint property (`['get', 'r' + hour]`) inside `requestAnimationFrame`. Zero network requests and zero map re-initializations occur during scrubbing.

---

## 🔌 API Endpoints

### 1. `POST /api/trips/plan`
Generates 3 truck routes, samples checkpoints at 5-mile base increments, scores ETA-specific weather risk, and ranks routes.

**Request:**
```json
{
  "origin": {"lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX"},
  "destination": {"lat": 39.7392, "lon": -104.9903, "label": "Denver, CO"},
  "departure_at": "2026-11-08T06:00:00Z",
  "load_weight_lb": 38000
}
```

**Response (Trimmed):**
```json
{
  "trip_id": "f8a29b4e71d34c11",
  "recommended_route_id": "r1",
  "recommendation_reason": "14.2 fewer Severe miles than Route B",
  "no_safe_route": false,
  "routes": [
    {
      "id": "r1",
      "name": "Interstate Primary",
      "rank": 1,
      "geometry": {
        "type": "LineString",
        "coordinates": [[-96.797, 32.7767], ...]
      },
      "summary": {
        "distance_mi": 794.2,
        "duration_s": 45120,
        "arrival_at": "2026-11-08T18:32:00Z",
        "miles_by_level": {
          "Low": 610.0,
          "Moderate": 140.0,
          "High": 44.2,
          "Severe": 0.0,
          "No Travel": 0.0
        },
        "avg_risk": 0.31,
        "max_level": "High"
      },
      "checkpoints": [
        {
          "mile": 25.0,
          "lat": 33.1042,
          "lon": -97.0215,
          "intervals": [25],
          "eta": "2026-11-08T06:26:00Z",
          "weather": {
            "wind_mph": 18.2,
            "gust_mph": 27.5,
            "rain_in_hr": 0.02,
            "snow_in_hr": 0.0
          },
          "level": "Low",
          "reasons": []
        }
      ]
    }
  ]
}
```

### 2. `GET /api/trips/{trip_id}/heatmap`
Returns GeoJSON points within a 20-mile buffer of the routes with `r0...r48` multi-hour risk scores for 60fps scrubbing.

### 3. `GET /api/geocode?q=dallas`
Returns up to 5 matching US cities with coordinates.

### 4. `GET /api/health`
Health check endpoint (`{"status": "ok", "service": "truck-weather-routing"}`).

---

## ⚖️ Architecture & Trade-Offs

- **Server-Side Scoring vs Client-Side Rendering:** All routing, geometry slicing, weather batching, and risk classification execute on Django. The React client only handles WebGL map rendering and UI interactions.
- **5-Mile Base Sampling:** Slicing the route into 5-mile base checkpoints ensures that metrics (distance-weighted average risk and miles by level) remain mathematically identical regardless of whether the user views 10, 25, or 50-mile markers.
- **Multi-Location Weather Batching:** Open-Meteo allows comma-separated coordinate queries. Grid coordinates are rounded to 0.1° (~7 miles) and queried in batches of up to 50 locations, cutting network roundtrips from hundreds to 1–2 requests.
- **Next Steps with More Time:**
  - *Dynamic Rest Stop Injection:* Automatically compute mandatory DOT 30-minute breaks every 8 hours and overnight 10-hour sleeper berth periods, adjusting downstream checkpoint ETAs accordingly.
  - *Truck Restrictions (HazMat / Clearance):* Incorporate height, gross bridge formula limits, and HazMat tunnel restrictions into the routing profile.
  - *Live In-Transit Re-Routing:* Push notifications or webhooks when sudden storm fronts develop along an active trip corridor.
