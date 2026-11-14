/* Designed and built by the VITAL team. AI tools (Claude) were used to assist with coding, as disclosed under NASA Space Apps rules. */
/* ==========================================================
   VITAL — crew health companion (core logic)
   Sections: 1 Config  2 Data  3 Analysis  4 Drawing helpers
             5 Views   6 NASA missions  7 Navigation
   ========================================================== */

/* ---------- 1. Config ---------- */
const DAYS = 30;                // length of simulated history
const BASELINE_DAYS = 7;        // first days = personal baseline

// Each metric: [label, unit, direction]. direction 1 = higher is worse, -1 = lower is worse
const METRICS = {
  rhr:  ['Resting heart rate', 'bpm', 1],
  hrv:  ['HRV', 'ms', -1],
  slp:  ['Sleep', 'h', -1],
  temp: ['Skin temp', '°C', 1],
  mood: ['Mood', '/5', -1],
  fat:  ['Fatigue', '/5', 1],
  pain: ['Pain', '/10', 1],
  rt:   ['Reaction time', 'ms', 1],
  str:  ['Stress', '/5', 1],
  spo2: ['Blood oxygen', '%', -1],
  bp:   ['Blood pressure', 'mmHg', 1],
  resp: ['Respiration', 'br/min', 1],
  glu:  ['Blood glucose', 'mg/dL', 1],
  ex:   ['Exercise', 'min', -1],
  rad:  ['Radiation', 'mSv/d', 1],
};

// Which metrics feed each health domain
const DOMAINS = {
  Immune:          ['rhr', 'temp', 'slp', 'resp'],
  Musculoskeletal: ['ex', 'pain'],
  Cardiovascular:  ['hrv', 'rhr', 'bp', 'spo2'],
  Behavioral:      ['slp', 'mood', 'rt', 'fat', 'str'],
  Metabolic:       ['glu'],
};
const DOMAIN_COLORS = { Immune: '#ff375f', Musculoskeletal: '#ff9f0a', Cardiovascular: '#0a84ff', Behavioral: '#bf5af2', Metabolic: '#34c759' };

// Suggested action per domain: [amber, red]
const ACTIONS = {
  Immune:          ['Rest, hydrate, recheck temperature tonight.', 'Run illness self-check and consider escalation.'],
  Musculoskeletal: ['Add a resistance session; review load.', 'Guided self-exam; escalate if pain persists.'],
  Cardiovascular:  ['Ease intensity, hydrate, repeat orthostatic check.', 'Run cardio self-check; escalate to flight surgeon.'],
  Behavioral:      ['Journal for 5 min; call family.', 'Request a private session with crew psychologist.'],
  Metabolic:       ['Eat a balanced meal on time, hydrate, recheck fasting glucose tomorrow.', 'Repeat glucose, log meals and symptoms, and contact the flight surgeon.'],
};

// Healthy pre-flight baseline and natural day-to-day noise (standard deviation)
const BASE  = { rhr: 58, hrv: 62, slp: 7.2, temp: 33.4, mood: 4, fat: 2, pain: 1, rt: 260, ex: 75, rad: .55, str: 2, spo2: 97.5, bp: 114, resp: 14, glu: 88 };
const NOISE = { rhr: 1.8, hrv: 4, slp: .4, temp: .15, mood: .5, fat: .5, pain: .6, rt: 10, ex: 8, rad: .05, str: .5, spo2: .5, bp: 4, resp: 1, glu: 5 };

// Optional demo crew (only loaded if you press "Load demo crew"). "drift" = how much each metric changes per day after day 7
const DEMO_CREW = {
  'Amara Rahman': { role: 'Commander',       seed: 11, color: '#5e5ce6', drift: {} },
  'Mila Kovač':   { role: 'Flight Engineer', seed: 22, color: '#ff375f', drift: { slp: -.09, mood: -.04, rt: 3, fat: .04, str: .05 } },
  'Tobi Okafor':  { role: 'Medical Officer', seed: 33, color: '#30b0c7', drift: { rhr: .35, temp: .015, ex: -1.2, slp: -.03, resp: .06 } },
  'Li Chen':      { role: 'Pilot',           seed: 44, color: '#ff9f0a', drift: { pain: .12, ex: -1, hrv: -.5, bp: .25 } },
};

// The real crew starts empty: nobody is added automatically
const CREW = {};

/* ---------- 2. Data ---------- */
// Seeded random number generator so each crew member gets the same history every load
const makeRng = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// Build 30 days of simulated readings for one crew member
function generateHistory(name) {
  const rng = makeRng(CREW[name].seed);
  const out = {};

  for (const key in BASE) {
    out[key] = [];
    for (let day = 0; day < DAYS; day++) {
      const drift = day >= BASELINE_DAYS ? (CREW[name].drift[key] || 0) * (day - BASELINE_DAYS) : 0;
      const noise = (rng() + rng() + rng() - 1.5) * NOISE[key] * 1.6;
      let value = (CREW[name].base || BASE)[key] + drift + noise;

      // Keep values inside realistic limits
      if (['mood', 'fat', 'str'].includes(key)) value = Math.min(5, Math.max(1, value));
      if (key === 'pain') value = Math.max(0, value);
      if (key === 'spo2') value = Math.min(100, value);

      out[key].push(+value.toFixed(2));
    }
  }
  return out;
}

/* ---------- 3. Analysis ---------- */
const data = {};                     // name -> history
let current = '';                    // selected crew member
let view = 'sum';                    // selected tab
let metric = 'rhr';                  // metric shown in Trends
let threshold = 1;                   // alert sensitivity (z-score)
let themeMode = 'auto';              // auto | light | dark

// Saved profiles and check-in logs live in the browser (see section 8)
let logs = {};   // name -> list of logged check-ins
loadSaved();
for (const name in CREW) data[name] = generateHistory(name);
applyLogs();

const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const sd = arr => { const m = mean(arr); return Math.sqrt(mean(arr.map(x => (x - m) ** 2))); };

// z-score: how far the last 3 days sit from the personal baseline
function zScore(key, history) {
  const baseline = history[key].slice(0, BASELINE_DAYS);
  const spread = Math.max(sd(baseline), NOISE[key] * .6);
  return (mean(history[key].slice(-3)) - mean(baseline)) / spread;
}

// Score every domain and the overall status for one crew member
function analyse(name) {
  const history = data[name];
  const domains = {};

  for (const domain in DOMAINS) {
    const items = DOMAINS[domain].map(key => {
      const z = zScore(key, history);
      return { key, z, bad: Math.max(0, z * METRICS[key][2]) };  // only the "worse" direction counts
    });
    const severity = mean(items.map(i => i.bad));
    domains[domain] = {
      items,
      status: severity >= 2 * threshold ? 'red' : severity >= threshold ? 'amber' : 'green',
      score: Math.max(5, Math.round(100 - severity * 28)),
    };
  }

  const statuses = Object.values(domains).map(d => d.status);
  return {
    domains,
    score: Math.round(mean(Object.values(domains).map(d => d.score))),
    status: statuses.includes('red') ? 'red' : statuses.includes('amber') ? 'amber' : 'green',
  };
}

/* ---------- 4. Drawing helpers (inline SVG) ---------- */
const statusColor = s => `var(--${s === 'green' ? 'g' : s === 'amber' ? 'a' : 'r'})`;
const byId = id => document.getElementById(id);

// Circular progress ring with a centered label
function ring(percent, color, size = 64, width = 9, label = '') {
  const r = (size - width) / 2, c = 2 * Math.PI * r, mid = size / 2;
  return `<svg width="${size}" height="${size}" role="img" aria-label="${label !== '' ? 'Score ' + label : 'Progress'}">
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-opacity=".2" stroke-width="${width}"/>
    <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"
            stroke-dasharray="${c * percent / 100} ${c}" transform="rotate(-90 ${mid} ${mid})"/>
    <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" fill="currentColor"
          font-size="${size / 3.4}" font-weight="700">${label}</text>
  </svg>`;
}

