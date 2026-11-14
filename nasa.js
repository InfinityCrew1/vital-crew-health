/* Built with AI assistance: parts of this code were written with Claude (Anthropic) and reviewed by the team. Disclosed per NASA Space Apps rules. */
/* ==========================================================
   VITAL — live data layer (loads before app.js)
   NASA DONKI (flares, SEP, geomagnetic storms) · NASA Image Library
   NOAA SWPC storm scales · ISS position (wheretheiss.at)
   Every feed is cached for offline use and fails gracefully.
   ========================================================== */
const NK = 'vital_nasa_key', LIVE_TTL = 30 * 60e3, HOUR = 36e5;
let nasaKey = 'DEMO_KEY', live = null, liveBusy = false;
try { nasaKey = localStorage.getItem(NK) || 'DEMO_KEY'; } catch (e) { /* ignore */ }

// Fetch JSON with a localStorage cache; serve stale data if the network fails
async function getJSON(url, ttl = LIVE_TTL) {
  const ck = 'vital_c_' + url.replace(/api_key=[^&]+/, '');
  let hit = null;
  try { hit = JSON.parse(localStorage.getItem(ck) || 'null'); } catch (e) { /* ignore */ }
  if (hit && Date.now() - hit.t < ttl) return { data: hit.d, t: hit.t, how: 'cached' };
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), d })); } catch (e) { /* quota */ }
    return { data: d, t: Date.now(), how: 'live' };
  } catch (e) {
    if (hit) return { data: hit.d, t: hit.t, how: 'stale' };
    throw e;
  }
}

// Images removed from the live NASA feed (Space Apps rules: no NASA branding / no under-18 likeness).
// KSC-98pc481 was removed at the team's request. Add more NASA IDs here to hide them.
const BLOCKED_NASA_IDS = ['ksc-98pc481'];
const BLOCKED_WORDS = /logo|insignia|emblem|worm|meatball|patch|child|children|kid|kids|student|school|boy|girl|teen|youth|minor|baby|infant/i;
function safeMedia(items) {
  return (items || []).filter(i => {
    const d = (i.data || [])[0] || {};
    if (BLOCKED_NASA_IDS.includes(String(d.nasa_id || '').toLowerCase())) return false;
    return !BLOCKED_WORDS.test([d.title, d.description, (d.keywords || []).join(' ')].join(' '));
  });
}

const ymd = d => d.toISOString().slice(0, 10);
async function loadLive(force) {
  if (liveBusy) return;
  liveBusy = true; paintLive();
  const ttl = force ? 0 : LIVE_TTL, end = new Date(), start = new Date(Date.now() - 7 * 864e5);
  const dn = t => `https://api.nasa.gov/DONKI/${t}?startDate=${ymd(start)}&endDate=${ymd(end)}&api_key=${encodeURIComponent(nasaKey)}`;
  const jobs = {
    flr: ['NASA DONKI · solar flares', dn('FLR'), ttl],
    sep: ['NASA DONKI · solar energetic particles', dn('SEP'), ttl],
    gst: ['NASA DONKI · geomagnetic storms', dn('GST'), ttl],
    scales: ['NOAA SWPC · storm scales now', 'https://services.swpc.noaa.gov/products/noaa-scales.json', ttl],
    iss: ['ISS position', 'https://api.wheretheiss.at/v1/satellites/25544', 0],
    media: ['NASA Image Library', 'https://images-api.nasa.gov/search?q=astronaut%20health%20spaceflight&media_type=image&page_size=18', 6 * HOUR],
  };
  const out = {};
  await Promise.all(Object.entries(jobs).map(async ([k, [label, url, t]]) => {
    try { out[k] = Object.assign(await getJSON(url, t), { label }); } catch (e) { out[k] = { label, how: 'offline', err: e.message }; }
  }));
  live = out; liveBusy = false; paintLive();
}

const L = k => (live && live[k] && live[k].data) || null;
const ageH = t => (Date.now() - new Date(t)) / HOUR;

