/* Designed and built by the VITAL team. AI tools (Claude) were used to assist with coding, as disclosed under NASA Space Apps rules. */
/* ==========================================================
   VITAL — health.js (loads before app.js; uses app globals only when called)
   Body map · How-to-measure guide · Mission environment · Daily mission
   Reference ranges are general adult values for decision support, not diagnosis.
   ========================================================== */

/* ----- How to measure each indicator: what, how, why, normal, space effect, when to call ----- */
const MEASURES = {
  bp:   { name: 'Blood pressure', hazard: 'Gravity fields',
    how: 'Rest for 5 minutes. Put the cuff on your upper arm at heart level, stay still and do not talk. Log the top (systolic) number. Take two readings a minute apart and log the second.',
    why: 'Shows how your heart and blood vessels cope with fluid that shifts toward the head in microgravity.',
    normal: 'Under 120 is typical. 120–139 is raised. 140 or more is high.',
    call: 'Two readings of 140 or more, any reading of 180 or more, or any high reading with chest pain, severe headache or vision change.' },
  rhr:  { name: 'Resting heart rate', hazard: 'Gravity fields',
    how: 'Rest 5 minutes. Find the pulse at your wrist or neck and count beats for 30 seconds, then double it. Or use the Count pulse button in Log.',
    why: 'A rising resting pulse is an early sign of illness, dehydration, poor sleep or stress.',
    normal: 'Most healthy adults sit at 50–90 bpm. Trained crew are often 50–65. Compare with your own baseline.',
    call: 'Above 100 or below 40 at rest with dizziness, fainting, chest pain or palpitations, or a steady rise over several days.' },
  hrv:  { name: 'Heart-rate variability (HRV)', hazard: 'Isolation and confinement',
    how: 'Wear the chest strap or wristband while resting or asleep. VITAL compares the average with your own baseline.',
    why: 'Higher HRV usually means a recovered, adaptable body. A falling trend can mean strain, poor sleep or illness.',
    normal: 'There is no universal normal. Your own baseline is what matters.',
    call: 'A steady fall over a week together with fatigue, poor sleep or other flagged readings.' },
  spo2: { name: 'Blood oxygen (SpO₂)', hazard: 'Hostile and closed environments',
    how: 'Warm your hands, clip the pulse oximeter on a fingertip and keep still for 30 seconds. Log the steady number.',
    why: 'Low oxygen or a CO₂ build-up in a closed cabin can show up here before you feel it.',
    normal: '95–100% is normal.',
    call: 'Below 92%, or falling with breathlessness. Also check cabin O₂ and CO₂ and move to fresher air.' },
  resp: { name: 'Respiration rate', hazard: 'Hostile and closed environments',
    how: 'Sit still and count breaths for 60 seconds (one breath is one in-and-out). Do it without trying to change your breathing.',
    why: 'A faster rate can be an early sign of infection, high CO₂ or stress.',
    normal: '12–20 breaths per minute at rest.',
    call: 'Above 24 at rest, laboured breathing, or a steady rise over days.' },
  temp: { name: 'Body temperature', hazard: 'Hostile and closed environments',
    how: 'Use the same thermometer and the same body site at the same time each day, then log it. Skin temperature runs lower (about 33–35 °C) than core temperature (36.1–37.2 °C), so watch the change from your own baseline.',
    why: 'Spaceflight can change immune function, and illness spreads fast in a shared cabin.',
    normal: 'Core 36.1–37.2 °C. Your own steady baseline is the best guide.',
    call: 'Core temperature of 38.0 °C or more, shaking chills, or a rise that lasts more than 24 hours.' },
  glu:  { name: 'Blood glucose (blood sugar)', hazard: 'Hostile and closed environments',
    how: 'Wash and dry your hands. Use the glucometer on a fingertip, ideally in the morning after 8 hours without food. Log the number in mg/dL.',
    why: 'Diet, exercise, stress and microgravity can all change blood sugar, and poor nutrition is a named spaceflight risk.',
    normal: 'Fasting 70–99 mg/dL is normal. 100–125 is raised. 126 or more on repeat is high.',
    call: 'Fasting 126 or more twice, any reading under 70 with sweating, shaking or confusion (eat 15 g of fast sugar and recheck in 15 minutes), or 250+ with strong thirst.' },
  slp:  { name: 'Sleep', hazard: 'Isolation and confinement',
    how: 'Log the hours you slept from your sleep band, or estimate them when you wake up.',
    why: 'Light cycles, noise and workload disturb sleep in space. Poor sleep lowers mood, reaction time and immunity.',
    normal: '7–9 hours for most adults.',
    call: 'Under 5 hours for 3 nights in a row, or needing more sleep aids than your plan allows.' },
  mood: { name: 'Mood, stress and fatigue', hazard: 'Isolation and confinement',
    how: 'Each evening tap a number from 1 to 5 for mood, stress and fatigue. It takes 10 seconds.',
    why: 'Isolation, confinement and distance from home affect behavioral health. A slow slide is easy to miss without a log.',
    normal: 'Mood of 3–5 and stress of 1–3 on most days.',
    call: 'Low mood for 2 weeks, or any thought of self-harm: talk to the crew psychologist now.' },
  ex:   { name: 'Exercise', hazard: 'Gravity fields',
    how: 'Log the minutes of treadmill, cycling or resistance work after each session.',
    why: 'Without gravity, bones and muscles weaken. Exercise is the main countermeasure. ISS crews train for around two hours a day.',
    normal: 'Follow your mission exercise plan, and do not skip rest days when told to.',
    call: 'New or lasting bone, joint or back pain, or being unable to complete your plan.' },
  rt:   { name: 'Reaction time', hazard: 'Hostile and closed environments',
    how: 'Rested and sitting still, press the Reaction test button in Log and tap when the screen changes. Repeat 3 times.',
    why: 'Slow reactions point to fatigue, lack of sleep or high CO₂ before you notice it.',
    normal: 'Roughly 200–300 ms, but your own baseline matters most.',
    call: 'A sudden jump above your baseline with headache or drowsiness: check cabin CO₂ first.' },
  rad:  { name: 'Radiation dose', hazard: 'Space radiation',
    how: 'Read the personal dosimeter at the same time each day and log the daily dose in mSv.',
    why: 'Radiation raises long-term cancer, heart and nervous-system risk. Solar storms can add a large dose quickly.',
    normal: 'NASA sets a career limit of 600 mSv. Watch your own daily rate against your baseline.',
    call: 'During a solar particle event or when the dose is well above your baseline: shelter and alert the flight surgeons.' },
};
const MEASURE_ORDER = ['bp', 'rhr', 'hrv', 'spo2', 'resp', 'temp', 'glu', 'slp', 'mood', 'ex', 'rt', 'rad'];

