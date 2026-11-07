# Weather-Aware Truck Routing — PRD & TRD

Nov 7, 2026 · @muhammad Awais

## Overview

A React + Django web app that returns 3 truck routes, scores each for weather risk at the truck's arrival time at every checkpoint, and recommends the safest one. Built for the Spotter Full Stack Developer assessment: 4 days, 16 work hours maximum.

**User:** a truck driver or dispatcher planning one trip with a known load.

**Out of scope:** building a routing engine, user accounts, saved trips, mobile app, live re-routing during the trip.

**Success criteria, mapped to Spotter's scoring:**

| Weight | Area | What "done" looks like |
| --- | --- | --- |
| 40% | Routes, weather, risk, recommendation | 3 routes every time; ETA-correct weather per checkpoint; risk rules applied exactly, boundaries unit-tested; ranking follows the 4-step order |
| 40% | UI, map, heatmap | Map loads under 3 s after results; slider scrubs 0–48 h at 60 fps with no network calls; click any checkpoint for details |
| 15% | Code quality | Thin views, a services layer, typed contracts, pytest coverage on risk and ranking |
| 5% | Docs and walkthrough | README with setup, assumptions, API docs; 5–10 min Loom |

The brief says to prioritize correctness and clarity over extra features, so every stretch goal in this doc is optional.

## PRD — Product requirements

### Inputs

| Field | Type | Validation |
| --- | --- | --- |
| Origin | Address with autocomplete, stored as lat/lon + label | Required; must geocode |
| Destination | Same as origin | Required; differs from origin |
| Departure | Date + time in the user's local timezone | Now or later; within 7 days (forecast quality) |
| Load weight | Number, lb | 1 – 80,000 lb (US legal gross limit) |
| Checkpoint interval | Toggle: 10 / 25 / 50 mi | Default 25; switching is instant, no re-fetch |

### Functional requirements

1. **FR1 Routes:** fetch exactly 3 route options from a truck-aware routing API, using load weight and departure time.
2. **FR2 Checkpoints:** place a checkpoint every 10, 25 or 50 miles along each route, plus the origin and destination.
3. **FR3 ETA weather:** for each checkpoint, compute the truck's ETA and read the hourly forecast for that hour at that location.
4. **FR4 Risk:** classify each checkpoint with the weather thresholds and load rules below.
5. **FR5 Recommendation:** rank the 3 routes with the 4-step preference order and mark one as recommended, with a plain-language reason.
6. **FR6 Map:** show all routes, checkpoints coloured by risk, ETAs and a summary card per route.
7. **FR7 Heatmap:** show weather risk across the trip corridor with a 0–48 hour slider.

### Weather thresholds (per checkpoint)

| Condition | Low (0) | Moderate (1) | High (2) | Severe (3) | No Travel (4) |
| --- | --- | --- | --- | --- | --- |
| Wind (mph) | < 25 | 25 – 34 | 35 – 44 | 45 – 54 | ≥ 55 |
| Rain (in/hr) | < 0.10 | 0.10 – < 0.25 | 0.25 – < 0.50 | 0.50 – 1.00 | > 1.00 |
| Snow (in/hr) | < 0.5 | 0.5 – < 1.0 | 1.0 – < 2.0 | 2.0 – 3.0 | > 3.0 |

The brief's ranges overlap at the edges (0.25 sits in both Moderate and High). This app treats each lower bound as inclusive; state this in the README.

Checkpoint level = the highest of the wind, rain and snow levels, then raised by the load rules.

### Load rules

- Wind ≥ 55 mph → No Travel for any load.
- Wind 45–54 mph and load > 30,000 lb → No Travel.
- Wind 35–44 mph and load > 40,000 lb → Severe.

Load rules only raise a level, never lower it. Each raised checkpoint records why ("Wind 47 mph + 34,000 lb load").

### Recommendation

Routes are compared in this order; the first difference decides:

1. Fewest No Travel miles (added: a route through No Travel weather should never win)
2. Fewest Severe miles
3. Fewest High miles
4. Lowest average risk (distance-weighted, 0–4)
5. Shortest travel time

If every route has No Travel miles, the app still ranks them but shows a banner: "No safe route at this departure — try a later time."

### UI requirements

- Form panel on the left (top on mobile); map fills the rest.
- One card per route: distance, drive time, arrival time, Severe / High miles, average risk, worst level; recommended card badged and listed first.
- Clicking a card highlights its route; the other two fade to 40% opacity.
- Checkpoints are dots coloured by level; tap one for mile marker, ETA, wind, gust, rain, snow, level and reason.
- Heatmap toggle plus a 0–48 h slider labelled with the absolute local time ("+12 h · Sat 4:00 PM").
- Loading, empty and error states for every API call.

### Acceptance criteria

- [ ] Any US origin and destination returns 3 routes in under 8 s (cold cache).
- [ ] Changing departure time by 6 h changes checkpoint forecasts.
- [ ] A 45 mph wind checkpoint is Severe at 20,000 lb and No Travel at 35,000 lb.
- [ ] Interval toggle and heatmap slider make zero network requests.
- [ ] Ranking unit tests cover every tie-break step.

## TRD — Technical design

The Django backend does all routing, weather and risk work in one `POST /api/trips/plan` call and caches it; the React app only draws. That keeps the logic testable in Python and keeps the map fast.

### Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | React 18 + Vite + TypeScript | Fast build, typed API contract |
| Map | MapLibre GL JS via `react-map-gl` | WebGL; native heatmap layer; free |
| Base tiles | MapTiler free tier or OpenFreeMap | No Google billing |
| UI | Tailwind CSS + shadcn/ui | Clean cards, slider, toggle in minutes |
| Data fetching | TanStack Query | Caching, loading and error states |
| Backend | Django 5 + Django REST Framework | Required by the brief |
| HTTP client | `httpx` (async) | Parallel weather calls |
| Cache | Django cache: Redis (Upstash) in prod, LocMem locally | Weather and route reuse |
| Tests | pytest + pytest-django; Vitest for frontend utils | Risk rules must be provable |

### Third-party APIs