// Tiny line chart used in lists
function sparkline(values, color, w = 90, h = 26) {
  const min = Math.min(...values), range = Math.max(...values) - min || 1;
  const points = values.map((v, i) =>
    `${(i / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / range * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" role="img" aria-label="Trend line"><polyline fill="none" stroke="${color}" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" points="${points}"/></svg>`;
}

// Full trend chart with the personal baseline band (±1σ)
function trendChart(key, history) {
  const values = history[key], W = 640, H = 240, P = 30;
  const base = mean(values.slice(0, BASELINE_DAYS));
  const spread = Math.max(sd(values.slice(0, BASELINE_DAYS)), NOISE[key] * .6);
  const min = Math.min(...values, base - 2 * spread), max = Math.max(...values, base + 2 * spread);
  const y = v => H - P - (v - min) / (max - min) * (H - 2 * P);
  const x = i => P + i / (DAYS - 1) * (W - 2 * P);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${METRICS[key][0]} over 30 days: now ${values[DAYS - 1]} ${METRICS[key][1]}, baseline ${base.toFixed(1)}">
    <rect x="${P}" y="${y(base + spread)}" width="${W - 2 * P}" height="${y(base - spread) - y(base + spread)}" fill="var(--acc)" opacity=".12"/>
    <line x1="${P}" x2="${W - P}" y1="${y(base)}" y2="${y(base)}" stroke="var(--acc)" stroke-dasharray="4 4"/>
    <polyline fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round"
              points="${values.map((v, i) => x(i) + ',' + y(v)).join(' ')}"/>
    <circle cx="${x(DAYS - 1)}" cy="${y(values[DAYS - 1])}" r="5" fill="var(--acc)"/>
    <text x="${P}" y="${H - 8}" fill="var(--mute)" font-size="11">Day 1</text>
    <text x="${W - P}" y="${H - 8}" text-anchor="end" fill="var(--mute)" font-size="11">Day 30</text>
    <text x="${P}" y="14" fill="var(--mute)" font-size="11">Shaded band = personal baseline ±1σ</text>
  </svg>`;
}

/* ---------- 5. Views ---------- */
function summaryView(name) {
  const a = analyse(name);
  const flagged = Object.entries(a.domains).filter(([, d]) => d.status !== 'green');
  const verdict = { green: 'Ready', amber: 'Watch closely', red: 'Action needed' }[a.status];
  const drivers = d => d.items.filter(i => i.bad >= threshold * .6);

  // Hero score
  let html = `<h1>Hi, ${name.split(' ')[0]}</h1>
    <div class="card hero">
      ${ring(a.score, '#fff', 92, 11, a.score)}
      <div><div class="big" style="font-size:24px">${verdict}</div>
        <div class="mute">${name} · ${CREW[name].role}<br>Overall health score vs own baseline</div></div>
    </div>
    <div class="qa">
      <button onclick="view='log';render()"><span>✎</span>Log</button>
      <button onclick="view='tr';render()"><span>↗</span>Trends</button>
      <button onclick="view='care';render()"><span>✚</span>Care</button>
      <button onclick="view='ai';render()"><span>✦</span>Ask AI</button>
      <button onclick="breatheSheet()"><span>🫁</span>Breathe</button>
    </div>
    <div id="live-strip">${liveStrip()}</div>
    ${dailyMission(name)}
    ${moodCard()}
    ${insightCard(name)}
    <h2>Health domains</h2><div class="grid">`;

  // One card per domain
  for (const domain in a.domains) {
    const d = a.domains[domain];
    const why = d.status === 'green' ? 'Within baseline.'
      : drivers(d).map(i => METRICS[i.key][0] + (i.z > 0 ? ' ↑' : ' ↓')).join(', ');
    html += `<div class="card"><div class="ring">${ring(d.score, DOMAIN_COLORS[domain])}
      <div><b>${domain}</b><br><span class="pill ${d.status}">${d.status}</span></div></div>
      <div class="mute" style="margin-top:8px">${why}</div>
      ${moreBtn('Details ▾')}<div class="xp" hidden>${d.items.map(i => `<div class="li"><span>${METRICS[i.key][0]}</span><span style="display:flex;gap:8px;align-items:center">${sparkline(data[name][i.key], statusColor(i.bad >= 2 * threshold ? 'red' : i.bad >= threshold ? 'amber' : 'green'), 64, 22)}<b>${i.z > 0 ? '+' : ''}${i.z.toFixed(1)}σ</b></span></div>`).join('')}</div></div>`;
  }

  // Alerts
  html += `</div><h2>Alerts &amp; actions</h2><div class="card">` + (flagged.length
    ? flagged.map(([domain, d]) => `<div class="li"><div>
        <span class="pill ${d.status}">${d.status}</span> <b>${domain}</b>
        <div class="mute">${drivers(d).map(i => `${METRICS[i.key][0]} ${i.z > 0 ? '+' : ''}${i.z.toFixed(1)}σ`).join(' · ')}
        <br>${ACTIONS[domain][d.status === 'amber' ? 0 : 1]}</div></div></div>`).join('')
    : '<div class="mute">No alerts. All domains within personal baseline.</div>') + `</div>`;

  // Sensitivity slider
  html += `<div class="card"><div class="mute">Decision support, not diagnosis. Thresholds need flight-surgeon validation.</div>
    <label>Alert sensitivity (z ≥ ${threshold.toFixed(1)})</label>
    <input type="range" min=".5" max="2" step=".1" value="${threshold}"
           oninput="threshold=+this.value;render()"></div>`;
  return html;
}

function trendsView(name) {
  const h = data[name];
  const chips = Object.keys(METRICS).map(k =>
    `<button class="chip ${k === metric ? 'on' : ''}" onclick="metric='${k}';render()">${METRICS[k][0]}</button>`).join('');

  const rows = Object.keys(METRICS).map(k => {
    const bad = zScore(k, h) * METRICS[k][2];
    const st = bad >= 2 * threshold ? 'red' : bad >= threshold ? 'amber' : 'green';
    return `<div class="li"><span>${METRICS[k][0]}</span><span style="display:flex;align-items:center;gap:10px">
      ${sparkline(h[k], statusColor(st))}<span class="pill ${st}">${zScore(k, h) > 0 ? '+' : ''}${zScore(k, h).toFixed(1)}</span></span></div>`;
  }).join('');

  return `<h1>Trends</h1><div class="chips">${chips}</div>
    <div class="card"><b>${METRICS[metric][0]}</b> <span class="mute">${METRICS[metric][1]}</span>
      <div class="big">${mean(h[metric].slice(-3)).toFixed(1)}</div>
      <div class="mute">Baseline ${mean(h[metric].slice(0, BASELINE_DAYS)).toFixed(1)} · z ${zScore(metric, h).toFixed(1)}</div>
      ${trendChart(metric, h)}</div>
    <div class="card">${rows}</div>`;
}

function crewView() {
  const rows = Object.keys(CREW).map(n => {
    const a = analyse(n);
    return `<div class="li"><span style="display:flex;gap:12px;align-items:center;cursor:pointer;flex:1"
        onclick="current='${n}';view='sum';render()">
        <span class="av"><b style="background:${CREW[n].color};width:42px;height:42px;font-size:16px;border:0">${n[0]}</b></span>
        <span><b>${n}</b><br><span class="mute">${CREW[n].role}</span></span></span>
      <span style="display:flex;gap:8px;align-items:center"><span class="pill ${a.status}">${a.score}</span>
        <button class="th" onclick="removeProfile('${n}')">✕</button></span></div>`;
  }).join('');

  return `<h1>Crew</h1><div class="card">${rows}
    <button class="btn" onclick="addProfileSheet()">+ Add crew member</button></div>
    ${crewPulse()}
    <h2>Backup</h2><div class="card"><div class="mute">Save everything to a file, or restore it on another device.</div>
      <div class="tools"><button class="btn s" onclick="backupData()">Download backup</button>
        <button class="btn s" onclick="byId('restore-file').click()">Restore</button></div>
      <input id="restore-file" type="file" accept=".json" hidden onchange="restoreData(this)"></div>
    <div class="card"><div class="mute">Earth–Mars signal delay ≈ 22 min one way. VITAL runs fully offline.</div></div>`;
}

/* ---------- 6. NASA data ----------
   Researched from NASA sources (Human Research Program, NASA-STD-3001,
   Crew-13 release of Sept 2026, Twins Study, ISS sleep studies).
   NASA does not publish individual astronauts' medical data, so the
   crew below is the real roster and the numbers are published
   reference values, not anyone's personal readings. */
const CREW13_LAUNCH = new Date(2026, 9, 1);   // Crew-13 lifted off 1 Oct 2026 for 6+ months on the ISS

const NASA_CREW = [
  ['Jessica Watkins',     'Commander',          'NASA',          'Second flight. Spent 170 days in space on Crew-4 in 2022.'],
  ['Luke Delaney',        'Pilot',              'NASA',          'First spaceflight.'],
  ['Joshua Kutryk',       'Mission Specialist', 'CSA (Canada)',  'First spaceflight.'],
  ['Sergey Teteryatnikov','Mission Specialist', 'Roscosmos',     'First spaceflight.'],
];

// Health studies running on Crew-13
const NASA_STUDIES = [
  ['Venous Haemostasis', 'With ESA: how weightlessness changes blood flow and clotting. MRI, jugular ultrasound, blood pressure and blood draws before, during and after flight.'],
  ['B-Complex',          'Tests whether a daily B-vitamin helps prevent the vision and brain changes called SANS.'],
  ['Manual Piloting',    'Lunar-landing simulations to see how long weightlessness affects piloting skill.'],
  ['Zero T2',            'Compares crew who use the treadmill with those who do not.'],
];

// Known spaceflight health issues: [icon, title, headline fact, what it means for you]
const NASA_RISKS = [
  ['☢️', 'Radiation',  'NASA’s career limit is 600 mSv. About 6 months on the ISS adds roughly 50–180 mSv; Earth averages about 3.6 mSv a year.',
    'A round trip to Mars could pass 1,000 mSv, so shielding and mission length matter. A single solar storm is capped at 250 mSv.'],
  ['😴', 'Sleep',      'Crews average about 6–6.5 hours a night in flight, against 7–9 hours recommended.',
    'Under 6 hours is linked to slower attention, higher stress and worse mood. Newer missions report better sleep, around 7.9 hours.'],
  ['🦴', 'Bone & muscle', 'Weight-bearing bones can lose roughly 1–1.5% of density per month without countermeasures.',
    'Daily resistance and treadmill exercise is the main defence. Zero T2 is testing which routines work best.'],
  ['🩸', 'Blood flow & clots', 'Weightlessness disrupts normal vein blood flow, and some astronauts develop clot-risk changes.',
    'Crew-13’s Venous Haemostasis study aims to find out why it affects some people and not others.'],
  ['👁️', 'Vision (SANS)', 'Fluid shifts can thicken the retina and change eyesight; Scott Kelly became more farsighted.',
    'B vitamins are being tested as a preventive.'],
  ['🧬', 'Twins Study', 'In 340 days Scott Kelly lost 7% of body mass and his carotid artery wall thickened. His telomeres lengthened in flight, then shortened within days of landing.',
    'Most changes reversed within months. Thinking speed and accuracy dipped after landing, so recovery needs support.'],
];

// Mood and behaviour findings
const NASA_MOOD = [
  ['Isolation is a named hazard', 'NASA lists isolation and confinement as one of five spaceflight hazards. It runs 45-day, four-person isolation missions on the ground (HERA) to study it.'],
  ['Sleep drives mood', 'In a study of 24 astronauts on 6-month ISS missions, nights under 5 hours went with more fatigue and exhaustion, and under 6 hours with higher stress and workload.'],
  ['Stay connected', 'NASA’s CONNECT tips for coping with isolation stress keeping in touch with family, friends and crew.'],
  ['Early warning', 'NASA is studying how to spot early signs of slower thinking so problems are caught before they affect a mission.'],
];

// Compare this crew member with the NASA reference values above
function nasaCompare(name) {
  const h = data[name], last7 = k => mean(h[k].slice(-7));
  const sleep = last7('slp'), radTotal = h.rad.reduce((x, y) => x + y, 0), ex = last7('ex');
  const rt = mean(h.rt.slice(-3)), rtBase = mean(h.rt.slice(0, BASELINE_DAYS)), mood = last7('mood'), stress = last7('str');
  const lowSleepMood = sleep < 6 && (mood <= 3 || stress >= 3);
  return [
    ['Sleep (7-day avg)', sleep.toFixed(1) + ' h', sleep >= 7 ? 'green' : sleep >= 6 ? 'amber' : 'red',
      sleep >= 7 ? 'Better than the ~6–6.5 h ISS crews average and inside the 7–9 h guideline.' : sleep >= 6 ? 'About the level ISS crews get, but below the 7–9 h guideline.' : 'Below 6 h, where NASA studies see attention and mood suffer.'],
    ['Radiation (30 days)', radTotal.toFixed(1) + ' mSv', radTotal / 600 > .1 ? 'amber' : 'green',
      (radTotal / 600 * 100).toFixed(1) + '% of NASA’s 600 mSv career limit. About ' + (radTotal / 30).toFixed(2) + ' mSv/day, in line with ISS levels.'],
    ['Exercise (7-day avg)', ex.toFixed(0) + ' min', ex >= 60 ? 'green' : ex >= 30 ? 'amber' : 'red',
      'Exercise is NASA’s main defence against bone and muscle loss.'],
    ['Reaction time', rt.toFixed(0) + ' ms', rt > rtBase * 1.1 ? 'amber' : 'green',
      'ISS crews run short reaction tests every few days; slowing is an early fatigue sign. Use the reaction test in Log.'],
    ['Mood & stress', mood.toFixed(1) + '/5 · ' + stress.toFixed(1) + '/5', lowSleepMood ? 'amber' : 'green',
      lowSleepMood ? 'Short sleep together with low mood or high stress is the pattern NASA studies link. Protect sleep first.' : 'No short-sleep and low-mood pattern.'],
  ];
}

function nasaView(name) {
  const day = Math.max(1, Math.floor((Date.now() - CREW13_LAUNCH) / 864e5) + 1);
  const compare = nasaCompare(name).map(([t, v, st, msg]) => `<div class="li"><div style="flex:1"><b>${t}</b>
      <div class="mute">${msg}</div></div><div style="text-align:right"><b>${v}</b><br><span class="pill ${st}">${st}</span></div></div>`).join('');

  return `<h1>NASA data</h1><div class="mute">Real reference data from NASA research, compared with your numbers.</div>

    <h2>Your data vs NASA</h2><div class="card">${compare}</div>

    <h2>Crew-13 on the ISS</h2>
    <div class="card"><div class="insight"><div class="streak"><b>${day}</b><span class="mute">mission day</span></div>
      <div style="flex:1"><b>Expedition 75</b><div class="mute">Launched 1 Oct 2026 for a mission of more than six months.</div>
      <div class="prog"><i style="width:${Math.min(100, day / 1.8)}%"></i></div></div></div>
      ${NASA_CREW.map(([n, role, ag, note]) => `<div class="li"><span class="av"><b style="background:var(--grad);width:40px;height:40px;font-size:15px;border:0;box-shadow:none">${n[0]}</b></span>
        <div style="flex:1"><b>${n}</b> <span class="mute">· ${role}, ${ag}</span><div class="mute">${note}</div></div></div>`).join('')}</div>
    <div class="card"><b>Health studies on this mission</b>${NASA_STUDIES.map(([t, d]) => `<div class="li"><div><b>${t}</b><div class="mute">${d}</div></div></div>`).join('')}</div>

    <h2>Health issues in space</h2>
    ${NASA_RISKS.map(([i, t, fact, mean_]) => `<details class="card"><summary><b>${i} ${t}</b></summary>
      <p style="margin:10px 0 6px">${fact}</p><div class="mute">${mean_}</div></details>`).join('')}

    <h2>Mood &amp; behaviour</h2>
    <div class="card">${NASA_MOOD.map(([t, d]) => `<div class="li"><div><b>${t}</b><div class="mute">${d}</div></div></div>`).join('')}</div>
    <div class="mute">Sources: NASA Human Research Program, NASA-STD-3001, NASA Crew-13 release (Sept 2026), NASA Twins Study (Science, 2019), ISS sleep studies. Population averages, not a diagnosis. <a href="#" style="color:var(--acc)" onclick="view='res';render();return false">See all NASA and CSA resources</a>.</div>`;
}


/* ---------- 6b. NASA & CSA resources, mapped to the five HRP hazards ---------- */
const RESOURCES = [
  ['NASA', '5 Hazards of Human Spaceflight', 'https://www.nasa.gov/hrp/hazards/', 'Basic information from NASA’s Human Research Program on the main hazards that affect humans on space missions, with links to detailed NASA articles and reports on each hazard.', 'Structure of the whole app: every feature maps to one of the five hazards (see below).'],
  ['NASA', 'Risks of Human Spaceflight', 'https://www.nasa.gov/hrp/risks/', 'Basic information from NASA’s Human Research Program on the main risks faced by humans on space missions, with links to detailed NASA articles and reports on each risk.', 'The four health domains, the NASA tab risk cards and the first-response guides.'],
  ['NASA', 'Ongoing HRP Research in Space', 'https://www.nasa.gov/hrp/ongoing-hrp-research/', 'Articles from ongoing research in NASA’s Human Research Program.', 'Reference values and the research behind the “Your data vs NASA” comparison.'],
  ['CSA', 'Monitoring Radiation for Astronaut Health', 'https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp', 'How the Canadian Space Agency helps monitor space radiation to protect astronaut health on long missions, including Canadian technologies used to measure radiation exposure.', 'Why VITAL tracks each astronaut’s radiation dose against their own baseline and links it to live space weather.'],
  ['CSA', 'Why Do We Conduct Science Experiments in Space?', 'https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp', 'Explains how the space environment allows experiments that cannot be done on Earth, and how ISS research improves human health and supports future exploration.', 'Frames VITAL’s purpose: turning ISS-style health monitoring into decision support for the next missions.'],
];
const HAZARDS = [
  ['☢️', 'Radiation', 'Radiation metric per astronaut · Live NASA tab (DONKI flares, particle events, storms; NOAA scales; ISS South Atlantic Anomaly) · dose planner against the 600 mSv limit'],
  ['🌑', 'Isolation and confinement', 'Behavioral domain · mood tap · box-breathing coach · crew team-balance score · mental-health first-response guide'],
  ['📡', 'Distance from Earth', 'Runs fully offline · Earth–Mars delay planner · built-in assistant · note for the flight surgeon · reports and CSV'],
  ['⚖️', 'Gravity fields', 'Musculoskeletal and cardiovascular domains · workout log · bone-loss estimate · exercise trend'],
  ['🏠', 'Hostile and closed environments', 'CO₂ build-up and crew-flu scenarios · SpO₂, respiration and temperature trends · low-oxygen and fever guides'],
];
function resView() {
  return `<h1>NASA resources</h1><div class="mute">The NASA and CSA sources VITAL is built on. All links are public and need no login.</div>
    <h2>Sources</h2>${RESOURCES.map(([ag, t, u, d, use]) => `<div class="card res"><span class="pill ${ag === 'NASA' ? 'green' : 'amber'}">${ag}</span>
      <h3><a href="${u}" target="_blank" rel="noopener">${t}<span class="sr"> (opens in a new tab)</span> ↗</a></h3>
      <p>${d}</p><div class="mute"><b>How VITAL uses it:</b> ${use}</div></div>`).join('')}
    <h2>The five NASA hazards in VITAL</h2><div class="card">${HAZARDS.map(([i, t, f]) => `<div class="li"><div><b><span aria-hidden="true">${i}</span> ${t}</b><div class="mute">${f}</div></div></div>`).join('')}</div>
    <h2>Live data feeds</h2><div class="card">
      <div class="li"><a href="https://ccmc.gsfc.nasa.gov/tools/DONKI/" target="_blank" rel="noopener">NASA DONKI space-weather database ↗</a></div>
      <div class="li"><a href="https://images.nasa.gov/" target="_blank" rel="noopener">NASA Image and Video Library ↗</a></div>
      <div class="li"><a href="https://api.nasa.gov/" target="_blank" rel="noopener">NASA Open APIs ↗</a></div>
      <div class="li"><a href="https://www.nasa.gov/mission/nasas-spacex-crew-13/" target="_blank" rel="noopener">NASA SpaceX Crew-13 mission ↗</a></div>
      <div class="li"><a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener">NOAA Space Weather Prediction Center ↗</a></div></div>
    <div class="mute">NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.</div>`;
}


/* ---------- 6c. Teams & login (stored on this device) ---------- */
const NASA_TEAM_NAME = 'NASA Crew-13 (demo)';
// Real Crew-13 members (NASA release, launched 1 Oct 2026). Names and roles are real; readings are simulated.
const NASA_TEAM = {
  'Jessica Watkins': { role: 'Commander', seed: 13, color: '#5e5ce6', drift: {} },
  'Luke Delaney': { role: 'Pilot', seed: 27, color: '#30b0c7', drift: {} },
  'Joshua Kutryk': { role: 'Mission Specialist', seed: 38, color: '#ff9f0a', drift: {} },
  'Sergey Teteryatnikov': { role: 'Mission Specialist', seed: 49, color: '#ff375f', drift: {} },
};
let TEAM = ''; try { TEAM = localStorage.getItem('vital_team') || ''; } catch (e) { /* ignore */ }
const getTeams = () => { try { return JSON.parse(localStorage.getItem('vital_teams') || '{}'); } catch (e) { return {}; } };
function snapshotTeam() { if (!TEAM) return; const t = getTeams(); t[TEAM] = { crew: CREW, logs, care }; try { localStorage.setItem('vital_teams', JSON.stringify(t)); } catch (e) { /* ignore */ } }
function enterTeam(name, snap) {
  const t = getTeams(); t[name] = snap || t[name] || { crew: {}, logs: {}, care: {} };
  try {
    localStorage.setItem('vital_teams', JSON.stringify(t));
    localStorage.setItem('vital_crew', JSON.stringify(t[name].crew || {})); localStorage.setItem('vital_logs', JSON.stringify(t[name].logs || {}));
    localStorage.setItem('vital_care', JSON.stringify(t[name].care || {})); localStorage.setItem('vital_team', name);
  } catch (e) { return toast('Storage is blocked in this browser'); }
  location.reload();
}
function leaveTeam() { snapshotTeam(); ['vital_team', 'vital_crew', 'vital_logs', 'vital_care'].forEach(k => localStorage.removeItem(k)); location.reload(); }
function createTeam() {
  const n = byId('tm-name').value.replace(/[<>&"'`\\]/g, '').trim().slice(0, 30);
  if (!n) return toast('Enter a team name');
  if (getTeams()[n]) return toast('That team already exists. Open it below.');
  enterTeam(n, { crew: {}, logs: {}, care: {} });
}
const joinTeam = i => enterTeam(Object.keys(getTeams())[i]);