/* ----- Clickable body regions ----- */
const REGIONS = {
  brain:  { name: 'Brain and mind', icon: '🧠', metrics: ['mood', 'str', 'fat', 'rt', 'slp'], measure: ['mood', 'slp', 'rt'], hazard: 'Isolation and confinement',
    job: 'Thinking, mood, sleep and decision-making.',
    space: 'Isolation, delay from home, broken day-night cycles and CO₂ build-up can dull thinking and lower mood. Fluid shifting toward the head can also change vision.',
    act: 'Keep a sleep routine, journal for 5 minutes, call family, and use the breathing coach.',
    esc: 'Low mood for 2 weeks, thoughts of self-harm, or blurred vision that does not clear.' },
  lungs:  { name: 'Lungs', icon: '🫁', metrics: ['spo2', 'resp'], measure: ['spo2', 'resp'], hazard: 'Hostile and closed environments',
    job: 'Bring oxygen in and move CO₂ out.',
    space: 'In microgravity CO₂ can pool around you instead of drifting away. Cabin dust and air quality also matter.',
    act: 'Check cabin O₂ and CO₂, move to a well-ventilated module, breathe slowly and avoid heavy exertion.',
    esc: 'SpO₂ below 92%, breathlessness, or chest tightness.' },
  heart:  { name: 'Heart and circulation', icon: '❤️', metrics: ['hrv', 'bp', 'rhr'], measure: ['bp', 'rhr', 'hrv'], hazard: 'Gravity fields',
    job: 'Pumps blood to the whole body.',
    space: 'Without gravity, fluid shifts toward the head and the heart does less work. Radiation may add long-term cardiovascular risk.',
    act: 'Ease intensity, hydrate, repeat the standing (orthostatic) check and keep exercising.',
    esc: 'Chest pain, fainting, palpitations, or blood pressure of 140+ on two readings.' },
  gut:    { name: 'Metabolism and nutrition', icon: '🍽️', metrics: ['glu'], measure: ['glu'], hazard: 'Hostile and closed environments',
    job: 'Turns food into energy and keeps blood sugar steady.',
    space: 'Food choice is limited, appetite often drops, and stress and exercise change blood sugar.',
    act: 'Eat balanced meals on schedule, hydrate, and recheck fasting glucose the next morning.',
    esc: 'Fasting glucose of 126+ twice, or a low reading with sweating, shaking or confusion.' },
  muscle: { name: 'Muscles and bones', icon: '🦴', metrics: ['ex', 'pain'], measure: ['ex'], hazard: 'Gravity fields',
    job: 'Hold you up and move you.',
    space: 'Bone and muscle are not loaded in microgravity and can weaken. Bone can lose roughly 1–1.5% a month without exercise.',
    act: 'Do a resistance session and treadmill work every day, and review your load.',
    esc: 'New back, joint or bone pain that does not settle.' },
  immune: { name: 'Immune system (whole body)', icon: '🛡️', metrics: ['temp', 'resp'], measure: ['temp', 'resp'], hazard: 'Hostile and closed environments',
    job: 'Fights infection.',
    space: 'Stress, radiation, disturbed sleep and shared air can change immune function and let latent viruses wake up.',
    act: 'Rest, hydrate, recheck temperature tonight and keep the cabin clean.',
    esc: 'Core temperature of 38.0 °C or more, or a fever that lasts over 24 hours.' },
};