| Purpose | API | Key details |
| --- | --- | --- |
| Routing | [TomTom Calculate Route](https://docs.tomtom.com/routing-api/documentation/routing/calculate-route/) | `travelMode=truck`, `vehicleWeight` in kg, `departAt`, `maxAlternatives=2` (3 routes total), `traffic=true`, `instructionsType=coded` for time-at-offset data |
| Geocoding | TomTom Search / Geocoding | Same key; proxied through Django to hide it |
| Weather | [Open-Meteo Forecast](https://open-meteo.com/en/docs/ecmwf-api) | No key; comma-separated coordinates in one call; `wind_speed_unit=mph`, `precipitation_unit=inch`; hourly `wind_speed_10m`, `wind_gusts_10m`, `rain`, `showers`, `snowfall` |

Convert load weight from lb to kg for TomTom (× 0.4536). Open-Meteo splits rain into `rain` and `showers`; rain rate = rain + showers. Snowfall arrives in inches when `precipitation_unit=inch`.

If TomTom returns fewer than 3 routes, build the missing ones by re-requesting with a via-point offset 10–20 miles perpendicular to the main route's midpoint. Drop any result that overlaps the main route by more than 90%.

### Architecture

Request flow: React form → `POST /api/trips/plan` → Django geocodes (if needed) → TomTom returns 3 routes → sampler builds checkpoints → weather service fetches forecasts in batches → risk engine scores → ranker orders → JSON back to React → MapLibre draws routes, dots and heatmap.

&#91;embedded content: system architecture · 1 API call, 5 steps, 3 services\]

Step 4 holds the brief's risk rules; everything outside the Django box is either display or a third-party data source.

### Backend modules

| Module | Responsibility |
| --- | --- |
| `routing/clients/tomtom.py` | Route + geocode calls, response → `Route` dataclass |
| `routing/clients/openmeteo.py` | Batched hourly forecast, cached per grid cell |
| `routing/services/sampler.py` | Polyline walking, checkpoints, ETA |
| `routing/services/risk.py` | Thresholds, load rules, reasons |
| `routing/services/ranker.py` | Route metrics + lexicographic ranking |
| `routing/services/corridor.py` | Heatmap grid around the routes |
| `routing/services/planner.py` | Orchestrates the above for one request |
| `routing/views.py` | Thin DRF views, validation only |

### Algorithms

**1. Checkpoint sampling.** Decode each route to `[lat, lon]` points. Walk the line, summing haversine distance. Drop a checkpoint every 5 miles (the common divisor of 10, 25 and 50). Tag each checkpoint with the intervals it belongs to (mile 50 → 10, 25 and 50). The frontend filters by tag, so the toggle never re-fetches.

**2. ETA per checkpoint.** TomTom instructions give `routeOffsetInMeters` and `travelTimeInSeconds`. Build a piecewise-linear map from distance to elapsed time and read it at each checkpoint's distance. ETA = departure (UTC) + elapsed. This respects slow city segments and fast highway ones; plain distance ÷ average speed does not.

**3. Weather lookup.** Round each checkpoint to a 0.1° grid cell (about 7 miles) and dedupe. Fetch hourly data for unique cells in batches of 50 coordinates. Read the forecast hour that contains the ETA; interpolate linearly between the two nearest hours for wind. Cache each cell's 7-day hourly series for 30 minutes.

**4. Risk scoring.**

```python
LEVELS = ["Low", "Moderate", "High", "Severe", "No Travel"]

def wind_level(mph):
    if mph < 25: return 0
    if mph < 35: return 1
    if mph < 45: return 2
    if mph < 55: return 3
    return 4

def rain_level(inch_hr):
    if inch_hr < 0.10: return 0
    if inch_hr < 0.25: return 1
    if inch_hr < 0.50: return 2
    if inch_hr <= 1.00: return 3
    return 4

def snow_level(inch_hr):
    if inch_hr < 0.5: return 0
    if inch_hr < 1.0: return 1
    if inch_hr < 2.0: return 2
    if inch_hr <= 3.0: return 3
    return 4

def checkpoint_level(wind, rain, snow, load_lb):
    level = max(wind_level(wind), rain_level(rain), snow_level(snow))
    if 45 <= wind < 55 and load_lb > 30_000:
        level = max(level, 4)
    elif 35 <= wind < 45 and load_lb > 40_000:
        level = max(level, 3)
    return level
```

Use sustained wind (`wind_speed_10m`) for the rules and show gusts in the popup. Say so in the README; it is an assumption the brief leaves open.

**5. Route metrics.** Each checkpoint owns the miles from itself to the next checkpoint, using the 5-mile base set so all intervals give the same totals. Per route: miles at each level, distance-weighted average risk, worst level, total drive time and arrival time.

**6. Ranking.** Sort by the tuple `(no_travel_mi, severe_mi, high_mi, round(avg_risk, 2), duration_s)`. First route = recommended. Reason text names the first tuple field that separated it from the runner-up ("12 fewer Severe miles than Route B").

**7. Corridor heatmap.** For each route, place grid points every 10 miles along it and at 10 and 20 miles to each side (5 points per row). Dedupe on the 0.1° grid. For each point, store 49 risk scores `r0…r48`, one per forecast hour from departure. Return one GeoJSON FeatureCollection. The slider changes only the MapLibre paint property `heatmap-weight` to `['get', 'r' + hour]`; no fetch, no React re-render of the map.

### API contract

`POST /api/trips/plan`

```json
{
  "origin": {"lat": 32.7767, "lon": -96.7970, "label": "Dallas, TX"},
  "destination": {"lat": 39.7392, "lon": -104.9903, "label": "Denver, CO"},
  "departure_at": "2026-11-08T06:00:00-06:00",
  "load_weight_lb": 38000
}
```

Response (trimmed):

```json
{
  "trip_id": "9f2c…",
  "recommended_route_id": "r1",
  "recommendation_reason": "12 fewer Severe miles than Route B",
  "no_safe_route": false,
  "routes": [{
    "id": "r1", "rank": 1,
    "geometry": {"type": "LineString", "coordinates": [[-96.79, 32.77]]},
    "summary": {
      "distance_mi": 794.2, "duration_s": 45120,
      "arrival_at": "2026-11-08T18:32:00Z",
      "miles_by_level": {"Low": 610, "Moderate": 140, "High": 44.2, "Severe": 0, "No Travel": 0},
      "avg_risk": 0.31, "max_level": "High"
    },
    "checkpoints": [{
      "mile": 25, "lat": 33.1, "lon": -97.0, "intervals": [25],
      "eta": "2026-11-08T12:24:00Z",
      "weather": {"wind_mph": 18, "gust_mph": 29, "rain_in_hr": 0.02, "snow_in_hr": 0},
      "level": "Low", "reasons": []
    }]
  }]
}
```

`GET /api/trips/{trip_id}/heatmap` → GeoJSON points with `r0…r48`, loaded after the routes so the first paint is fast.

`GET /api/geocode?q=dallas` → up to 5 suggestions, debounced 300 ms on the client.

Errors return `{"error": {"code": "ROUTING_UNAVAILABLE", "message": "…"}}` with 400, 422 or 502.

### Data storage

No database tables are required. A `trip_id` keys the full plan in the cache for 1 hour, so the heatmap call reuses it. Optional: a `TripPlan` model for history, only if time is left.

### Frontend structure

- `TripForm` — inputs, validation with zod.
- `RouteCards` — summary per route, recommended first.
- `MapView` — one MapLibre instance held in a ref; layers: `routes` (line), `checkpoints` (circle, coloured by level, filtered by interval), `heatmap` (heatmap).
- `ForecastSlider` — 0–48, updates the paint property inside `requestAnimationFrame`.
- `useTripPlan` — TanStack Query hook for the plan and heatmap calls.

### Performance targets

- Plan API under 8 s cold, under 1 s cached; weather batches run in parallel with `asyncio.gather`.
- Simplify route geometry to about 1 point per 200 m before sending (Douglas-Peucker) to keep payloads under 500 KB.
- Map sources are set once per response; hover and slider changes use paint properties or feature-state.
- Lazy-load the heatmap after routes render.

### Risk colours

Low green, Moderate yellow, High orange, Severe red, No Travel dark purple. Use the same scale on dots, cards and heatmap.

## Project structure and deployment

One GitHub monorepo, two deploys: the React app on Vercel and the Django API on Render.

```
truck-weather-routing/
├── backend/
│   ├── config/              # settings.py, urls.py, wsgi.py
│   ├── routing/
│   │   ├── clients/         # tomtom.py, openmeteo.py
│   │   ├── services/        # sampler, risk, ranker, corridor, planner
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── tests/           # test_risk.py, test_ranker.py, test_sampler.py
│   ├── requirements.txt
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── api/             # client.ts, types.ts
│   │   ├── components/      # TripForm, RouteCards, MapView, ForecastSlider
│   │   ├── hooks/           # useTripPlan.ts
│   │   └── lib/             # riskColors.ts, format.ts
│   └── package.json
├── docs/screenshots/
└── README.md
```

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `TOMTOM_API_KEY` | Backend | Routing + geocoding |
| `REDIS_URL` | Backend | Cache (falls back to LocMem if empty) |
| `DJANGO_SECRET_KEY` | Backend | Django |
| `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | Backend | Lock API to the Vercel domain |
| `VITE_API_BASE_URL` | Frontend | Backend URL |
| `VITE_MAP_STYLE_URL` | Frontend | MapTiler / OpenFreeMap style |

The TomTom key stays on the backend only. The map-tile key is public by design; restrict it to your Vercel domain in the MapTiler dashboard.

### Deployment

1. Backend on Render web service: `gunicorn config.wsgi`, Python 3.12, `django-cors-headers`, `whitenoise`.
2. Redis on Upstash free tier; paste `REDIS_URL` into Render.
3. Frontend on Vercel: root `frontend/`, build `npm run build`, output `dist`.
4. Render's free tier sleeps after inactivity, so the first request can take about a minute. Use a paid starter instance for the review week, or ping `/api/health` every 10 minutes with a cron service. Mention this in the README so the reviewer is not surprised.
5. Smoke test the hosted link from a phone and a desktop before submitting.

## Build plan, testing and walkthrough

The plan spends 9 of 16 hours on logic and map, matching the 80% of the score they carry, and keeps 2 hours of buffer.

### 16-hour plan over 4 days

| Day | Hours | Work | Done when |
| --- | --- | --- | --- |
| 1 | 4 | Repo, Django + Vite scaffold, TomTom key; geocode + 3-route call; sampler with 5-mile base and ETA map | Raw routes and checkpoints print for Dallas → Denver |
| 2 | 4 | Open-Meteo batching + cache; risk engine; metrics; ranker; pytest for every boundary and tie-break | `/api/trips/plan` returns the full contract; tests green |
| 3 | 5 | Form, route cards, MapLibre routes + checkpoints + popups; corridor endpoint; heatmap layer + slider | Slider scrubs smoothly with zero fetches |
| 4 | 3 | Deploy both apps; README; loading and error states; record Loom | Hosted link works on phone and desktop |
| — | 2 | Buffer for API surprises or polish | — |

### Testing plan

- **Risk boundaries:** wind 24.9 / 25 / 34.9 / 35 / 44.9 / 45 / 54.9 / 55; same pattern for rain and snow.
- **Load rules:** 45 mph at 30,000 vs 30,001 lb; 35 mph at 40,000 vs 40,001 lb; 55 mph at 1,000 lb.
- **Ranker:** five fixtures where each tuple field alone decides the winner; one fixture where all routes have No Travel miles.
- **Sampler:** a straight 100-mile line gives checkpoints at miles 0, 10, 20… for interval 10 and at 0, 50, 100 for interval 50.
- **ETA:** a mocked instruction list with a slow first segment yields later ETAs than distance ÷ average speed.
- **Clients:** TomTom and Open-Meteo calls mocked with `respx`; no real network in tests.
- **Manual:** 3 real trips (Dallas → Denver, Chicago → Minneapolis in winter, Los Angeles → Phoenix).

### README checklist

- [ ] One-line summary and hosted link at the top, plus a screenshot or GIF
- [ ] Local setup in under 5 commands for each app
- [ ] Environment variables table
- [ ] Risk and ranking rules as implemented, with the assumptions: inclusive lower bounds, sustained wind, rain + showers, No Travel ranked first, slider hours counted from departure
- [ ] API endpoints with example request and response
- [ ] Trade-offs and what you would do next (live traffic re-plan, truck restrictions, hourly re-scoring)
- [ ] How to run tests

### Loom script (7–8 minutes)

1. **0:00 Intro (30 s):** who you are, what the app does in one sentence.
2. **0:30 Live demo (2.5 min):** enter Dallas → Denver, 38,000 lb, tomorrow 6 AM; show 3 routes, the recommended badge and its reason; click a checkpoint; toggle 10 / 25 / 50; scrub the heatmap slider.
3. **3:00 Load rule demo (1 min):** change weight to 20,000 lb and show a Severe checkpoint drop or a recommendation change.
4. **4:00 Code tour (2 min):** `planner.py` flow, `risk.py` rules, `ranker.py` tuple, the slider's paint-property trick.
5. **6:00 Tests (30 s):** run pytest on screen.
6. **6:30 Trade-offs and next steps (1 min):** assumptions, API limits, what you would add with more time.

Keep the camera bubble on; speak to decisions, not to every line of code.