/* Space-themed welcome hero: animated globe, orbiting satellite, starfield (pure CSS/SVG, works offline) */
function spaceHero() {
  return `<div id="globeBg" aria-hidden="true"><div class="photo"></div><div class="stars"></div><div class="stars s2"></div>
      <div class="veil"></div></div>
    <section class="space" id="space" aria-label="Welcome">
    <div class="horizon" aria-hidden="true"><div class="hphoto"></div><canvas id="globe" class="globe-cv" width="640" height="640"></canvas></div>
    <h1>VITAL</h1>
    <p class="tagline">Crew health companion for long-duration missions</p>
    <p class="tagline s">Choose how to start below.</p>
  </section>`;
}

/* Three info cards on the welcome screen; each button takes the user straight into "Add crew member" */
const INFO_CARDS = [
  ['🧬', 'Know every baseline', 'VITAL compares each astronaut with their own normal, not a population average, across five health domains. Small drifts show up days before they become problems.'],
  ['🛰️', 'Built for the mission', 'Works offline, so it keeps going during comms gaps. Live NASA space-weather and image feeds are added when a connection is available, and all data stays on your device.'],
  ['🩺', 'Guidance, not guesswork', 'A clickable body map, step-by-step measuring guides, NASA’s five human-research hazards and a daily health mission, all in plain language for non-experts.']
];
function infoCards() {
  return `<div class="infos">${INFO_CARDS.map(([i, t, d]) => `<article class="card info"><div class="ic" aria-hidden="true">${i}</div>
      <h2>${t}</h2><p>${d}</p><button class="btn" onclick="startAddCrew()">Add your crew →</button></article>`).join('')}</div>`;
}
function startAddCrew() {
  try { sessionStorage.setItem('vital_open_add', '1'); } catch (e) { /* ignore */ }
  if (TEAM) { sessionStorage.removeItem('vital_open_add'); return addProfileSheet(); }
  const saved = Object.keys(getTeams());
  enterTeam(saved[0] || 'My Crew');             // reloads; the sheet opens on boot
}
function renderLogin() {
  ['top', 'who', 'side', 'tab'].forEach(i => { byId(i).innerHTML = ''; });
  const saved = Object.keys(getTeams());
  byId('view').innerHTML = `${spaceHero()}
    ${infoCards()}
    <div class="card hero" style="display:block"><h2 style="margin:0 0 6px">🚀 NASA Crew-13 demo team</h2>
      <div class="mute">The four real members of NASA’s SpaceX Crew-13 (Jessica Watkins, Luke Delaney, Joshua Kutryk, Sergey Teteryatnikov), launched 1 Oct 2026. Real names, roles and mission; health readings are simulated because NASA does not publish astronauts’ medical data.</div>
      <button class="btn s" id="nasa-demo" onclick="enterTeam(NASA_TEAM_NAME,{crew:JSON.parse(JSON.stringify(NASA_TEAM)),logs:{},care:{}})">Open NASA Crew-13 demo</button></div>
    <div class="card"><h2 style="margin:0 0 6px">Create a team</h2><label for="tm-name">Team name</label><input id="tm-name" maxlength="30" placeholder="e.g. Infinity Crew">
      <button class="btn" onclick="createTeam()">Create team</button><div class="mute" style="margin-top:8px">Then add your crew members with their own baselines.</div></div>
    <div class="card"><h2 style="margin:0 0 6px">Your saved teams</h2>${saved.length ? saved.map((t, i) => `<button class="opt" onclick="joinTeam(${i})"><b>${esc(t)}</b></button>`).join('') : '<div class="mute">No saved teams yet.</div>'}
      <div class="mute" style="margin-top:8px">Teams are stored privately on this device. Use Crew → Download backup to move a team to another device.</div></div>`;
  document.body.classList.add('login');
  const hero = document.body, probe = new Image();       // real photo if earth.jpg exists, else the drawn globe
  probe.onload = () => hero && hero.classList.add('has-photo');
  probe.onerror = () => window.startGlobe && startGlobe();
  probe.src = 'earth.jpg';
}