let bodyPick = 'heart', measurePick = '';

const regionStatus = (r, name) => worst(...REGIONS[r].metrics.map(k => stOf(k, data[name])));
const metricNow = (k, name) => mean(data[name][k].slice(-3)), metricBase = (k, name) => mean(data[name][k].slice(0, BASELINE_DAYS));
const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

function figure(name) {
  const sel = r => (bodyPick === r ? ' sel' : '');
  const part = (r, shapes, label) => `<g class="bp${sel(r)}" role="button" tabindex="0" style="fill:${statusColor(regionStatus(r, name))}"
      aria-label="${label}: ${regionStatus(r, name)}${bodyPick === r ? ', selected' : ''}" onclick="bodyGo('${r}')"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();bodyGo('${r}')}">${shapes}</g>`;
  return `<svg viewBox="0 0 200 380" class="figure" role="group" aria-label="Clickable body map">
    ${part('immune', '<rect x="62" y="78" width="76" height="160" rx="26"/>', 'Immune system, whole body')}
    ${part('muscle', '<rect x="34" y="88" width="22" height="128" rx="11"/><rect x="144" y="88" width="22" height="128" rx="11"/><rect x="70" y="236" width="28" height="132" rx="14"/><rect x="102" y="236" width="28" height="132" rx="14"/>', 'Muscles and bones')}
    ${part('brain', '<circle cx="100" cy="42" r="30"/>', 'Brain and mind')}
    ${part('lungs', '<ellipse cx="82" cy="122" rx="15" ry="26"/><ellipse cx="118" cy="122" rx="15" ry="26"/>', 'Lungs')}
    ${part('heart', '<circle cx="100" cy="136" r="13"/>', 'Heart and circulation')}
    ${part('gut', '<ellipse cx="100" cy="190" rx="24" ry="20"/>', 'Metabolism and nutrition')}
  </svg>`;
}
function bodyGo(r) { bodyPick = r; render(); }