// Turn raw space weather into a crew-health advisory
function advisory() {
  if (!live || !['flr', 'sep', 'gst', 'scales'].some(k => L(k))) return null;
  const now = (L('scales') || {})['0'] || {}, n = c => (now[c] && +now[c].Scale) || 0;
  const S = n('S'), G = n('G'), R = n('R');
  const arr = k => Array.isArray(L(k)) ? L(k) : [];
  const flares = arr('flr'), xf = flares.filter(f => /^X/i.test(f.classType) && ageH(f.peakTime || f.beginTime) < 48);
  const sep = arr('sep').filter(e => ageH(e.eventTime) < 72), gst = arr('gst');
  const level = S >= 2 || R >= 3 || G >= 4 ? 'red' : S >= 1 || G >= 2 || R >= 2 || xf.length || sep.length ? 'amber' : 'green';
  const base = CREW[current] ? mean(data[current].rad.slice(0, BASELINE_DAYS)) : 0;
  const rad = CREW[current] ? mean(data[current].rad.slice(-3)) : 0;
  const facts = [`NOAA scales now: radiation storm S${S}, geomagnetic G${G}, radio blackout R${R}`,
    `${flares.length} solar flare${flares.length === 1 ? '' : 's'} in 7 days (${flares.filter(f => /^X/i.test(f.classType)).length} X-class)`,
    `${arr('sep').length} energetic-particle event${arr('sep').length === 1 ? '' : 's'} and ${gst.length} geomagnetic storm${gst.length === 1 ? '' : 's'} in 7 days`];
  const actions = { green: ['No change to routine. Keep logging radiation each day.'],
    amber: ['Check the dosimeter and log today’s radiation reading.', 'Postpone non-urgent EVAs; spend rest periods in the best-shielded module.', 'Watch sleep and mood: storm days disrupt both.'],
    red: ['Move to the most shielded area (crew quarters or storm shelter) and stay until all-clear.', 'Log radiation now and alert the flight surgeons.', 'Cancel EVAs and keep exercise indoors.'] }[level];
  if (level !== 'green' && base && rad > base * 1.25) actions.unshift(`Your logged radiation is ${(rad / base).toFixed(1)}× your baseline, which fits the space weather.`);
  return { level, S, G, R, facts, actions,
    head: { green: 'Space weather quiet', amber: 'Active space weather: stay alert', red: 'Elevated space radiation: shelter protocol' }[level] };
}

// Rough South Atlantic Anomaly box: the ISS passes here with higher particle flux
const inSAA = i => i && i.latitude > -50 && i.latitude < 0 && i.longitude > -90 && i.longitude < 40;

// Storm readiness: one 0-100 answer to "how ready is this crew member for a solar storm today?"
// Idea: NASA says hazards interact (e.g. radiation on top of other stressors), so live space weather
// is combined with the person's own domain status. Illustrative scoring, not clinically validated.
function readiness(name) {
  const a = advisory();
  if (!a || !CREW[name] || !data[name]) return null;
  const doms = analyse(name).domains;
  const weather = { green: 0, amber: 20, red: 45 }[a.level];
  const stressed = Object.entries(doms).filter(([, d]) => d.status !== 'green');
  const body = Math.min(40, stressed.reduce((t, [, d]) => t + (d.status === 'red' ? 18 : 8), 0));
  const score = Math.max(5, 100 - weather - body);
  const level = score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red';
  const names = stressed.map(([n]) => n.toLowerCase());
  const note = a.level !== 'green' && names.length
    ? `Space radiation on top of a stressed ${names.join(' and ')} system compounds risk, so shelter early and log how you feel.`
    : a.level !== 'green' ? 'Your own readings are steady; the main risk today is the space weather.'
    : names.length ? `Space weather is quiet. Your ${names.join(' and ')} readings are the thing to watch.` : 'Space weather is quiet and your readings are steady.';
  return { score, level, weather: a.level, stressed: names, note,
    head: { green: 'Ready for a solar storm', amber: 'Be careful if a storm arrives', red: 'Protect yourself first' }[level] };
}
function readinessHTML(name) {
  const r = readiness(name);
  return r ? `<h2>Storm readiness</h2><div class="card adv adv-${r.level}"><div class="li" style="padding-top:0"><div><b style="font-size:17px">${r.head}</b>
      <div class="mute">${esc(r.note)}</div></div>${ring(r.score, statusColor(r.level), 64, 9, r.score)}</div>
      <div class="mute">Score = 100 minus space-weather risk (${esc(r.weather)}) minus your own stressed domains. Illustrative, not clinically validated.</div></div>` : '';
}

function liveStrip() {
  const a = advisory();
  return a ? `<div class="card adv adv-${a.level}" style="cursor:pointer" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){view='live';render()}" onclick="view='live';render()"><b>🛰 ${a.head}</b>
    <div class="mute">${esc(a.facts[0])}. Tap for live NASA data and what to do.</div></div>` : '';
}

const evRows = list => list.map(([t, s]) => `<div class="li"><span>${s}</span><span class="mute">${new Date(t).toLocaleString()}</span></div>`).join('');