/* ---------- 6d. NASA's five hazards, interpreted from each astronaut's data ---------- */
const HZ = [
  ['☢️', 'Space radiation', 'Invisible, and considered one of the most hazardous aspects of spaceflight.', 'https://www.nasa.gov/hrp/hazard-space-radiation/'],
  ['🌑', 'Isolation and confinement', 'Behavioral responses of people isolated and confined in a small space for a long time.', 'https://www.nasa.gov/hrp/hazard-isolation-and-confinement/'],
  ['📡', 'Distance from Earth', 'Instructions, supplies and medical care get harder to receive the farther crews travel.', 'https://www.nasa.gov/hrp/hazard-distance-from-earth/'],
  ['⚖️', 'Gravity fields', 'Muscles, bones, inner ear and organs must adjust to new gravity, and again on return to Earth.', 'https://www.nasa.gov/hrp/hazard-gravity-fields/'],
  ['🏠', 'Hostile and closed environments', 'Temperature, pressure, lighting, noise, microbes and immune response inside the spacecraft.', 'https://www.nasa.gov/hrp/hazard-hostile-closed-environments/'],
];
const RK = { green: 0, amber: 1, red: 2 }, worst = (...s) => s.reduce((a, b) => RK[b] > RK[a] ? b : a, 'green');
const stOf = (k, h) => { const b = Math.max(0, zScore(k, h) * METRICS[k][2]); return b >= 2 * threshold ? 'red' : b >= threshold ? 'amber' : 'green'; };
function hazardStatus(name) {
  const a = analyse(name), h = data[name], D = a.domains, adv = advisory(), tot = h.rad.reduce((x, y) => x + y, 0), n = (logs[name] || []).length;
  return [
    [worst(stOf('rad', h), adv ? (adv.level === 'red' ? 'red' : adv.level === 'amber' ? 'amber' : 'green') : 'green'),
      `${tot.toFixed(1)} mSv in 30 days, ${(tot / 6).toFixed(1)}% of NASA’s 600 mSv career limit. ${adv ? 'Space weather now: ' + adv.head + '.' : 'Live space weather needs a connection.'}`,
      'Check the dosimeter. In a storm, move to the most shielded area and cancel EVAs.'],
    [D.Behavioral.status, `Behavioral score ${D.Behavioral.score}/100, from sleep, mood, stress, fatigue and reaction time.`, ACTIONS.Behavioral[D.Behavioral.status === 'red' ? 1 : 0]],
    [n ? 'green' : 'amber', `${n} check-in${n === 1 ? '' : 's'} logged. A Mars reply takes about 44 minutes round trip, so VITAL answers onboard.`, 'Log a daily check-in so there is a baseline when ground cannot answer.'],
    [worst(D.Musculoskeletal.status, D.Cardiovascular.status), `Musculoskeletal ${D.Musculoskeletal.score}/100 · cardiovascular ${D.Cardiovascular.score}/100. Bone can lose roughly 1–1.5% a month without exercise.`, 'Daily resistance and treadmill work; repeat the orthostatic check.'],
    [worst(D.Immune.status, D.Metabolic.status, stOf('spo2', h)), `Immune ${D.Immune.score}/100 · glucose ${mean(h.glu.slice(-3)).toFixed(0)} mg/dL · blood oxygen ${mean(h.spo2.slice(-3)).toFixed(1)}% · respiration ${mean(h.resp.slice(-3)).toFixed(0)}/min.`, 'Check cabin CO₂ and air quality; follow the first-response guides in Care.'],
  ];
}
function hazView(name) {
  const hs = hazardStatus(name), overall = worst(...hs.map(x => x[0]));
  return `<h1>Hazards</h1><div class="mute">NASA’s five human-spaceflight hazards, read from ${esc(name.split(' ')[0])}’s own data and live space weather.</div>
    <div class="card adv adv-${overall}"><b>${{ green: 'All five hazards under control', amber: 'Watch: at least one hazard is rising', red: 'Act now: a hazard is in the red' }[overall]}</b>
      <div class="mute">NASA notes the hazards can feed off one another, so VITAL shows them side by side.</div></div>
    ${HZ.map(([i, t, d, u], k) => `<div class="card"><div class="li" style="padding-top:0"><b><span aria-hidden="true">${i}</span> ${t}</b><span class="pill ${hs[k][0]}">${hs[k][0]}</span></div>
      <div class="mute">${d}</div><p style="margin:8px 0 4px"><b>In your data:</b> ${hs[k][1]}</p><div><b>Do:</b> ${hs[k][2]}</div>
      <a class="mute" href="${u}" target="_blank" rel="noopener">NASA HRP source<span class="sr"> (opens in a new tab)</span> ↗</a></div>`).join('')}
    <div class="mute">${TEAM === NASA_TEAM_NAME ? 'Names and mission are real (NASA Crew-13); health readings are simulated. ' : ''}Hazard descriptions summarize NASA’s Human Research Program. Decision support, not diagnosis.</div>`;
}

/* ---------- 7. Navigation & theme ---------- */
const TABS = [
  ['sum',  'Summary',  '♥', summaryView],
  ['haz',  'Hazards',  '⚠', hazView],
  ['body', 'Body map', '🧍', bodyView],
  ['tr',   'Trends',   '↗', trendsView],
  ['log',  'Log',      '✎', logView],
  ['measure', 'How to measure', '📏', measureView],
  ['care', 'Care',     '✚', careView],
  ['ai',   'Assistant','✦', aiView],
  ['rep',  'Reports',  '▤', reportView],
  ['plan', 'Mission',  '◈', planView],
  ['nasa', 'NASA',     '☄', nasaView],
  ['live', 'Live NASA','🛰', liveView],
  ['res',  'Resources','📚', resView],
  ['pitch','About',    '★', pitchView],
  ['crew', 'Crew',     '◉', crewView],
];

const PRIMARY = ['sum', 'log', 'ai', 'plan'];   // shown in the phone tab bar; the rest sit under "More"

function moreSheet() {
  sheet(`<h2 style="margin:0 0 10px">More</h2><div class="grid">${TABS.filter(t => !PRIMARY.includes(t[0])).map(t =>
    `<button class="btn s" style="margin:0" onclick="view='${t[0]}';closeSheet();render()"><span class="i">${t[2]}</span> ${t[1]}</button>`).join('')}</div>
    <button class="btn s" onclick="closeSheet()">Close</button>`);
}

function cycleTheme() {
  themeMode = { auto: 'light', light: 'dark', dark: 'auto' }[themeMode];
  applyTheme();
  render();
}

