/* Built with AI assistance: parts of this code were written with Claude (Anthropic) and reviewed by the team. Disclosed per NASA Space Apps rules. */
/* ==========================================================
   VITAL — extras (loads before app.js; only uses app globals when called)
   Assistant picker · breathing coach · mood tap · expandable cards
   ========================================================== */
function expand(b) { const x = b.nextElementSibling; x.hidden = !x.hidden; b.textContent = x.hidden ? b.dataset.c : b.dataset.o; }
const moreBtn = (c, o = 'Hide ▴') => `<button class="more-btn" data-c="${c}" data-o="${o}" onclick="expand(this)">${c}</button>`;

/* ----- Assistant picker: built-in (default, no key) or your own API key ----- */
function aiModeSheet() {
  const key = aiMode === 'key';
  sheet(`<h2 style="margin:0">Choose your assistant</h2>
    <div class="mute">Switch any time. VITAL works fully without a key.</div>
    <button class="opt ${key ? '' : 'on'}" onclick="setAiMode('builtin')"><b>Built-in assistant</b> <span class="pill green">default</span>
      <div class="mute">No key, no account. Runs on this device, works offline, and answers from your readings plus NASA reference data.</div></button>
    <button class="opt ${key ? 'on' : ''}" onclick="setAiMode('key')"><b>My own API key</b>
      <div class="mute">Live Claude answers with deeper reasoning. Your Anthropic key stays in this browser only.</div></button>
    <div id="key-box" ${key ? '' : 'hidden'}>
      <label>Anthropic API key</label><input id="ai-key" type="password" placeholder="sk-ant-…" autocomplete="off" value="">
      <div class="tools"><button class="btn" onclick="saveKey()">Save &amp; use</button>${aiKey ? '<button class="btn s" onclick="clearKey()">Remove key</button>' : ''}</div></div>
    <div class="mute" style="margin-top:12px">A shared key can’t be safely shipped in a public app. If you host VITAL for others, set <code>AI_PROXY</code> in app.js to your own server.</div>
    <button class="btn s" onclick="closeSheet()">Close</button>`);
}
function setAiMode(m) {
  if (m === 'key' && !aiKey && !AI_PROXY) { byId('key-box').hidden = false; byId('ai-key').focus(); return; }
  aiMode = m;
  try { localStorage.setItem('vital_aimode', m); } catch (e) { /* ignore */ }
  closeSheet(); toast(m === 'key' ? 'Using your API key' : 'Using the built-in assistant'); render();
}

/* ----- Mood quick-tap ----- */
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
function moodCard() {
  return `<div class="card"><b>How are you feeling?</b><div class="moods">${MOODS.map((e, i) => `<button onclick="moodTap(${i + 1})" aria-label="Mood ${i + 1} of 5">${e}</button>`).join('')}</div></div>`;
}
function moodTap(n) {
  const name = current; data[name].mood[DAYS - 1] = n;
  (logs[name] = logs[name] || []).push({ date: new Date().toLocaleString(), k: new Date().toDateString(), v: { mood: n }, sym: [], note: '' });
  logs[name] = logs[name].slice(-60); saveAll(); toast('Mood logged ' + MOODS[n - 1]); render();
}

/* ----- Box-breathing coach ----- */
let breath = null;
function breatheSheet() {
  sheet(`<h2 style="margin:0">Box breathing</h2><div class="mute">In 4 · hold 4 · out 4 · hold 4. Slows heart rate and eases stress.</div>
    <div class="breath" id="br-c"></div><div class="bigcount" style="font-size:28px" id="br-t">Get ready</div>
    <div class="mute" style="text-align:center" id="br-n">0 cycles</div><button class="btn s" onclick="breatheStop()">Done</button>`);
  const ph = [['Breathe in', 1.5], ['Hold', 1.5], ['Breathe out', 1], ['Hold', 1]]; let i = 0, cyc = 0;
  if (breath) clearInterval(breath);
  const step = () => {
    const c = byId('br-c'); if (!c) { clearInterval(breath); breath = null; return; }
    if (i && i % 4 === 0) byId('br-n').textContent = ++cyc + (cyc === 1 ? ' cycle' : ' cycles');
    byId('br-t').textContent = ph[i % 4][0]; c.style.transform = `scale(${ph[i % 4][1]})`; i++;
  };
  setTimeout(step, 50); breath = setInterval(step, 4000);
}
function breatheStop() { if (breath) clearInterval(breath); breath = null; closeSheet(); }
