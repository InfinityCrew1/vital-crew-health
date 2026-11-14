# NASA Space Apps submission text (copy into the form)

**Project name:** Project Infinity Crew (app: VITAL, Crew Health Companion)

## Summary (under 1500 characters)
VITAL is an offline health companion for astronauts on long missions. It compares each astronaut with their own baseline across five domains (immune, musculoskeletal, cardiovascular, behavioral, metabolic) and raises early alerts, trend forecasts and suggested actions. It answers NASA's challenge by turning the hazards named by the Human Research Program (radiation, isolation, distance from Earth, gravity fields, closed environments) into one monitoring tool. It pulls live NASA space-weather data (DONKI) and converts it into radiation guidance, and includes a mission planner built on NASA limits (600 mSv career dose, 250 mSv per solar storm). Because it runs onboard with no connection, it still works through a 22-minute Mars signal delay. It matters because crews far from Earth must make early health decisions on their own. Crew readings are simulated or entered by the user; reference values and space-weather feeds are real. Decision support, not diagnosis.

## Project links
- Demo (7 slides max or 30 s video): upload to Google Drive or YouTube, sharing set to "anyone with the link".
- Project: your public GitHub repository, plus the GitHub Pages link (see README).

## Project details
**What it does:** Clickable body map (brain, lungs, heart, metabolism, muscles and bones, immune) colored by status; step-by-step how-to-measure guides; mission-environment picker (spacecraft, station, rover, Moon or Mars base); daily health mission. Check-ins (15 metrics, including blood glucose, pulse counter, reaction test), z-score alerts per domain, 30-day trends with drift forecasts, hydration, workout and medication tracking, first-response guides, mood tap and box-breathing coach, an assistant (built-in offline, or the user's own API key), a Live NASA tab, a mission planner with demo scenarios, PDF/CSV reports and JSON backup.
**How it works:** z = (last 3 days minus first 7 days) divided by the person's baseline spread. Amber at z >= 1, red at z >= 2 (adjustable). Space-weather feeds are cached and fall back to the last good copy offline.
**Benefits and impact:** Earlier detection of personal change, less reliance on delayed ground contact, crew wellbeing support. The same method fits Antarctic stations, submarines and remote clinics.
**Tools:** HTML, CSS and vanilla JavaScript (no build step), inline SVG charts, service worker (installable PWA), GitHub Pages, optional Claude API (user's own key).
**Creativity:** Storm readiness score (live space weather x personal baseline); personal baselines instead of population averages; live space weather turned into crew actions; team-balance score; one app covering all five HRP hazards.
**Factors considered:** Offline first, privacy (data stays in the browser), accessibility (keyboard use, screen-reader labels, skip link, contrast, reduced motion), honest limits (simulated data, thresholds need flight-surgeon validation).

## NASA Data (Link text / URL)
- 5 Hazards of Human Spaceflight / https://www.nasa.gov/hrp/hazards/
- Risks of Human Spaceflight / https://www.nasa.gov/hrp/risks/
- Ongoing HRP Research in Space / https://www.nasa.gov/hrp/ongoing-hrp-research/
- NASA DONKI space-weather database / https://ccmc.gsfc.nasa.gov/tools/DONKI/
- NASA Image and Video Library / https://images.nasa.gov/
- NASA Open APIs / https://api.nasa.gov/
- NASA SpaceX Crew-13 mission / https://www.nasa.gov/mission/nasas-spacex-crew-13/

## Space Agency Partner & Other Data
- CSA: Monitoring Radiation for Astronaut Health / https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp
- CSA: Why Do We Conduct Science Experiments in Space? / https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp
- NOAA Space Weather Prediction Center (storm scales) / https://www.swpc.noaa.gov/
- Where the ISS at? (ISS position) / https://wheretheiss.at/
- Anthropic API (optional, user's own key) / https://docs.claude.com

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

## 7-slide demo outline
1. Title and team · 2. Problem (hazards, 22-minute delay) · 3. Solution (personal baseline) · 4. Live demo screenshots (Summary, CO₂ scenario alert) · 5. NASA data used (DONKI, HRP, CSA) · 6. Impact and beyond space · 7. Limits and next steps.

## 2-minute live demo
Summary alerts → Mission tab "CO₂ build-up" → Live NASA advisory → Assistant "Should I escalate?" → Resources tab → Reports PDF.

## Use of Super Intelligence (SI) — answer for the form (not shown to judges)
Yes. Claude (Anthropic) was used as a coding assistant to write and refactor parts of the HTML, CSS and JavaScript and to draft documentation. The team chose the idea, the challenge, the NASA data sources and the health thresholds, and reviewed and tested the result. No AI-generated images, video or audio are used. Code files carry an SI acknowledgement in their header comments and in a `<meta name="ai-assistance">` tag. *(Edit this so it matches what your team actually did.)*

## Rules check (NASA Space Apps 2026 Project Submission Guide)
- [x] No NASA logos, flags or mission identifiers in the app or in generated content; NASA is credited as a data source in text only.
- [x] Image KSC-98pc481 is blocked from the live NASA Image Library feed, and the feed also filters logo/insignia images and anything mentioning children, students or other minors.
- [x] No images, video or audio of anyone under 18 (the app has no photos of people; only the filtered NASA feed shows images).
- [x] At least one NASA dataset used (DONKI, HRP, NASA Image and Video Library).
- [x] Space Agency Partner resource listed (CSA, a 2026 partner).
- [x] English only in the app, README and this text.
- [ ] Demo: 30 s video or 7 slides, hosted publicly (Drive/YouTube/GitHub), link tested in a private window. Must include team name, member names and the challenge.
- [ ] Final project link (GitHub Pages) opens with no login; consider a FortiGuard Web Filter Classification for the new site (Category: web-based application or education; Company: N/A).
- [ ] All team members confirmed at the same Local Event.
- [ ] Tick both checkboxes, then press **Submit for Judging** before Sunday 15 Nov, 11:59 p.m. local time.

## What the 2025 Global Winners did (and how VITAL borrows it)
- **SpaceGenes+ (Best Use of Science):** showed that radiation plus microgravity together cause effects neither causes alone. VITAL's **Storm readiness** card combines live radiation risk with the crew member's own stressed domains.
- **PureFlow (Best Mission Concept):** tested designs against real-time solar threats and put crew safety first. VITAL turns live DONKI/NOAA data into a shelter-or-continue action.
- **Twisters / SkySense (Best Use of Technology):** turned complex data into one clear probability-style answer. VITAL gives one 0–100 readiness score with a plain-language note.
- **HerCode Space (Best Use of Storytelling):** lead with a human story. Open the demo with one astronaut and a 22-minute signal delay.

## Challenge objectives check ("Health assessment tool for astronauts")
| Objective | Where in VITAL |
|---|---|
| Visual tool for self-assessment | Summary rings, color-coded status, **Body map** (tap a body part) |
| Health indicators: blood pressure, heart rate, blood sugar, temperature, sleep, mood | Log tab: all six, plus SpO2, respiration, reaction time, pain, stress, fatigue, exercise, radiation (15 metrics) |
| Any input method | Typed values, pulse counter, reaction test, mood tap |
| Guidance on treatments and improvements | Suggested action per domain, Body map "What to do", Care tab first-response guides (incl. high/low blood sugar) |
| Five NASA hazards | Hazards tab, each tied to body regions and measurements |
| Which measurements, why, how hazards affect them, when to call | **How to measure** tab: how, why it matters in space, normal range, hazard, call-the-flight-surgeon rule |
| Different environments | Environment picker: spacecraft, station, rover, Moon/Mars base, with risks and routine |
| Prompts to measure; gamification | Daily health mission (ring + due list), streaks and badges |
| Dynamic charts, color coding | 30-day trend charts with baseline band and forecast; green/amber/red everywhere |
| Simple explanations for non-experts | Plain-language text in How to measure and Body map |

Not built (optional in the brief): camera or ultrasound image input.