function applyTheme() {
  if (themeMode === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = themeMode;
}

// Redraw the whole screen from the current state
function render() {
  if (!TEAM) return renderLogin();
  if (!Object.keys(CREW).length) return renderWelcome();
  const themeLabel = { auto: '◐ Auto', light: '☀ Light', dark: '☾ Dark' }[themeMode];
  byId('top').innerHTML = `<span>● ${esc(TEAM)} · simulated data · comms delay 22 min</span>
    <span><button class="th" onclick="leaveTeam()">Switch team</button> <button class="th" onclick="cycleTheme()">${themeLabel}</button></span>`;

  // Crew picker with a status dot under each avatar
  byId('who').innerHTML = Object.keys(CREW).map(n => `
    <button class="av st-${analyse(n).status} ${n === current ? 'on' : ''}" onclick="current='${n}';render()">
      <b style="background:${CREW[n].color}">${n[0]}</b>${n.split(' ')[0]}
      <span class="dot" style="background:${statusColor(analyse(n).status)}"></span>
    </button>`).join('');

  // Sidebar (desktop) and bottom bar (phone) share the same buttons
  const buttons = (cls, list = TABS) => list.map(t =>
    `<button class="${cls} ${t[0] === view ? 'on' : ''}" ${t[0] === view ? 'aria-current="page"' : ''} onclick="view='${t[0]}';render()">
       <span class="i">${t[2]}</span>${t[1]}</button>`).join('');
  byId('side').innerHTML = buttons('nb');
  byId('tab').innerHTML = buttons('', TABS.filter(t => PRIMARY.includes(t[0])))
    + `<button class="${PRIMARY.includes(view) ? '' : 'on'}" onclick="moreSheet()"><span class="i">⋯</span>More</button>`;

  scrollSideToActive();
  byId('view').innerHTML = TABS.find(t => t[0] === view)[3](current);
  document.title = TABS.find(t => t[0] === view)[1] + ' · VITAL Crew Health';
  if (view === 'ai' && (chat[current] || []).length) {
    window.scrollTo(0, document.body.scrollHeight);       // newest message stays in view
    if (refocusChat) { const box = byId('aiq'); if (box) box.focus({ preventScroll: true }); }
  } else window.scrollTo(0, 0);
  refocusChat = false;
}


/* ---------- 8. Storage, profiles & details ---------- */
// Shown while the crew is empty: create a profile or load the demo crew
function renderWelcome() {
  const themeLabel = { auto: '◐ Auto', light: '☀ Light', dark: '☾ Dark' }[themeMode];
  byId('top').innerHTML = `<span>● Offline · runs on this device</span>
    <button class="th" onclick="cycleTheme()">${themeLabel}</button>`;
  byId('who').innerHTML = '';
  byId('side').innerHTML = '';
  byId('tab').innerHTML = '';
  byId('view').innerHTML = `<h1>Welcome to VITAL</h1>
    <div class="mute">Your onboard crew health companion</div>
    <div class="card" style="text-align:center;padding:30px 18px">
      <div style="font-size:52px">🧑‍🚀</div>
      <h2>Create your first profile</h2>
      <div class="mute">Each crew member is compared with their own baseline, not a population average.</div>
      <button class="btn" onclick="addProfileSheet()">+ Create profile</button>
      <button class="btn s" onclick="loadDemoCrew()">Load demo crew instead</button>
    </div>`;
}

function loadDemoCrew() {
  for (const name in DEMO_CREW) {
    CREW[name] = JSON.parse(JSON.stringify(DEMO_CREW[name]));
    data[name] = generateHistory(name);
  }
  current = Object.keys(CREW)[0];
  view = 'sum';
  saveAll();
  render();
}

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const COLORS = ['#5e5ce6', '#ff375f', '#30b0c7', '#ff9f0a', '#34c759', '#bf5af2'];
const ROLES = ['Commander', 'Pilot', 'Flight Engineer', 'Medical Officer', 'Mission Specialist', 'Scientist'];

function saveAll() {
  try {
    localStorage.setItem('vital_crew', JSON.stringify(CREW));
    localStorage.setItem('vital_logs', JSON.stringify(logs));
  } catch (e) { /* storage unavailable: app still works for this session */ }
}

function loadSaved() {
  try {
    const crew = JSON.parse(localStorage.getItem('vital_crew') || 'null');
    if (crew && Object.keys(crew).length) {
      for (const k in CREW) delete CREW[k];
      Object.assign(CREW, crew);
      current = Object.keys(CREW)[0];
    }
    logs = JSON.parse(localStorage.getItem('vital_logs') || '{}');
  } catch (e) { logs = {}; }
}

// Put each person's latest logged readings into "today" of their history
function applyLogs() {
  for (const name in logs) {
    if (!data[name]) continue;
    for (const entry of logs[name] || []) for (const key in entry.v) data[name][key][DAYS - 1] = entry.v[key];   // oldest to newest
  }
}

function sheet(html) {                         // bottom-sheet popup
  let o = byId('ovl');
  if (!o) { o = document.createElement('div'); o.id = 'ovl'; o.className = 'ovl'; document.body.appendChild(o); }
  if (!o.dataset.prev) o.dataset.prev = document.activeElement && document.activeElement.id || '';
  o.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="Dialog">${html}</div>`;
  const f = o.querySelector('input,button,select'); if (f) f.focus();
}
const closeSheet = () => { const o = byId('ovl'); if (o) o.remove(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && byId('ovl')) closeSheet(); });
const toast = msg => {
  const e = document.createElement('div'); e.className = 'toast'; e.setAttribute('role', 'status'); e.textContent = msg;
  document.body.appendChild(e); setTimeout(() => e.remove(), 2400);
};

function addProfileSheet() {
  sheet(`<h2 style="margin:0">Add crew member</h2>
    <div class="mute">Baselines come from pre-flight data. Until real readings are logged, history is simulated from them.</div>
    <label>Name</label><input id="pf-name" maxlength="24" placeholder="e.g. Sara Ito">
    <label>Role</label><select id="pf-role">${ROLES.map(r => `<option>${r}</option>`).join('')}</select>
    <label>Age</label><input id="pf-age" type="number" placeholder="e.g. 38">
    <label>Medical conditions / allergies (optional)</label><input id="pf-cond" maxlength="80" placeholder="e.g. mild asthma">
    <label>Resting heart rate (bpm)</label><input id="pf-hr" type="number" value="60">
    <label>Typical sleep (hours)</label><input id="pf-sl" type="number" step=".1" value="7.2">
    <label>HRV (ms)</label><input id="pf-hrv" type="number" value="60">
    <button class="btn" onclick="saveProfile()">Add to crew</button>
    <button class="btn s" onclick="closeSheet()">Cancel</button>`);
}

function saveProfile() {
  const name = byId('pf-name').value.replace(/[<>&"'`\\]/g, '').trim().slice(0, 24);
  const hr = +byId('pf-hr').value, sl = +byId('pf-sl').value, hrv = +byId('pf-hrv').value, age = +byId('pf-age').value;
  if (!name) return toast('Enter a name');
  if (CREW[name]) return toast('That name already exists');
  if (!(hr >= 35 && hr <= 100 && sl >= 3 && sl <= 12 && hrv >= 10 && hrv <= 150)) return toast('Check the baseline values');

  CREW[name] = {
    role: byId('pf-role').value, seed: Math.floor(Math.random() * 1e5) + 1,
    color: COLORS[Math.floor(Math.random() * COLORS.length)], drift: {},
    base: Object.assign({}, BASE, { rhr: hr, slp: sl, hrv }),
    details: { age: age > 0 ? age : '', conditions: byId('pf-cond').value.replace(/[<>]/g, '').trim() },
  };
  data[name] = generateHistory(name);
  current = name; view = 'sum';
  saveAll(); closeSheet(); toast(name.split(' ')[0] + ' added'); render();
}

function removeProfile(name) {
  sheet(`<h2 style="margin:0">Remove ${esc(name)}?</h2><div class="mute">Their logged readings will be deleted.</div>
    <button class="btn" style="background:var(--r)" onclick="confirmRemove('${name}')">Remove</button>
    <button class="btn s" onclick="closeSheet()">Cancel</button>`);
}
function confirmRemove(name) {
  delete CREW[name]; delete data[name]; delete logs[name]; delete chat[name]; delete care[name]; saveCare();
  current = Object.keys(CREW)[0] || ''; saveAll(); closeSheet(); render();
}

/* ---------- 9. Log: enter heart rate, conditions, symptoms ---------- */
// [key in METRICS, label, min, max, step]  (blank fields are skipped)
const LOG_FIELDS = [
  ['rhr', 'Heart rate (bpm)', 30, 220, 1],        ['spo2', 'Blood oxygen SpO₂ (%)', 70, 100, .1],
  ['bp', 'Blood pressure, systolic (mmHg)', 70, 220, 1], ['resp', 'Respiration (breaths/min)', 6, 40, 1],
  ['temp', 'Skin temperature (°C)', 30, 40, .1],  ['slp', 'Hours slept', 0, 16, .1],
  ['ex', 'Exercise today (min)', 0, 300, 1],      ['mood', 'Mood (1 low – 5 high)', 1, 5, 1],
  ['str', 'Stress (1 calm – 5 high)', 1, 5, 1],   ['fat', 'Fatigue (1 fresh – 5 exhausted)', 1, 5, 1],
  ['pain', 'Pain (0–10)', 0, 10, 1],       ['rt', 'Reaction time (ms)', 100, 1000, 1],
  ['glu', 'Blood glucose (mg/dL)', 30, 500, 1],
];
const SYMPTOMS = ['Headache', 'Sore throat / congestion', 'Fever or chills', 'Back pain', 'Dizzy on standing', 'Palpitations', 'Low mood'];

function logView(name) {
  const p = CREW[name], d = p.details || {};
  const history = (logs[name] || []).slice(-5).reverse().map(l =>
    `<div class="li"><span>${esc(l.date)}<div class="mute">${Object.entries(l.v).map(([k, v]) => `${METRICS[k][0]} ${v}`).join(' · ')}
     ${l.sym.length ? '<br>Symptoms: ' + esc(l.sym.join(', ')) : ''}</div></span></div>`).join('');

  return `<h1>Log</h1><div class="mute">Enter what you measured, ${esc(name.split(' ')[0])}. Leave blank to skip.</div>
    <div class="card">
      <div class="tools"><button class="btn s" onclick="pulseSheet()">❤️ Count pulse</button>
        <button class="btn s" id="rt-btn" onclick="reactionTest()">⚡ Reaction test</button></div>
      ${LOG_FIELDS.map(([k, l, lo, hi, st]) => `<label>${l}</label>
        <input id="lf-${k}" type="number" inputmode="decimal" step="${st}" placeholder="${lo}–${hi}">`).join('')}
      <label>Symptoms today</label>
      <div class="chips2">${SYMPTOMS.map(s => `<button class="chip" data-sym onclick="this.classList.toggle('on')">${s}</button>`).join('')}</div>
      <label>Conditions / notes for the flight surgeon</label>
      <textarea id="lf-note" rows="3">${esc(d.conditions || '')}</textarea>
      <button class="btn" onclick="saveLog()">Save check-in</button>
    </div>
    <h2>Recent check-ins</h2><div class="card">${history || '<div class="mute">No check-ins yet.</div>'}</div>`;
}

function saveLog() {
  const name = current, v = {};
  for (const [k, l, lo, hi] of LOG_FIELDS) {
    const raw = byId('lf-' + k).value;
    if (raw === '') continue;
    if (isNaN(+raw) || +raw < lo || +raw > hi) return toast('Check value: ' + l);
    v[k] = +raw;
  }
  const sym = [...document.querySelectorAll('[data-sym].on')].map(b => b.textContent);
  const note = byId('lf-note').value.replace(/[<>]/g, '').trim();
  if (!Object.keys(v).length && !sym.length) return toast('Enter at least one value');

  (logs[name] = logs[name] || []).push({ date: new Date().toLocaleString(), k: new Date().toDateString(), v, sym, note });
  logs[name] = logs[name].slice(-60);
  CREW[name].details = Object.assign(CREW[name].details || {}, { conditions: note });
  for (const k in v) data[name][k][DAYS - 1] = v[k];

  // Quick warning for out-of-range vital signs
  const warn = [];
  if (v.rhr > 100) warn.push('high heart rate');
  if (v.spo2 < 94) warn.push('low oxygen');
  if (v.bp > 140) warn.push('high blood pressure');
  if (v.temp > 37.8) warn.push('raised temperature');
  if (v.glu < 70) warn.push('low blood glucose');
  if (v.glu > 180) warn.push('high blood glucose');
  saveAll();
  toast(warn.length ? 'Saved · ' + warn.join(', ') : 'Check-in saved');
  view = 'sum'; render();
}

/* ---------- 10. AI assistant (rule-based, runs offline) ---------- */
const chat = {};   // name -> messages
const TIPS = {
  rhr: 'Keep exercise moderate, hydrate and recheck after waking.', hrv: 'Take an easy day and protect your sleep.',
  slp: 'Protect an 8-hour sleep window and limit caffeine.', temp: 'Rest, drink fluids and recheck tonight.',
  mood: 'Spend time on something you enjoy and talk with a crewmate or family.', fat: 'Lighten your workload and take a rest block.',
  pain: 'Ease the painful area and try a guided self-exam.', rt: 'Avoid critical tasks while your reaction time is slow.',
  ex: 'Fit in a resistance session today.', str: 'Try 5 minutes of paced breathing.',
  spo2: 'Check cabin CO₂, sit upright and recheck in 10 minutes.', bp: 'Hydrate, cut caffeine and re-measure seated.',
  resp: 'Rest and recheck at a calm moment.', rad: 'Spend more time in shielded areas.',
};
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');

// Metrics that are furthest from this person's baseline
function drivers(name) {
  return Object.values(analyse(name).domains).flatMap(d => d.items).filter(i => i.bad >= threshold * .6).sort((x, y) => y.bad - x.bad);
}
function line(key, name) {
  const h = data[name][key], now = h[DAYS - 1], base = mean(h.slice(0, BASELINE_DAYS));
  return `${METRICS[key][0]}: ${now.toFixed(1)} ${METRICS[key][1]} now vs ${base.toFixed(1)} baseline (${zScore(key, data[name]).toFixed(1)}σ)`;
}
function domainReply(domain, name) {
  const d = analyse(name).domains[domain], top = drivers(name).find(i => DOMAINS[domain].includes(i.key));
  return `**${domain}: ${d.score}/100, ${d.status}**\n` + DOMAINS[domain].map(k => '• ' + line(k, name)).join('\n')
    + '\n' + (top ? '**Tip:** ' + TIPS[top.key] : 'All within your baseline. Keep your routine.');
}