function bodyView(name) {
  const r = REGIONS[bodyPick], st = regionStatus(bodyPick, name);
  const rows = r.metrics.map(k => {
    const s = stOf(k, data[name]);
    return `<div class="li"><span>${METRICS[k][0]}</span><span style="display:flex;gap:8px;align-items:center">${sparkline(data[name][k], statusColor(s))}<b>${fmt(metricNow(k, name))} ${METRICS[k][1]}</b>
      <span class="pill ${s}">${s}</span></span></div><div class="mute" style="margin:-4px 0 6px">Your baseline ${fmt(metricBase(k, name))} ${METRICS[k][1]}</div>`;
  }).join('');
  const chips = Object.keys(REGIONS).map(k => `<button class="chip ${k === bodyPick ? 'on' : ''}" onclick="bodyGo('${k}')"><span aria-hidden="true">${REGIONS[k].icon}</span> ${REGIONS[k].name}</button>`).join('');
  return `<h1>Body map</h1><div class="mute">Tap a body part to see how it is doing, why space affects it, and what to do. Colors follow your own baseline.</div>
    ${envCard()}
    <div class="body-wrap">
      <div class="card body-fig">${figure(name)}<div class="mute" style="text-align:center">Green steady · amber watch · red act</div></div>
      <div class="body-info">
        <div class="card adv adv-${st}"><div class="li" style="padding-top:0"><b style="font-size:18px"><span aria-hidden="true">${r.icon}</span> ${r.name}</b><span class="pill ${st}">${st}</span></div>
          <div class="mute">${r.job}</div></div>
        <div class="card"><b>Your readings</b>${rows}</div>
        <div class="card"><p style="margin:0 0 8px"><b>Why space matters:</b> ${r.space}</p>
          <p style="margin:0 0 8px"><b>NASA hazard:</b> ${r.hazard}</p>
          <p style="margin:0 0 8px"><b>What to do:</b> ${r.act}</p>
          <p style="margin:0 0 8px"><b>Call the flight surgeon if:</b> ${r.esc}</p>
          <div class="tools">${r.measure.map(k => `<button class="btn s" onclick="measurePick='${k}';view='measure';render()">How to measure ${esc(MEASURES[k].name.split(' (')[0].toLowerCase())}</button>`).join('')}
            <button class="btn s" onclick="view='care';render()">First-response guides</button></div></div>
      </div>
    </div>
    <div class="chips" style="margin-top:6px">${chips}</div>
    <div class="mute">Decision support, not diagnosis. Reference ranges are general adult values.</div>`;
}

function measureView(name) {
  const cards = MEASURE_ORDER.map(k => {
    const m = MEASURES[k], s = stOf(k, data[name]);
    return `<details class="card" ${k === measurePick ? 'open' : ''}><summary><b>${m.name}</b>
      <span class="pill ${s}" style="margin-left:8px">${fmt(metricNow(k, name))} ${METRICS[k][1]} · ${s}</span></summary>
      <p><b>How to measure:</b> ${m.how}</p><p><b>Why it matters in space:</b> ${m.why}</p>
      <p><b>What is normal:</b> ${m.normal}</p><p><b>NASA hazard:</b> ${m.hazard}</p>
      <p><b>Call the flight surgeon when:</b> ${m.call}</p>
      <button class="btn s" onclick="view='log';render()">Log it now</button></details>`;
  }).join('');
  measurePick = '';
  return `<h1>How to measure</h1><div class="mute">Step-by-step help for every indicator: how to take it, why it matters in space, what is normal and when to call for help. No medical training needed.</div>${cards}
    <div class="mute">Based on NASA Human Research Program hazards and general adult reference ranges. Decision support, not diagnosis.</div>`;
}

