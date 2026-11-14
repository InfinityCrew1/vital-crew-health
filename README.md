# VITAL — Crew Health Companion

NASA Space Apps Challenge entry: a health monitoring app for long-duration missions. It compares each astronaut with **their own baseline** across five domains (immune, musculoskeletal, cardiovascular, behavioral, metabolic), works **offline**, and pulls **live NASA space-weather data** that it turns into radiation guidance for the crew.

## Features
- Personal-baseline z-score alerts, domain scores, trend charts, drift forecasts
- Check-ins (vitals, symptoms), pulse counter, reaction test, hydration / workouts / medication tracking
- Assistant picker: **built-in offline assistant (default, no key)** or **your own Anthropic API key** (stored only in the browser)
- Mood quick-tap, box-breathing coach, expandable detail cards
- Mission planner (radiation dose, bone loss, sleep debt, comms delay) and demo scenarios
- Printable PDF reports, CSV export, JSON backup/restore
- **Live NASA tab**: solar flares, energetic-particle events and geomagnetic storms (NASA DONKI), NOAA storm scales, ISS position with South Atlantic Anomaly flag, NASA Image Library feed, and an advisory that says what the crew should do. A summary banner shows the same status on the home screen.
- **Body map**: tap the brain, lungs, heart, gut, muscles/bones or immune system for status, space risks, actions and when to call a flight surgeon
- **How to measure** guides for 12 indicators (how, why, normal range, escalation), **blood glucose** tracking, a mission-environment picker and a daily health mission
- **Storm readiness** score that combines live space weather with the crew member's own stressed domains
- Installable PWA; live feeds are cached and fall back to the last good copy when offline

## NASA and CSA resources
See the **Resources** tab in the app and `SUBMISSION.md` for the full list (NASA HRP Hazards, Risks and Ongoing Research; CSA radiation monitoring and science in space).

## Accessibility
Skip link, keyboard-operable controls, labelled charts and dialogs (Esc closes), live-region notices, high-contrast text and reduced-motion support.

## Run locally
No build step. Serve the folder (service workers need http):
```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Publish on GitHub Pages
1. Create a repo and push this folder to `main`.
2. Repo **Settings → Pages → Source: GitHub Actions**. The included workflow deploys on every push.

## Data sources
| Feed | Used for | Key |
|---|---|---|
| NASA DONKI (`api.nasa.gov`) | Flares, SEP events, geomagnetic storms | `DEMO_KEY` by default (rate-limited); add your free key in the Live tab |
| NASA Image and Video Library | Astronaut-health imagery | none |
| NOAA SWPC | Current radiation / geomagnetic / radio scales | none |
| wheretheiss.at | ISS position | none |
| NASA Human Research Program, NASA-STD-3001, Twins Study | Reference values in the NASA tab | bundled |

NASA does not publish individual astronauts' medical data. Crew readings in this app are **simulated or entered by you**; the reference values and space-weather feeds are real.

## Files
`index.html` shell · `health.js` body map, measurement guides, environments · `app.js` health engine and views · `nasa.js` live data layer · `styles.css` · `sw.js` + `manifest.webmanifest` PWA · `.github/workflows/pages.yml` deploy

## Disclaimer
Decision support, not diagnosis. Thresholds need flight-surgeon validation before any real use.

MIT licensed.

## AI assistance and NASA media rules
VITAL was designed and built by the team; AI tools (Claude) were used to assist with coding. No AI-generated images, video or audio are used. The NASA Image Library feed hides image `KSC-98pc481`, logo/insignia images and images that mention children or students (see `BLOCKED_NASA_IDS` and `BLOCKED_WORDS` in `nasa.js`).

## Welcome-screen Earth photo
Drop a photo named `earth.jpg` next to `index.html` (for example NASA's public-domain "Blue Marble", ideally 1600 px wide or more, under 500 KB) and it becomes the background of the welcome screen. Without it, the app draws its own rotating globe. Credit NASA in the README if you use one, and avoid images that contain NASA logos.