function chatReply(q, name) {
  const t = q.toLowerCase(), a = analyse(name), first = name.split(' ')[0], dr = drivers(name), p = CREW[name].details || {};
  const has = (...w) => w.some(x => t.includes(x));
  const verdict = { green: 'ready', amber: 'watch closely', red: 'action needed' }[a.status];
  const flagged = Object.entries(a.domains).filter(([, d]) => d.status !== 'green');

  if (has('note', 'draft', 'surgeon', 'sbar'))
    return `**Draft note for the flight surgeons**\n**Situation:** ${name} (${CREW[name].role}), score ${a.score}/100, ${verdict}.\n`
      + `**Background:** ${p.age ? 'Age ' + p.age + '. ' : ''}${p.conditions ? 'Known conditions: ' + p.conditions + '. ' : ''}`
      + `${dr.length ? 'Main drivers: ' + dr.slice(0, 3).map(i => METRICS[i.key][0].toLowerCase()).join(', ') + '.' : 'No indicators outside baseline.'}\n`
      + `**Recommendation:** ${a.status === 'red' ? 'Request a consult now.' : flagged.length ? 'Keep monitoring; repeat check-in in 24 h.' : 'Routine monitoring.'}`;
  if (has('escalat', 'ground', 'doctor', 'emergen', 'worried'))
    return a.status === 'red' ? '**Yes, I would escalate.** At least one domain is red. Use Reports to share a summary now.'
      : flagged.length ? `**Not urgent yet.** ${flagged.map(([n, d]) => n + ' is ' + d.status).join(', ')}. Escalate if it persists 48 hours or worsens.`
      : '**No escalation needed.** All domains are within baseline.';
  if (has('focus', 'advice', 'improve', 'tips', 'what should'))
    return dr.length ? '**Focus on these:**\n' + dr.slice(0, 3).map((i, n) => `${n + 1}. **${METRICS[i.key][0]}**: ${TIPS[i.key]}`).join('\n') : 'You are within baseline everywhere. Keep logging daily.';
  if (has('crew', 'team', 'everyone')) return '**Crew overview**\n' + Object.keys(CREW).map(n => `• ${n}: ${analyse(n).score}/100 (${analyse(n).status})`).join('\n');
  if (has('condition', 'medical', 'allerg', 'profile', 'details'))
    return p.conditions || p.age ? `**Your details**\n• Age: ${p.age || 'not set'}\n• Conditions: ${p.conditions || 'none recorded'}\nUpdate them in the Log tab.` : 'No conditions recorded. Add them in the Log tab.';
  if (has('heart', 'pulse', 'hrv', 'blood pressure', 'bp', 'cardio')) return domainReply('Cardiovascular', name);
  if (has('immune', 'sick', 'fever', 'temperature', 'cold')) return domainReply('Immune', name);
  if (has('muscle', 'bone', 'exercise', 'pain', 'back')) return domainReply('Musculoskeletal', name);
  if (has('mood', 'stress', 'sleep', 'tired', 'mental')) return domainReply('Behavioral', name);
  if (has('hello', 'hi ', 'hey')) return `Hi ${first}, I am Nova. I run offline on this device. Try “Explain my status”.`;
  return `**You are at ${a.score}/100 (${verdict}).**\n` + (flagged.length
    ? flagged.map(([n, d]) => `• **${n}** is ${d.status}`).join('\n') : '• All five domains are within your baseline.')
    + (dr[0] ? '\n**Next step:** ' + TIPS[dr[0].key] : '') + '\nDecision support, not diagnosis.';
}

/* ---- Live AI (Claude API) ----
   Add your API key in the Assistant tab. It is stored only in this browser.
   For a shared or public app, send requests through your own server instead:
   put its URL in AI_PROXY and no key is needed in the browser. */
const AI_MODEL = 'claude-sonnet-5-5';
const AI_URL = 'https://api.anthropic.com/v1/messages';
const AI_PROXY = '';   // e.g. 'https://your-server.example/api/vital-chat'
let aiKey = '', aiBusy = false, refocusChat = false;
try { aiKey = localStorage.getItem('vital_key') || ''; } catch (e) { /* ignore */ }
let aiMode = 'builtin';   // 'builtin' (default, no key) or 'key' (your own API key)
try { aiMode = localStorage.getItem('vital_aimode') || (aiKey ? 'key' : 'builtin'); } catch (e) { /* ignore */ }
const aiReady = () => aiMode === 'key' && !!(aiKey || AI_PROXY);

const AI_SYSTEM = `You are VITAL AI, an onboard health companion for a spaceflight crew.
You get one crew member's data: profile, conditions, personal-baseline z-scores, domain scores and latest check-in.
Rules: use only the data provided and never invent readings. Compare people with their own baseline.
You are decision support, not a diagnosis. For red flags (SpO2 under 92%, heart rate over 120, chest pain, fainting,
severe symptoms, mental-health crisis) tell them to contact the flight surgeons now.
Keep answers short and practical: plain language, at most about 150 words, bullets only when they help.`;

// Plain-text snapshot of the selected crew member sent to the AI
function healthContext(name) {
  const a = analyse(name), h = data[name], p = CREW[name].details || {}, last = (logs[name] || []).slice(-1)[0];
  return [
    `Crew member: ${name}, ${CREW[name].role}${p.age ? ', age ' + p.age : ''}. Conditions: ${p.conditions || 'none recorded'}.`,
    `Overall score ${a.score}/100 (${a.status}). Alert sensitivity z >= ${threshold.toFixed(1)}.`,
    ...Object.entries(a.domains).map(([n, d]) => `${n}: ${d.score}/100, ${d.status}`),
    'Indicators (now vs own baseline, z-score; positive z = higher than baseline):',
    ...Object.keys(METRICS).map(k => '- ' + line(k, name)),
    last ? `Latest check-in ${last.date}: ${Object.entries(last.v).map(([k, v]) => METRICS[k][0] + ' ' + v).join(', ') || 'no vitals'}. Symptoms: ${last.sym.join(', ') || 'none'}. Note: ${last.note || 'none'}.` : 'No check-ins logged yet; history is simulated.',
  ].join('\n');
}