function liveHTML(name) {
  if (!live) return '<div class="card"><div class="mute">Loading live data…</div></div>';
  const a = advisory(), iss = L('iss'), items = safeMedia(((L('media') || {}).collection || {}).items).slice(0, 6);
  const ev = [...(Array.isArray(L('flr')) ? L('flr') : []).map(f => [f.peakTime || f.beginTime, `☀️ ${esc(f.classType)} solar flare`]),
    ...(Array.isArray(L('sep')) ? L('sep') : []).map(e => [e.eventTime, '⚡ Solar energetic particle event']),
    ...(Array.isArray(L('gst')) ? L('gst') : []).map(g => [g.startTime, '🧲 Geomagnetic storm, Kp up to ' + Math.max(0, ...(g.allKpIndex || []).map(x => +x.kpIndex || 0))])]
    .filter(e => e[0]).sort((x, y) => new Date(y[0]) - new Date(x[0])).slice(0, 30);
  const st = { live: 'pill green', cached: 'pill amber', stale: 'pill amber', offline: 'pill red' };
  return (a ? `<div class="card adv adv-${a.level}"><b style="font-size:18px">${a.head}</b>
      ${a.facts.map(f => `<div class="mute">• ${esc(f)}</div>`).join('')}
      <div style="margin-top:8px"><b>What to do, ${esc(name.split(' ')[0])}</b>${a.actions.map(x => `<div>→ ${esc(x)}</div>`).join('')}</div></div>`
    : '<div class="card"><div class="mute">No space-weather feed reachable. Nothing live to show; everything else in VITAL still works offline.</div></div>')
    + readinessHTML(name) + (iss && iss.latitude != null ? `<h2>ISS right now</h2><div class="card"><div class="li"><div><b>${(+iss.latitude).toFixed(1)}°, ${(+iss.longitude).toFixed(1)}°</b>
      <div class="mute">${Math.round(iss.altitude)} km up · ${Math.round(iss.velocity).toLocaleString()} km/h · ${esc(iss.visibility)}</div></div>
      <span class="${inSAA(iss) ? 'pill amber' : 'pill green'}">${inSAA(iss) ? 'In South Atlantic Anomaly' : 'Outside SAA'}</span></div>
      <div class="mute">The SAA is a dip in Earth’s magnetic field where the ISS meets more trapped particles. Crossing it is a main source of crew radiation dose.</div></div>` : '')
    + `<h2>Recent solar activity (7 days)</h2><div class="card">${ev.length ? evRows(ev.slice(0, 4)) + (ev.length > 4 ? moreBtn('Show ' + (ev.length - 4) + ' more ▾', 'Show less ▴') + '<div class="xp" hidden>' + evRows(ev.slice(4)) + '</div>' : '') : '<div class="mute">No events reported.</div>'}</div>`
    + (items.length ? `<h2>NASA on astronaut health</h2><div class="thumbs">${items.map(i => {
      const d = (i.data || [])[0] || {}, img = ((i.links || [])[0] || {}).href || '';
      return /^https:\/\//.test(img) ? `<a href="https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id || '')}" target="_blank" rel="noopener"><img src="${esc(img)}" alt="" loading="lazy">${esc(d.title || '')}</a>` : ''; }).join('')}</div>` : '')
    + `<details class="card"><summary><b>Data sources &amp; API key</b></summary>${Object.values(live).map(s => `<div class="li"><span>${esc(s.label)}</span><span><span class="${st[s.how]}">${s.how}</span> <span class="mute">${s.t ? new Date(s.t).toLocaleTimeString() : esc(s.err || '')}</span></span></div>`).join('')}
      <label>NASA API key (free at api.nasa.gov; DEMO_KEY is rate-limited)</label>
      <input id="nk" type="password" placeholder="${nasaKey === 'DEMO_KEY' ? 'Using DEMO_KEY' : 'Key saved'}" autocomplete="off">
      <div class="tools"><button class="btn s" onclick="saveNasaKey()">Save key</button><button class="btn s" onclick="loadLive(true)">Refresh now</button></div></details>
    <div class="mute">Sources: NASA DONKI, NASA Image and Video Library, NOAA SWPC, wheretheiss.at. Decision support, not diagnosis.</div>`;
}

function liveView(name) {
  if (!live && !liveBusy) loadLive();
  return `<h1>Live NASA data</h1><div class="mute">Space weather, ISS position and NASA media, translated into crew-health guidance.</div><div id="live-root">${liveHTML(name)}</div>`;
}

// Update the live panels in place (no full re-render, so scroll position stays)
function paintLive() {
  const r = byId('live-root'), s = byId('live-strip');
  if (r && current) r.innerHTML = liveHTML(current);
  if (s) s.innerHTML = liveStrip();
}

function saveNasaKey() {
  const k = byId('nk').value.trim();
  if (!k) return toast('Paste your key first');
  nasaKey = k;
  try { localStorage.setItem(NK, k); } catch (e) { /* ignore */ }
  toast('Key saved'); loadLive(true);
}