/* ----- Mission environment ----- */
const ENVS = {
  craft:   ['🚀', 'Spacecraft in transit', 'Deep-space flight, for example to the Moon or Mars.',
    ['Radiation outside Earth’s magnetic field, with no quick escape from solar storms.', 'Distance from Earth: Mars signals take up to about 22 minutes one way, so you decide first.', 'A small shared cabin for months.'],
    ['Log the dosimeter every day.', 'Keep a sleep routine and log mood.', 'Practice self-assessment without waiting for ground.']],
  station: ['🛰', 'Space station (low Earth orbit)', 'For example the ISS.',
    ['Microgravity: bone and muscle loss and fluid shifting to the head.', 'Passes through the South Atlantic Anomaly add radiation dose.', 'CO₂ can pool near you in microgravity.'],
    ['Exercise about two hours a day.', 'Check CO₂ if you have a headache.', 'Report any change in vision.']],
  rover:   ['🚙', 'Rover or surface traverse', 'Days away from base in a small pressurized vehicle.',
    ['A tiny shared cabin for days.', 'Vibration, dust and little room to exercise.', 'Help is hours or days away.'],
    ['Stretch every few hours and hydrate.', 'Log sleep, and glucose if you skip meals.', 'Clean dust off suits and surfaces.']],
  base:    ['🌙', 'Moon or Mars base', 'A long stay on a planetary surface.',
    ['Partial gravity (Moon about 1/6, Mars about 3/8 of Earth) loads bones less than Earth does.', 'Abrasive dust and little natural radiation shielding.', 'Isolation, plus a signal delay on Mars.'],
    ['Do weight-bearing exercise daily.', 'Control dust and practice radiation-shelter drills.', 'Keep contact with home on a schedule.']],
};
let env = 'station'; try { env = localStorage.getItem('vital_env') || 'station'; } catch (e) { /* ignore */ }
function setEnv(k) { env = k; try { localStorage.setItem('vital_env', k); } catch (e) { /* ignore */ } render(); }
function envCard() {
  const e = ENVS[env] || ENVS.station;
  return `<div class="card"><b>Where are you?</b><div class="chips" style="margin:8px 0;flex-wrap:wrap;overflow:visible">${Object.keys(ENVS).map(k => `<button class="chip ${k === env ? 'on' : ''}" aria-pressed="${k === env}" onclick="setEnv('${k}')"><span aria-hidden="true">${ENVS[k][0]}</span> ${ENVS[k][1]}</button>`).join('')}</div>
    <div class="mute">${e[2]}</div>
    <details><summary><b>Top risks here and your routine</b></summary><div><b>Risks</b>${e[3].map(t => `<div class="mute">• ${t}</div>`).join('')}</div>
      <div style="margin-top:6px"><b>Routine</b>${e[4].map(t => `<div class="mute">→ ${t}</div>`).join('')}</div></details></div>`;
}

/* ----- Daily mission: prompts + a little game ----- */
const DAILY = ['bp', 'spo2', 'rhr', 'temp', 'glu', 'slp', 'mood'];
function dailyMission(name) {
  const got = new Set();
  (logs[name] || []).filter(l => l.k === todayKey()).forEach(l => Object.keys(l.v).forEach(k => got.add(k)));
  const todo = DAILY.filter(k => !got.has(k)), done = DAILY.length - todo.length, e = ENVS[env] || ENVS.station;
  return `<h2>Daily health mission</h2><div class="card"><div class="li" style="padding-top:0"><div><b>${todo.length ? `${todo.length} measurement${todo.length === 1 ? '' : 's'} still due today` : '✓ Mission complete. Great work!'}</b>
    <div class="mute">${done} of ${DAILY.length} done · ${e[0]} ${e[1]}</div></div>${ring(Math.round(done / DAILY.length * 100), '#34c759', 56, 8, done + '/' + DAILY.length)}</div>
    ${todo.length ? `<div class="chips" style="margin:8px 0;flex-wrap:wrap;overflow:visible">${todo.map(k => `<button class="chip" onclick="measurePick='${k}';view='measure';render()">${esc(MEASURES[k].name.split(' (')[0])}</button>`).join('')}</div>
    <div class="tools"><button class="btn s" onclick="view='log';render()">Log now</button></div>` : ''}
    <div class="mute">Today’s routine: ${e[4][0]}</div></div>`;
}

/* ----- Sidebar slider: the nav scrolls, and the current section is kept in view ----- */
function scrollSideToActive() {
  const s = byId('side'), on = s && s.querySelector('.on');
  if (!on) return;
  if (on.offsetTop < s.scrollTop || on.offsetTop + on.offsetHeight > s.scrollTop + s.clientHeight)
    s.scrollTop = on.offsetTop - (s.clientHeight - on.offsetHeight) / 2;
}