async function askAI(name, history) {
  const headers = { 'content-type': 'application/json' };
  if (!AI_PROXY) {
    headers['x-api-key'] = aiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';   // required for calls from a browser
  }
  const res = await fetch(AI_PROXY || AI_URL, {
    method: 'POST', headers,
    body: JSON.stringify({
      model: AI_MODEL, max_tokens: 600,
      system: AI_SYSTEM + '\n\nCURRENT DATA\n' + healthContext(name),
      messages: history,
    }),
  });
  const out = await res.json();
  if (!res.ok) throw new Error((out.error && out.error.message) || 'Request failed (' + res.status + ')');
  return out.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

function saveKey() {
  const k = byId('ai-key').value.trim();
  if (!k) return toast('Paste your API key first');
  aiKey = k;
  try { localStorage.setItem('vital_key', k); } catch (e) { /* ignore */ }
  aiMode = 'key';
  try { localStorage.setItem('vital_aimode', 'key'); } catch (e) { /* ignore */ }
  closeSheet(); toast('Using your API key'); render();
}
function clearKey() {
  aiKey = '';
  try { localStorage.removeItem('vital_key'); localStorage.setItem('vital_aimode', 'builtin'); } catch (e) { /* ignore */ }
  aiMode = 'builtin'; closeSheet(); toast('Back to the built-in assistant'); render();
}

function aiView(name) {
  const msgs = chat[name] || [];
  const prompts = ['Explain my status', 'What should I focus on?', 'Should I escalate?', 'How is the crew?', 'Draft a note for the flight surgeon'];
  const connect = `<button class="th" onclick="aiModeSheet()">✦ ${aiReady() ? 'Your API key' : 'Built-in assistant'} ▾</button>`;

  return `<div class="chat"><h1>Assistant · Nova</h1>
    <div class="mute">✦ Reads ${esc(name.split(' ')[0])}’s baseline, readings and conditions. Decision support, not diagnosis.</div>
    ${connect}
    <div class="chips" style="margin-top:12px">${prompts.map(q => `<button class="chip" onclick="ask(this.textContent)">${q}</button>`).join('')}</div>
    <div class="card msgs">${msgs.length ? msgs.map(m => `<div class="msg ${m.role}">${m.pending ? '<span class="mute">Thinking…</span>' : md(m.text)}</div>`).join('') : '<div class="mute">Ask anything about your health data.</div>'}</div>
    <div class="aibar"><input id="aiq" placeholder="Ask VITAL AI…" onkeydown="if(event.key==='Enter')ask(this.value)">
      <button class="btn" style="width:auto;margin:0" onclick="ask(byId('aiq').value)">Send</button></div></div>`;
}

async function ask(q) {
  if (aiBusy || !q || !q.trim()) return;
  const name = current, m = chat[name] = chat[name] || [];
  m.push({ role: 'user', text: q });
  refocusChat = true;   // keep typing without tapping the box again

  // No key yet: answer with the built-in offline rules
  if (!aiReady()) {
    m.push({ role: 'assistant', text: chatReply(q, name) });
    return render();
  }

  // Live AI: send the recent conversation (must start with a user message)
  const history = m.filter(x => !x.pending).slice(-10).map(x => ({ role: x.role, content: x.text }));
  while (history.length && history[0].role !== 'user') history.shift();
  const slot = { role: 'assistant', text: '', pending: true };
  m.push(slot);
  aiBusy = true; render();

  try {
    slot.text = await askAI(name, history);
  } catch (err) {
    slot.text = chatReply(q, name) + `\n\n(Live AI unavailable: ${err.message}. Showing the offline answer.)`;
  }
  slot.pending = false; aiBusy = false;
  if (view === 'ai' && current === name) render();
}

/* ---------- 11. Reports: print / PDF and CSV ---------- */
let reportScope = 'one';   // 'one' or 'all'

function reportPage(name) {
  const a = analyse(name), h = data[name], p = CREW[name].details || {}, last = (logs[name] || []).slice(-1)[0];
  return `<div class="pg"><h3>Crew Health Report</h3>
    <div>${esc(name)} · ${CREW[name].role}${p.age ? ' · age ' + esc(p.age) : ''} · ${new Date().toLocaleDateString('en-GB')}</div>
    <div class="mute">Conditions: ${esc(p.conditions || 'none recorded')} · Decision support, not diagnosis.</div>
    <p><b>Overall score ${a.score}/100 · ${a.status.toUpperCase()}</b></p>
    <table><tr><th>Domain</th><th>Score</th><th>Status</th><th>Suggested action</th></tr>
      ${Object.entries(a.domains).map(([n, d]) => `<tr><td>${n}</td><td>${d.score}</td><td>${d.status}</td><td>${d.status === 'green' ? 'Routine' : ACTIONS[n][d.status === 'amber' ? 0 : 1]}</td></tr>`).join('')}</table>
    <table><tr><th>Indicator</th><th>Now</th><th>Baseline</th><th>z</th></tr>
      ${Object.keys(METRICS).map(k => `<tr><td>${METRICS[k][0]}</td><td>${mean(h[k].slice(-3)).toFixed(1)} ${METRICS[k][1]}</td><td>${mean(h[k].slice(0, BASELINE_DAYS)).toFixed(1)}</td><td>${zScore(k, h).toFixed(1)}</td></tr>`).join('')}</table>
    ${last ? `<p><b>Latest check-in (${esc(last.date)}):</b> ${Object.entries(last.v).map(([k, v]) => METRICS[k][0] + ' ' + v).join(', ')}.
      Symptoms: ${last.sym.length ? esc(last.sym.join(', ')) : 'none'}.${last.note ? ' Note: ' + esc(last.note) : ''}</p>` : ''}</div>`;
}

function reportView() {
  const names = reportScope === 'all' ? Object.keys(CREW) : [current];
  return `<h1 class="np">Reports</h1>
    <div class="card np"><label>Scope</label>
      <select onchange="reportScope=this.value;render()">
        <option value="one" ${reportScope === 'one' ? 'selected' : ''}>${esc(current)} only</option>
        <option value="all" ${reportScope === 'all' ? 'selected' : ''}>Whole crew (one page each)</option></select>
      <button class="btn" onclick="window.print()">Print / Save as PDF</button>
      <button class="btn s" onclick="downloadCSV()">Download CSV</button>
      <div class="mute" style="margin-top:8px">In the print dialog choose “Save as PDF”.</div></div>
    <div id="rep">${names.map(reportPage).join('')}</div>`;
}

// CSV: one row per person per day, all 15 metrics, plus conditions
function downloadCSV() {
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const keys = Object.keys(METRICS);
  const names = reportScope === 'all' ? Object.keys(CREW) : [current];
  const rows = [['Name', 'Role', 'Conditions', 'Day', ...keys.map(k => `${METRICS[k][0]} (${METRICS[k][1]})`)]];
  names.forEach(n => {
    for (let day = 0; day < DAYS; day++)
      rows.push([n, CREW[n].role, (CREW[n].details || {}).conditions || '', day + 1, ...keys.map(k => data[n][k][day])]);
  });
  const blob = new Blob([rows.map(r => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vital-report-' + (names.length > 1 ? 'crew' : names[0].replace(/\s+/g, '-')) + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- 12. Care: hydration, workouts, medications, first-response ---------- */
let care = {};   // name -> { hyd:{d,n}, wk:[{d,type,min}], meds:[{n,dose,took}] }
try { care = JSON.parse(localStorage.getItem('vital_care') || '{}'); } catch (e) { care = {}; }
const saveCare = () => { try { localStorage.setItem('vital_care', JSON.stringify(care)); } catch (e) { /* ignore */ } };
const careOf = n => care[n] = care[n] || { hyd: {}, wk: [], meds: [] };
const todayKey = () => new Date().toDateString();
const cupsToday = n => { const h = careOf(n).hyd; return h.d === todayKey() ? h.n : 0; };
const minutesToday = n => careOf(n).wk.filter(w => w.d === todayKey()).reduce((s, w) => s + w.min, 0);
const WORKOUTS = ['Treadmill', 'Cycling', 'Resistance', 'Yoga / stretch'];

const GUIDES = [
  ['Chest pain or fainting', ['Stop activity; sit or lie down, legs raised if faint.', 'Alert a crewmate and bring the medical kit.', 'Measure pulse and SpO₂ and log them.', 'Contact the ground flight surgeons now.']],
  ['Low oxygen or high CO₂', ['Move to a well-ventilated module and sit upright.', 'Check cabin O₂ and CO₂ readings.', 'Breathe slowly and avoid exertion.', 'If SpO₂ stays under 92%, escalate immediately.']],
  ['Fever or infection signs', ['Rest, drink fluids and record temperature every 4 hours.', 'Separate from crewmates if cough or rash spreads.', 'Follow the onboard medical kit protocol.', 'Send a summary to ground if fever lasts over 24 hours.']],
  ['High or low blood sugar', ['Low (under 70 mg/dL): eat or drink 15 g of fast sugar, then recheck in 15 minutes.', 'High (over 250 mg/dL) with thirst: drink water and rest, and recheck in an hour.', 'Log the reading and what you ate and did.', 'If symptoms continue, or you feel confused, contact the flight surgeon.']],
  ['Mental health crisis', ['Stay with the person and listen without judgement.', 'Remove access to anything dangerous.', 'Contact the crew psychologist or ground immediately.', 'Nobody on this mission is alone.']],
];

function careView(name) {
  const o = careOf(name), cups = cupsToday(name), mins = minutesToday(name);
  const meds = o.meds.map((m, i) => `<div class="li">
      <label style="display:flex;gap:10px;align-items:center;margin:0;font-weight:400">
        <input type="checkbox" ${m.took === todayKey() ? 'checked' : ''} onchange="toggleMed(${i}, this.checked)">
        <span><b>${esc(m.n)}</b> <span class="mute">${esc(m.dose)}</span></span></label>
      <button class="th" onclick="deleteMed(${i})">✕</button></div>`).join('');

  return `<h1>Care</h1><div class="mute">Daily care for ${esc(name.split(' ')[0])}</div>

    <h2>Hydration</h2>
    <div class="card ring">${ring(Math.min(100, cups * 10), '#3b82f6', 72, 9, cups)}
      <div style="flex:1"><b>${cups} of 10 cups</b><div class="mute">Goal 8–10 cups a day</div></div>
      <button class="btn s" style="width:auto;margin:0" onclick="addCup(-1)">−</button>
      <button class="btn" style="width:auto;margin:0" onclick="addCup(1)">+ Cup</button></div>

    <h2>Workouts</h2>
    <div class="card"><b>${mins} of 90 min today</b>
      <div class="prog"><i style="width:${Math.min(100, mins / .9)}%"></i></div>
      <label>Minutes</label><input id="wk-min" type="number" value="30">
      <div class="chips" style="margin-top:10px">${WORKOUTS.map(w => `<button class="chip" onclick="logWorkout('${w}')">+ ${w}</button>`).join('')}</div>
      ${o.wk.filter(w => w.d === todayKey()).map(w => `<div class="li"><span>${esc(w.type)}</span><span class="mute">${w.min} min</span></div>`).join('')}</div>

    <h2>Medications &amp; supplements</h2>
    <div class="card">${meds || '<div class="mute">Nothing added yet. Add vitamin D, painkillers or prescriptions.</div>'}
      <label>Name</label><input id="md-n" maxlength="30" placeholder="e.g. Vitamin D">
      <label>Dose / time</label><input id="md-d" maxlength="30" placeholder="e.g. 1000 IU morning">
      <button class="btn s" onclick="addMed()">Add</button></div>

    <h2>First-response guides</h2>
    ${GUIDES.map(([t, steps]) => `<details class="card"><summary><b>${t}</b></summary><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol></details>`).join('')}
    <div class="mute">General guidance only. Follow your mission’s official medical procedures.</div>`;
}

function addCup(n) { careOf(current).hyd = { d: todayKey(), n: Math.max(0, cupsToday(current) + n) }; saveCare(); render(); }
function logWorkout(type) {
  const min = +byId('wk-min').value;
  if (!(min >= 1 && min <= 240)) return toast('Enter 1–240 minutes');
  const o = careOf(current);
  o.wk.push({ d: todayKey(), type, min }); o.wk = o.wk.slice(-60);
  data[current].ex[DAYS - 1] = minutesToday(current);      // feeds the Musculoskeletal score
  saveCare(); toast(type + ' logged'); render();
}
function addMed() {
  const n = byId('md-n').value.replace(/[<>]/g, '').trim();
  if (!n) return toast('Enter a name');
  careOf(current).meds.push({ n, dose: byId('md-d').value.replace(/[<>]/g, '').trim(), took: '' });
  saveCare(); render();
}
function toggleMed(i, on) { careOf(current).meds[i].took = on ? todayKey() : ''; saveCare(); }
function deleteMed(i) { careOf(current).meds.splice(i, 1); saveCare(); render(); }

/* ---------- 13. Insights: streak, forecast, badges ---------- */
// Consecutive days with a check-in (today may still be pending)
function streak(name) {
  const days = new Set((logs[name] || []).map(l => l.k).filter(Boolean));
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function slope(a) {   // least-squares trend per day
  const n = a.length, xm = (n - 1) / 2, ym = mean(a);
  let u = 0, w = 0;
  a.forEach((v, i) => { u += (i - xm) * (v - ym); w += (i - xm) ** 2; });
  return u / w;
}

// Which indicators are drifting toward amber, and in about how many days
function forecasts(name) {
  const h = data[name], out = [];
  for (const k in METRICS) {
    if (k === 'rad') continue;
    const dir = METRICS[k][2], a = h[k].slice(-14), rate = slope(a) * dir;
    const base = mean(h[k].slice(0, BASELINE_DAYS)), spread = Math.max(sd(h[k].slice(0, BASELINE_DAYS)), NOISE[k] * .6);
    const gap = (base + dir * threshold * spread - mean(a.slice(-3))) * dir;
    if (rate > NOISE[k] * .02 && gap > 0 && Math.round(gap / rate) <= 30) out.push({ k, days: Math.max(1, Math.round(gap / rate)) });
  }
  return out.sort((p, q) => p.days - q.days);
}

function insightCard(name) {
  const s = streak(name), n = (logs[name] || []).length, st = analyse(name).status;
  const f = forecasts(name).slice(0, 2), top = drivers(name)[0];
  const badges = [
    ['First check-in', n >= 1], ['3-day streak', s >= 3], ['7-day streak', s >= 7],
    ['Hydration hero', cupsToday(name) >= 8], ['Iron crew', minutesToday(name) >= 60], ['All green', st === 'green'],
  ];
  return `<div class="card"><div class="insight">
      <div class="streak"><b>${s}</b><span class="mute">day streak</span></div>
      <div style="flex:1"><b>Today’s insight</b>
        <div class="mute">${top ? METRICS[top.key][0] + ' is ' + (top.z > 0 ? 'above' : 'below') + ' your baseline. ' + TIPS[top.key] : 'You are within your baseline. Log a check-in to keep your streak.'}</div></div></div>
    ${f.map(x => `<div class="forecast">📈 ${METRICS[x.k][0]} may reach amber in about ${x.days} day${x.days === 1 ? '' : 's'} at the current trend.</div>`).join('')}
    <div class="badges">${badges.map(([t, got]) => `<span class="badge ${got ? 'got' : ''}">${got ? '★ ' : ''}${t}</span>`).join('')}</div></div>`;
}

/* ---------- 14. Tools: pulse counter, reaction test ---------- */
let pulse = null, rtStart = 0, rtArmed = false;

function pulseSheet() {
  pulse = { n: 0, t: 15, iv: null };
  sheet(`<h2 style="margin:0">Count your pulse</h2>
    <div class="mute">Find your pulse at the wrist or neck and tap on every beat. The 15-second timer starts on your first tap.</div>
    <div class="bigcount" id="pc-n">0</div><div class="mute" style="text-align:center" id="pc-t">15 s</div>
    <button class="btn tap" id="pc-b" onclick="pulseTap()">Tap on your first beat</button>
    <button class="btn s" onclick="pulseStop()">Cancel</button>`);
}
function pulseTap() {
  if (!pulse) return;
  if (!pulse.iv) {
    pulse.iv = setInterval(() => {
      pulse.t--; const e = byId('pc-t'); if (e) e.textContent = pulse.t + ' s';
      if (pulse.t <= 0) {                                   // done: beats x 4 = bpm
        const bpm = pulse.n * 4; pulseStop();
        const box = byId('lf-rhr'); if (box) box.value = bpm;
        toast('Pulse: ' + bpm + ' bpm');
      }
    }, 1000);
    byId('pc-b').textContent = 'Keep tapping each beat';
  }
  pulse.n++; byId('pc-n').textContent = pulse.n;
}
function pulseStop() { if (pulse && pulse.iv) clearInterval(pulse.iv); pulse = null; closeSheet(); }

// Wait a random moment, then time how fast you tap
function reactionTest() {
  const b = byId('rt-btn');
  if (rtArmed) {
    const ms = Math.round(performance.now() - rtStart); rtArmed = false;
    byId('lf-rt').value = ms; b.textContent = '⚡ ' + ms + ' ms · again'; b.style.background = ''; return;
  }
  b.textContent = 'Wait…';
  setTimeout(() => { b.textContent = 'TAP NOW'; b.style.background = 'var(--g)'; rtStart = performance.now(); rtArmed = true; }, 1000 + Math.random() * 2000);
}

/* ---------- 15. Backup & restore ---------- */
function backupData() {
  const blob = new Blob([JSON.stringify({ app: 'vital', crew: CREW, logs, care }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'vital-backup.json'; a.click(); URL.revokeObjectURL(a.href);
}

function restoreData(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const b = JSON.parse(reader.result), clean = s => String(s).replace(/[<>&"'`\\]/g, '').trim().slice(0, 24);
      if (b.app !== 'vital' || typeof b.crew !== 'object') throw new Error('bad file');
      for (const raw in b.crew) {
        const name = clean(raw), p = b.crew[raw];
        if (!name || CREW[name]) continue;                       // never overwrite existing profiles
        CREW[name] = {
          role: ROLES.includes(p.role) ? p.role : 'Mission Specialist', seed: +p.seed || 1,
          color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : COLORS[0],
          drift: p.drift && typeof p.drift === 'object' ? p.drift : {}, base: p.base,
          details: { age: +(p.details || {}).age || '', conditions: String((p.details || {}).conditions || '').replace(/[<>]/g, '').slice(0, 80) },
        };
        if (b.logs && b.logs[raw]) logs[name] = b.logs[raw];
        if (b.care && b.care[raw]) care[name] = b.care[raw];
        data[name] = generateHistory(name);
      }
      applyLogs(); saveAll(); saveCare();
      current = current || Object.keys(CREW)[0]; toast('Backup restored'); render();
    } catch (e) { toast('That file is not a VITAL backup'); }
  };
  reader.readAsText(file);
}

/* ---------- 16. Mission planner, scenarios, comms delay ---------- */
// Dose rates: ISS ≈ 0.5 mSv/day, deep-space transit ≈ 1.5 mSv/day (NASA technical brief). Career limit 600 mSv, solar storm cap 250 mSv.
const PLAN_PRESETS = { 'ISS · 6 months': [180, .5], 'Mars round trip': [900, 1.5] };
let plan = { days: 180, rate: .5, shield: 0, spe: false, delay: 12 };

function planOut() {
  const rate = plan.rate * (1 - plan.shield / 100), dose = plan.days * rate + (plan.spe ? 250 : 0), pct = dose / 600 * 100;
  const st = pct >= 100 ? 'red' : pct >= 50 ? 'amber' : 'green', months = plan.days / 30.4;
  const sleep = mean(data[current].slp.slice(-7)), debt = Math.max(0, 7 - sleep) * plan.days;
  const arrive = new Date(Date.now() + plan.delay * 2 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `<div class="li"><div><b>Radiation dose</b><div class="mute">${rate > 0 ? 'Career limit reached after about ' + Math.floor(600 / rate) + ' days at this rate.' : 'No exposure.'}</div></div>
      <div style="text-align:right"><b>${dose.toFixed(0)} mSv</b><br><span class="pill ${st}">${pct.toFixed(0)}% of 600</span></div></div>
    <div class="li"><div><b>Bone loss if untreated</b><div class="mute">NASA reports about 1–1.5% of weight-bearing bone density per month, so daily exercise is essential.</div></div>
      <b>~${(Math.min(months, 6) * 1).toFixed(0)}–${(Math.min(months, 6) * 1.5).toFixed(0)}% in ${Math.min(months, 6).toFixed(0)} mo</b></div>
    <div class="li"><div><b>Sleep debt at your ${sleep.toFixed(1)} h</b><div class="mute">Against 7 h. Crews average about 6–6.5 h in flight.</div></div><b>${debt.toFixed(0)} h</b></div>
    <div class="li"><div><b>Ground reply time</b><div class="mute">Question sent now, answer back around ${arrive}. VITAL works onboard without waiting.</div></div><b>${plan.delay * 2} min</b></div>`;
}
const planUpdate = () => { byId('plan-out').innerHTML = planOut(); };
function planSet(key, v, label) { plan[key] = v; if (label) byId(label).textContent = v; planUpdate(); }
function planPreset(n) { [plan.days, plan.rate] = PLAN_PRESETS[n]; render(); }

const SCENARIOS = {     // change per day-of-drift applied over the last 5 days
  flu: ['🤒 Crew flu',         { rhr: 9, temp: .6, slp: -1.3, resp: 2.5, fat: 1.5, ex: -30 }],
  co2: ['💨 CO₂ build-up',      { spo2: -3, hrv: -12, rt: 45, fat: 1, bp: 6 }],
  iso: ['🌑 Isolation stress', { mood: -1.6, str: 1.6, slp: -1, rt: 25, fat: .8 }],
};
function applyScenario(kind) {
  if (kind === 'reset') { data[current] = generateHistory(current); applyLogs(); }
  else for (const k in SCENARIOS[kind][1]) for (let i = DAYS - 5; i < DAYS; i++) {
    let v = data[current][k][i] + SCENARIOS[kind][1][k] * (i - (DAYS - 6)) / 5;
    if (['mood', 'str', 'fat'].includes(k)) v = Math.min(5, Math.max(1, v));
    if (k === 'spo2') v = Math.min(100, v);
    data[current][k][i] = +v.toFixed(2);
  }
  toast(kind === 'reset' ? 'Back to normal' : SCENARIOS[kind][0] + ' applied');
  view = 'sum'; render();
}

function planView(name) {
  return `<h1>Mission</h1><div class="mute">Plan a mission with NASA limits, and run demo scenarios.</div>
    <h2>Mission planner</h2><div class="card">
      <div class="chips">${Object.keys(PLAN_PRESETS).map(p => `<button class="chip" onclick="planPreset('${p}')">${p}</button>`).join('')}</div>
      <label>Mission length: <b id="pl-d">${plan.days}</b> days</label>
      <input type="range" min="10" max="1000" step="10" value="${plan.days}" oninput="planSet('days',+this.value,'pl-d')">
      <label>Dose rate: <b id="pl-r">${plan.rate}</b> mSv/day</label>
      <input type="range" min=".1" max="2" step=".1" value="${plan.rate}" oninput="planSet('rate',+this.value,'pl-r')">
      <label>Shielding benefit: <b id="pl-s">${plan.shield}</b>%</label>
      <input type="range" min="0" max="50" step="5" value="${plan.shield}" oninput="planSet('shield',+this.value,'pl-s')">
      <label>Earth–Mars one-way delay: <b id="pl-l">${plan.delay}</b> min</label>
      <input type="range" min="3" max="22" value="${plan.delay}" oninput="planSet('delay',+this.value,'pl-l')">
      <label style="display:flex;gap:10px;align-items:center"><input type="checkbox" ${plan.spe ? 'checked' : ''} onchange="planSet('spe',this.checked)">Add a solar storm (NASA caps one at 250 mSv)</label>
      <div id="plan-out" style="margin-top:8px">${planOut()}</div></div>
    <h2>Demo scenarios</h2><div class="card"><div class="mute">Inject a health event into ${esc(name.split(' ')[0])}’s last 5 days and watch the scores, alerts and AI react.</div>
      <div class="chips" style="margin-top:10px">${Object.entries(SCENARIOS).map(([k, s]) => `<button class="chip" onclick="applyScenario('${k}')">${s[0]}</button>`).join('')}
        <button class="chip" onclick="applyScenario('reset')">↺ Reset</button></div></div>`;
}

/* ---------- 17. Crew team balance ---------- */
// Team balance = 100 − 2.5 × spread of crew scores − 6 × (5 − average mood). Higher = a more even, upbeat crew.
function crewPulse() {
  const names = Object.keys(CREW);
  if (names.length < 2) return '';
  const scores = names.map(n => analyse(n).score), mood = mean(names.map(n => mean(data[n].mood.slice(-7))));
  const balance = Math.max(0, Math.min(100, Math.round(100 - sd(scores) * 2.5 - (5 - mood) * 6)));
  const doms = Object.keys(DOMAINS);
  return `<h2>Crew pulse</h2><div class="card"><div class="insight"><div class="streak"><b>${balance}</b><span class="mute">team balance</span></div>
    <div class="mute" style="flex:1">Checks that no one is falling behind and that crew mood is steady. NASA names isolation and confinement as a core spaceflight hazard.</div></div>
    <table style="width:100%;margin-top:10px;font-size:13px"><tr><th></th>${doms.map(d => `<th>${d.slice(0, 4)}</th>`).join('')}</tr>
    ${names.map(n => `<tr><td>${esc(n.split(' ')[0])}</td>${doms.map(d => `<td><span class="dot" style="display:inline-block;background:${statusColor(analyse(n).domains[d].status)}"></span></td>`).join('')}</tr>`).join('')}</table></div>`;
}

/* ---------- 18. About / pitch (Space Apps criteria) ---------- */
function pitchView() {
  const sec = (t, body) => `<h2>${t}</h2><div class="card">${body}</div>`;
  const li = a => a.map(x => `<div class="li"><div>${x}</div></div>`).join('');
  return `<h1>About VITAL</h1><div class="mute">An offline health companion for deep-space crews.</div>
    ${sec('The problem', li(['On a Mars mission, ground support is up to 22 minutes away each way, and NASA names radiation, isolation, distance, gravity and closed environments as the core hazards.', 'Population averages miss early, personal changes. A normal heart rate for one person is a warning sign for another.']))}
    ${sec('The solution', li(['Clickable body map, step-by-step how-to-measure guides and a daily health mission for astronauts who are not medical experts.', 'Compares every astronaut with their own baseline (z-scores) across five domains: immune, musculoskeletal, cardiovascular, behavioral and metabolic (blood sugar).', 'Works fully offline: check-ins, pulse and reaction tests, trend forecasts, an AI assistant and reports for the flight surgeon.', 'Mission planner built on NASA limits: 600 mSv career radiation, 250 mSv per solar storm.']))}
    ${sec('Why it is valid', li(['Method: z = (last 3 days − first 7 days) ÷ baseline spread. Amber at z ≥ 1, red at ≥ 2 (adjustable).', 'Reference data from NASA Human Research Program (5 Hazards, Risks, Ongoing Research), NASA-STD-3001, the Twins Study, ISS sleep studies and CSA radiation monitoring. See the Resources tab.', 'Decision support, not diagnosis. Thresholds need flight-surgeon validation.']))}
    ${sec('Beyond space', li(['The same approach fits Antarctic stations, submarines, remote clinics and shift workers: anywhere help is far away.']))}
    ${sec('Demo in 2 minutes', li(['1. Load the demo crew from the welcome screen, then open Crew to show Crew pulse.', '2. Mission tab: run “CO₂ build-up” and watch the alerts.', '3. Assistant: ask “Should I escalate?”.', '4. Mission tab: plan Mars round trip and see the 600 mSv limit.', '5. Reports: download the PDF and CSV.']))}`;
}

applyTheme();
render();
try { if (TEAM && sessionStorage.getItem('vital_open_add')) { sessionStorage.removeItem('vital_open_add'); addProfileSheet(); } } catch (e) { /* ignore */ }
loadLive();   // pull live NASA / space-weather data in the background
