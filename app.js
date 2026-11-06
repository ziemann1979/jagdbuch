'use strict';
/* Jagdbuch – Abschüsse, Ansitze und Sichtungen erfassen.
   Alle Daten liegen ausschließlich lokal auf dem Gerät (IndexedDB).
   Es gibt keinen Server und keine Übertragung – nur die Kartenbilder werden geladen. */

const APP_VERSION = '1.1.2';
const BACKUP_FORMAT = 1;

/* ---------------- Stammdaten ---------------- */
const G = { SCH:'Schalenwild', RAUB:'Raubwild', NIED:'Niederwild', FED:'Federwild', OST:'Osteuropa / Nordeuropa', AFR:'Afrika', EIG:'Eigene' };
const W = (gruppe, names, fav=[]) => names.map(n => ({ name:n, gruppe, fav: fav.includes(n), hidden:false }));
const DEFAULT_WILD = [
  ...W(G.SCH, ['Rehwild','Schwarzwild','Rotwild','Damwild','Sikawild','Muffelwild','Gamswild','Steinwild'], ['Rehwild','Schwarzwild','Rotwild','Damwild']),
  ...W(G.RAUB, ['Fuchs','Dachs','Waschbär','Marderhund','Steinmarder','Baummarder','Iltis','Wolf','Luchs','Wildkatze','Goldschakal'], ['Fuchs','Dachs','Waschbär']),
  ...W(G.NIED, ['Feldhase','Wildkaninchen','Nutria','Bisam','Biber'], ['Feldhase']),
  ...W(G.FED, ['Fasan','Rebhuhn','Stockente','Graugans','Kanadagans','Nilgans','Ringeltaube','Waldschnepfe','Rabenkrähe','Elster','Kormoran']),
  ...W(G.OST, ['Elch','Wisent','Braunbär','Auerhahn','Birkhahn','Haselhuhn','Schneehase']),
  ...W(G.AFR, ['Kudu','Oryx (Gemsbok)','Springbock','Impala','Streifengnu','Weißschwanzgnu','Elenantilope','Kuhantilope (Hartebeest)','Blessbock','Wasserbock','Riedbock','Nyala','Buschbock','Ducker','Steinböckchen','Warzenschwein','Buschschwein','Zebra','Giraffe','Kaffernbüffel','Leopard','Löwe','Elefant','Flusspferd','Krokodil','Schabrackenschakal','Pavian','Perlhuhn','Frankolin']),
  ...W(G.EIG, ['Sonstiges'])
];
const HS_TYPES = ['Hochsitz','Kanzel','Leiter','Drückjagdbock','Bodensitz','Schirm','Kirrung','Salzlecke','Wildkamera','Sonstiges'];
const WIND = ['', 'N','NO','O','SO','S','SW','W','NW','umlaufend','windstill'];
const GESCHL = ['', 'männlich','weiblich','unbekannt'];
const ALTER = ['Jungtier (Kitz/Kalb/Frischling)','Jährling / Schmaltier / Überläufer','mehrjährig','alt','unbekannt'];

/* ---------------- Helfer ---------------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = n => String(n).padStart(2,'0');
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtD = s => s ? `${s.slice(8,10)}.${s.slice(5,7)}.${s.slice(0,4)}` : '';
const fmtT = s => s ? s.slice(11,16) : '';
const fmtDT = s => s ? `${fmtD(s)} ${fmtT(s)}` : '';
const fmtPos = p => p && p.lat != null ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : '';
const num = v => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
function jagdjahr(s){ if(!s) return ''; const y = +s.slice(0,4), m = +s.slice(5,7); const a = m >= 4 ? y : y-1; return `${a}/${pad((a+1)%100)}`; }
function dur(a, b){ const ms = (b ? new Date(b) : new Date()) - new Date(a); if (!(ms >= 0)) return ''; const m = Math.floor(ms/60000); return `${Math.floor(m/60)}:${pad(m%60)} h`; }
function dist(a, b){ const R=6371e3, t=Math.PI/180; const x = Math.sin((b.lat-a.lat)*t/2)**2 + Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin((b.lng-a.lng)*t/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
const fmtDist = m => m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`;
const byDateDesc = k => (a,b) => (b[k]||'').localeCompare(a[k]||'');

/* ---------------- Datenbank (IndexedDB) ---------------- */
const STORES = ['reviere','hochsitze','ansitze','sichtungen','abschuesse','fotos','settings'];
let _db;
function db(){
  if (!_db) _db = new Promise((res, rej) => {
    const r = indexedDB.open('jagdbuch', 1);
    r.onupgradeneeded = () => { const d = r.result; for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: s === 'settings' ? 'key' : 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return _db;
}
function tx(store, mode, fn){
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store); let out;
    const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const dbAll = s => tx(s, 'readonly', st => st.getAll());
const dbGet = (s, id) => tx(s, 'readonly', st => st.get(id));
const dbPut = (s, o) => tx(s, 'readwrite', st => st.put(o));
const dbDel = (s, id) => tx(s, 'readwrite', st => st.delete(id));
const dbClear = s => tx(s, 'readwrite', st => st.clear());

const S = { reviere:[], hochsitze:[], ansitze:[], sichtungen:[], abschuesse:[], settings:{} };
async function loadAll(){
  for (const k of ['reviere','hochsitze','ansitze','sichtungen','abschuesse']) S[k] = await dbAll(k);
  S.settings = {}; (await dbAll('settings')).forEach(x => S.settings[x.key] = x.value);
  if (!Array.isArray(S.settings.wildarten)) await setSetting('wildarten', DEFAULT_WILD);
}
async function setSetting(key, value){ S.settings[key] = value; await dbPut('settings', { key, value }); }
async function save(store, o){
  const now = new Date().toISOString();
  if (!o.id){ o.id = uid(); o.createdAt = now; }
  o.updatedAt = now;
  await dbPut(store, o);
  const a = S[store], i = a.findIndex(x => x.id === o.id);
  if (i >= 0) a[i] = o; else a.push(o);
  return o;
}
async function remove(store, id){ await dbDel(store, id); S[store] = S[store].filter(x => x.id !== id); }
const find = (store, id) => S[store].find(x => x.id === id);

/* ---------------- UI-Grundbausteine ---------------- */
let toastTimer;
function toast(msg, action, onAction, ms=3500){
  const t = $('#toast'); t.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action)}</button>` : '');
  t.classList.remove('hidden'); clearTimeout(toastTimer);
  if (action) t.querySelector('button').onclick = () => { t.classList.add('hidden'); onAction(); };
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
function actionSheet(title, items){
  const box = $('#actions .actions-box');
  box.innerHTML = `<div class="grp">${title ? `<div class="ttl">${esc(title)}</div>` : ''}${items.map((it,i) => `<button data-i="${i}">${esc(it.label)}</button>`).join('')}</div><button class="cancel">Abbrechen</button>`;
  $('#actions').classList.remove('hidden');
  const close = () => $('#actions').classList.add('hidden');
  box.onclick = e => { const b = e.target.closest('button'); if (!b) return; close(); if (b.dataset.i != null) items[+b.dataset.i].fn(); };
  $('#actions').onclick = e => { if (e.target.id === 'actions') close(); };
}

let sheetCfg = null;
function openSheet({ title, body, saveLabel='Speichern', onSave, onClose }){
  sheetCfg = { onSave, onClose };
  $('#sheet-title').textContent = title;
  const sb = $('#sheet-save'); sb.textContent = saveLabel || ''; sb.classList.toggle('hidden', !onSave);
  $('#sheet-cancel').textContent = onSave ? 'Abbrechen' : 'Schließen';
  const b = $('#sheet-body'); b.onclick = null; b.innerHTML = ''; if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  b.scrollTop = 0; $('#sheet').classList.remove('hidden');
}
function closeSheet(){ $('#sheet').classList.add('hidden'); const c = sheetCfg; sheetCfg = null; c?.onClose?.(); }
$('#sheet-cancel').onclick = closeSheet;
$('#sheet-save').onclick = async () => {
  if (!sheetCfg?.onSave) return;
  const btn = $('#sheet-save'); btn.disabled = true;
  try { const r = await sheetCfg.onSave(); if (r !== false){ sheetCfg.onClose = null; closeSheet(); } }
  catch(e){ console.error(e); toast('Fehler beim Speichern: ' + e.message); }
  finally { btn.disabled = false; }
};

function showPhoto(f){
  const v = $('#photo-view'); $('img', v).src = f.data;
  $('.photo-meta', v).textContent = [f.name, f.taken ? 'aufgenommen ' + new Date(f.taken).toLocaleString('de-DE') : ''].filter(Boolean).join(' · ') + ' — tippen zum Schließen';
  v.classList.remove('hidden'); v.onclick = () => v.classList.add('hidden');
}

/* ---------------- GPS ---------------- */
let lastFix = null;
function getGPS(){
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('GPS nicht verfügbar'));
    navigator.geolocation.getCurrentPosition(
      p => { lastFix = { lat:p.coords.latitude, lng:p.coords.longitude, acc:p.coords.accuracy, t:Date.now() }; res(lastFix); },
      e => rej(new Error(e.code === 1 ? 'Standortzugriff verweigert – in den iPhone-Einstellungen erlauben' : 'Kein GPS-Signal')),
      { enableHighAccuracy:true, timeout:20000, maximumAge:15000 });
  });
}

/* ---------------- Fotos ---------------- */
async function makeFoto(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Bild nicht lesbar')); i.src = url; });
    const max = 1600, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth*sc); c.height = Math.round(img.naturalHeight*sc);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { id:uid(), data:c.toDataURL('image/jpeg', 0.8), name:file.name || '', taken:file.lastModified ? new Date(file.lastModified).toISOString() : null };
  } finally { URL.revokeObjectURL(url); }
}

/* ---------------- Wildarten ---------------- */
const wildarten = () => S.settings.wildarten || [];
function wildOptions(selected){
  const groups = {};
  for (const w of wildarten()) if (!w.hidden || w.name === selected) (groups[w.gruppe] ||= []).push(w.name);
  if (selected && !wildarten().some(w => w.name === selected)) (groups['Eigene'] ||= []).push(selected);
  return `<option value="">– wählen –</option>` + Object.entries(groups).map(([g, ns]) =>
    `<optgroup label="${esc(g)}">${ns.map(n => `<option ${n===selected?'selected':''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')
    + `<option value="__new">＋ Neue Wildart …</option>`;
}
async function addWildart(name, gruppe='Eigene'){
  name = (name||'').trim(); if (!name) return null;
  const list = wildarten().slice();
  const ex = list.find(w => w.name.toLowerCase() === name.toLowerCase());
  if (ex){ ex.hidden = false; await setSetting('wildarten', list); return ex.name; }
  list.push({ name, gruppe, fav:false, hidden:false }); await setSetting('wildarten', list); return name;
}

/* ---------------- Formular-Baukasten ---------------- */
function selOpts(list, val, empty){ return (empty != null ? `<option value="">${esc(empty)}</option>` : '') + list.map(o => { const v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : (o || '–'); return `<option value="${esc(v)}" ${String(v)===String(val??'')?'selected':''}>${esc(l)}</option>`; }).join(''); }
const revierOpts = v => selOpts(S.reviere.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(r => ({ v:r.id, l:r.name + (r.land ? ` (${r.land})` : '') })), v, '– kein Revier –');
function hochsitzOpts(v, near){
  let hs = S.hochsitze.slice();
  if (near) hs.sort((a,b) => dist(near,a) - dist(near,b)); else hs.sort((a,b) => a.name.localeCompare(b.name));
  return selOpts(hs.map(h => ({ v:h.id, l:h.name + (near ? ` · ${fmtDist(dist(near,h))}` : (h.revierId && find('reviere',h.revierId) ? ` · ${find('reviere',h.revierId).name}` : '')) })), v, '– kein Hochsitz –');
}

function openForm({ title, fields, values={}, onSave, onDelete, deleteLabel='Löschen' }){
  const form = document.createElement('div'); form.className = 'form';
  const st = {};       // Zustand komplexer Felder
  const html = [];
  for (const f of fields){
    if (f.section){ html.push(`<h3 class="fsec">${esc(f.section)}</h3>`); continue; }
    if (f.row){ html.push('<div class="grid2">'); continue; }
    if (f.endrow){ html.push('</div>'); continue; }
    const v = values[f.key];
    const lab = `<span>${esc(f.label)}</span>`;
    switch (f.type){
      case 'textarea': html.push(`<label class="field">${lab}<textarea name="${f.key}" placeholder="${esc(f.ph||'')}">${esc(v)}</textarea></label>`); break;
      case 'datetime': html.push(`<label class="field">${lab}<input type="datetime-local" name="${f.key}" value="${esc(v)}"></label>`); break;
      case 'number': html.push(`<label class="field">${lab}<input type="text" inputmode="decimal" name="${f.key}" value="${esc(v ?? '')}" placeholder="${esc(f.ph||'')}"></label>`); break;
      case 'int': html.push(`<label class="field">${lab}<input type="number" inputmode="numeric" min="0" name="${f.key}" value="${esc(v ?? '')}"></label>`); break;
      case 'select': html.push(`<label class="field">${lab}<select name="${f.key}">${selOpts(f.options, v)}</select></label>`); break;
      case 'wildart': html.push(`<label class="field">${lab}<select name="${f.key}" data-wild>${wildOptions(v)}</select></label>`); break;
      case 'revier': html.push(`<label class="field">${lab}<select name="${f.key}">${revierOpts(v)}</select></label>`); break;
      case 'hochsitz': html.push(`<label class="field">${lab}<select name="${f.key}" data-hs>${hochsitzOpts(v, f.near)}</select></label>`); break;
      case 'check': html.push(`<label class="check"><input type="checkbox" name="${f.key}" ${v?'checked':''}> ${esc(f.label)}</label>`); break;
      case 'list': html.push(`<label class="field">${lab}<input type="text" name="${f.key}" list="dl-${f.key}" value="${esc(v)}"><datalist id="dl-${f.key}">${f.options.map(o=>`<option value="${esc(o)}">`).join('')}</datalist></label>`); break;
      case 'position':
        st[f.key] = v && v.lat != null ? { lat:v.lat, lng:v.lng } : null;
        html.push(`<div class="field"><span>${esc(f.label)}</span><div class="pos" data-pos="${f.key}"><div class="val"></div><div class="btnrow"><button type="button" class="btn" data-f="gps">📍 GPS</button><button type="button" class="btn" data-f="map">🗺️ Karte</button><button type="button" class="btn" data-f="clr">✕</button></div></div></div>`); break;
      case 'photos':
        st[f.key] = { ids:(v||[]).slice(), added:[], removed:[], cache:{} };
        html.push(`<div class="field"><span>${esc(f.label)}</span><div class="photos" data-photos="${f.key}"></div><div class="hint">Fotos werden verkleinert in der App gespeichert, damit sie beim Gerätewechsel im Backup mitwandern.</div></div>`); break;
      case 'boundary':
        st[f.key] = Array.isArray(v) && v.length ? v.map(r => r.map(p => [...p])) : null;
        html.push(`<div class="field"><span>${esc(f.label)}</span><div class="pos" data-bnd="${f.key}"><div class="val"></div>
          <div class="btnrow"><button type="button" class="btn" data-f="draw">✏️ Zeichnen</button><button type="button" class="btn" data-f="imp">📂 Import</button><button type="button" class="btn" data-f="clr">✕</button></div>
          <input type="file" hidden></div><div class="hint">Import: KML (Google Earth), GPX oder GeoJSON. Beim Zeichnen kannst du die Grenze auch ablaufen und GPS-Punkte setzen.</div></div>`); break;
      default: html.push(`<label class="field">${lab}<input type="text" name="${f.key}" value="${esc(v)}" placeholder="${esc(f.ph||'')}"></label>`);
    }
  }
  if (onDelete) html.push(`<button type="button" class="btn danger block" data-f="del" style="margin-top:28px">${esc(deleteLabel)}</button>`);
  form.innerHTML = html.join('');

  // Positionsfelder
  const renderPos = key => { const el = $(`[data-pos="${key}"] .val`, form); const p = st[key]; el.innerHTML = p ? esc(fmtPos(p)) : '<span class="muted">keine Position</span>'; };
  for (const el of $$('[data-pos]', form)){
    const key = el.dataset.pos; renderPos(key);
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      if (b.dataset.f === 'clr'){ st[key] = null; renderPos(key); }
      if (b.dataset.f === 'gps'){ b.disabled = true; b.textContent = '⏳'; try { const p = await getGPS(); st[key] = { lat:p.lat, lng:p.lng }; renderPos(key); toast(`Position übernommen (± ${Math.round(p.acc)} m)`); } catch(err){ toast(err.message); } b.disabled = false; b.textContent = '📍 GPS'; }
      if (b.dataset.f === 'map'){ const p = await pickPosition(st[key]); if (p){ st[key] = p; renderPos(key); } }
    });
  }
  // Grenzfelder
  const renderBnd = key => { const el = $(`[data-bnd="${key}"] .val`, form), g = st[key];
    el.innerHTML = g && g.length ? `${g.length} Fläche${g.length > 1 ? 'n' : ''} · ${g.reduce((a,r) => a + r.length, 0)} Punkte · <b>${fmtArea(g)}</b>` : '<span class="muted">keine Grenze eingezeichnet</span>'; };
  for (const el of $$('[data-bnd]', form)){
    const key = el.dataset.bnd; renderBnd(key);
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-f]'); if (!b) return;
      if (b.dataset.f === 'clr'){ if (st[key] && !confirm('Reviergrenze entfernen?')) return; st[key] = null; renderBnd(key); }
      if (b.dataset.f === 'draw'){ const r = await drawBoundary(st[key], values.id); if (r){ st[key] = r.length ? r : null; renderBnd(key); } }
      if (b.dataset.f === 'imp') $('input[type=file]', el).click();
    });
    $('input[type=file]', el).onchange = async ev => {
      const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
      try {
        const rings = parseBoundaryFile(await file.text());
        if (!rings.length){ toast('Keine Fläche in der Datei gefunden'); return; }
        const r = await drawBoundary(rings, values.id, `${rings.length} Fläche(n) aus „${file.name}“ – prüfen und „Fertig“ tippen`);
        if (r){ st[key] = r.length ? r : null; renderBnd(key); }
      } catch(err){ toast('Import fehlgeschlagen: ' + err.message); }
    };
  }
  // Fotofelder
  const renderPhotos = async key => {
    const el = $(`[data-photos="${key}"]`, form), s = st[key];
    for (const id of s.ids) if (!s.cache[id]) s.cache[id] = await dbGet('fotos', id);
    const all = [...s.ids.map(id => s.cache[id]).filter(Boolean), ...s.added];
    el.innerHTML = all.map(f => `<div class="ph" data-id="${f.id}"><img src="${f.data}" alt=""><button type="button" data-f="rm">✕</button></div>`).join('')
      + `<label class="add">＋<input type="file" accept="image/*" multiple hidden></label>`;
    $('input', el).onchange = async ev => {
      const files = [...ev.target.files]; if (!files.length) return; toast('Fotos werden übernommen …');
      for (const file of files){ try { s.added.push(await makeFoto(file)); } catch(e){ toast(e.message); } }
      renderPhotos(key);
    };
    el.onclick = e => {
      const ph = e.target.closest('.ph'); if (!ph) return; const id = ph.dataset.id;
      if (e.target.dataset.f === 'rm'){
        if (!confirm('Foto entfernen?')) return;
        if (s.ids.includes(id)){ s.ids = s.ids.filter(x => x !== id); s.removed.push(id); } else s.added = s.added.filter(x => x.id !== id);
        renderPhotos(key);
      } else showPhoto(s.cache[id] || s.added.find(x => x.id === id));
    };
  };
  for (const el of $$('[data-photos]', form)) renderPhotos(el.dataset.photos);

  // Wildart „Neu …“
  for (const sel of $$('select[data-wild]', form)) sel.addEventListener('change', async () => {
    if (sel.value !== '__new') return;
    const n = prompt('Name der neuen Wildart:');
    const name = await addWildart(n);
    sel.innerHTML = wildOptions(name || '');
  });
  // Hochsitz gewählt → Revier & Position übernehmen
  for (const sel of $$('select[data-hs]', form)) sel.addEventListener('change', () => {
    const h = find('hochsitze', sel.value); if (!h) return;
    const rv = $('select[name="revierId"]', form); if (rv && h.revierId) rv.value = h.revierId;
    for (const f of fields) if (f.type === 'position' && f.fromHochsitz && !st[f.key]){ st[f.key] = { lat:h.lat, lng:h.lng }; renderPos(f.key); }
  });
  if (onDelete) $('[data-f="del"]', form).onclick = async () => { if (confirm('Wirklich löschen? Das kann nicht rückgängig gemacht werden.')){ await onDelete(); sheetCfg.onClose = null; closeSheet(); refreshAll(); } };

  const read = () => {
    const out = {};
    for (const f of fields){
      if (!f.key) continue;
      const el = form.querySelector(`[name="${f.key}"]`);
      if (f.type === 'position' || f.type === 'boundary') out[f.key] = st[f.key];
      else if (f.type === 'photos') out[f.key] = st[f.key];
      else if (f.type === 'check') out[f.key] = el.checked;
      else if (f.type === 'number') out[f.key] = num(el.value);
      else if (f.type === 'int') out[f.key] = el.value === '' ? null : parseInt(el.value, 10);
      else out[f.key] = el.value === '__new' ? '' : el.value.trim();
    }
    return out;
  };
  openSheet({ title, body:form, onSave: async () => { const r = await onSave(read()); if (r !== false) refreshAll(); return r; } });
}
async function commitPhotos(ph){
  if (!ph) return [];
  for (const f of ph.added) await dbPut('fotos', f);
  for (const id of ph.removed) await dbDel('fotos', id);
  return [...ph.ids, ...ph.added.map(f => f.id)];
}

/* ---------------- Entitäten: Formulare ---------------- */
function editRevier(r={}){
  openForm({ title: r.id ? 'Revier bearbeiten' : 'Neues Revier', values:r,
    fields:[ {key:'name',label:'Name',ph:'z. B. Eigenjagd Hagen-Nord'}, {key:'land',label:'Land / Region',ph:'z. B. Deutschland, Namibia, Belarus'},
      {key:'grenzen',label:'Reviergrenze',type:'boundary'}, {key:'notiz',label:'Notizen',type:'textarea'} ],
    onSave: async v => {
      if (!v.name){ toast('Bitte einen Namen eingeben'); return false; }
      const o = await save('reviere', { ...r, ...v, grenzen: v.grenzen || [] });
      if (o.grenzen.length && !(r.grenzen && r.grenzen.length)) setTimeout(() => showRevierOnMap(o.id), 50);
    },
    onDelete: r.id ? async () => { await remove('reviere', r.id); } : null });
}
async function editHochsitz(h={}, pos){
  const near = pos || null;
  const values = { typ:'Hochsitz', revierId: revierAt(near) || S.settings.lastRevier || '', ...h, pos: h.id ? { lat:h.lat, lng:h.lng } : near };
  openForm({ title: h.id ? 'Hochsitz bearbeiten' : 'Neuer Hochsitz', values,
    fields:[ {key:'name',label:'Name / Nummer',ph:'z. B. Kanzel am Buchenhang'}, {key:'typ',label:'Art',type:'select',options:HS_TYPES},
      {key:'revierId',label:'Revier',type:'revier'}, {key:'pos',label:'Position',type:'position'},
      {key:'notiz',label:'Notizen',type:'textarea',ph:'Zustand, Schussrichtungen, Anfahrt …'} ],
    onSave: async v => {
      if (!v.name){ toast('Bitte einen Namen eingeben'); return false; }
      if (!v.pos){ toast('Bitte eine Position festlegen'); return false; }
      const { pos:p, ...rest } = v; await save('hochsitze', { ...h, ...rest, lat:p.lat, lng:p.lng });
      if (v.revierId) setSetting('lastRevier', v.revierId);
    },
    onDelete: h.id ? async () => { await remove('hochsitze', h.id); } : null });
}
async function editAbschuss(a={}, pre={}){
  const ph = a.id ? null : lastFix;
  const values = { zeit: nowLocal(), revierId: revierAt(pre.pos) || S.settings.lastRevier || '', ...pre, ...a,
    pos: a.id ? (a.lat != null ? { lat:a.lat, lng:a.lng } : null) : (pre.pos || null) };
  openForm({ title: a.id ? 'Abschuss bearbeiten' : 'Abschuss erfassen', values,
    fields:[
      {key:'zeit',label:'Datum & Uhrzeit',type:'datetime'}, {key:'wildart',label:'Wildart',type:'wildart'},
      {row:1}, {key:'geschlecht',label:'Geschlecht',type:'select',options:GESCHL}, {key:'gewicht',label:'Gewicht (kg, aufgebr.)',type:'number'}, {endrow:1},
      {key:'alter',label:'Altersklasse',type:'list',options:ALTER},
      {section:'Ort'}, {key:'revierId',label:'Revier',type:'revier'}, {key:'hochsitzId',label:'Hochsitz / Stand',type:'hochsitz',near:ph},
      {key:'pos',label:'Position (Anschuss / Erlegungsort)',type:'position',fromHochsitz:true},
      {section:'Schuss'}, {row:1}, {key:'entfernung',label:'Entfernung (m)',type:'number'}, {key:'kaliber',label:'Waffe / Kaliber',type:'text'}, {endrow:1},
      {key:'munition',label:'Munition',type:'text'}, {key:'trophaee',label:'Trophäe / Merkmale',type:'text',ph:'z. B. Sechser, Keilerwaffen 18 cm'},
      {key:'nachsuche',label:'Nachsuche erforderlich',type:'check'},
      {section:'Besonderheiten'}, {key:'notiz',label:'Besonderheiten / Verlauf',type:'textarea',ph:'Wetter, Verhalten, Trefferlage, Auffälligkeiten …'},
      {key:'fotos',label:'Fotos',type:'photos'}
    ],
    onSave: async v => {
      if (!v.wildart){ toast('Bitte die Wildart wählen'); return false; }
      const fotos = await commitPhotos(v.fotos);
      const { pos:p, ...rest } = v;
      const o = await save('abschuesse', { ...a, ...pre.keep, ...rest, fotos, lat:p?.lat ?? null, lng:p?.lng ?? null });
      if (v.revierId) setSetting('lastRevier', v.revierId);
      if (!a.id) toast(`${o.wildart} erfasst – Waidmannsheil!`);
    },
    onDelete: a.id ? async () => { for (const id of a.fotos||[]) await dbDel('fotos', id); await remove('abschuesse', a.id); } : null });
}
function editSichtung(s={}, pre={}){
  const values = { zeit: nowLocal(), anzahl:1, revierId: revierAt(pre.pos) || S.settings.lastRevier || '', ...pre, ...s,
    pos: s.id ? (s.lat != null ? { lat:s.lat, lng:s.lng } : null) : (pre.pos || null) };
  openForm({ title: s.id ? 'Sichtung bearbeiten' : 'Sichtung erfassen', values,
    fields:[
      {key:'zeit',label:'Datum & Uhrzeit',type:'datetime'}, {key:'wildart',label:'Wildart',type:'wildart'},
      {row:1}, {key:'anzahl',label:'Anzahl',type:'int'}, {key:'geschlecht',label:'Geschlecht',type:'select',options:GESCHL}, {endrow:1},
      {key:'details',label:'Zusammensetzung',type:'text',ph:'z. B. 1 Ricke, 2 Kitze'},
      {key:'verhalten',label:'Richtung / Verhalten',type:'text',ph:'z. B. von W ausgetreten, äsend'},
      {key:'revierId',label:'Revier',type:'revier'}, {key:'hochsitzId',label:'Hochsitz',type:'hochsitz'},
      {key:'pos',label:'Position',type:'position',fromHochsitz:true},
      {key:'notiz',label:'Bemerkungen',type:'textarea'}
    ],
    onSave: async v => {
      if (!v.wildart){ toast('Bitte die Wildart wählen'); return false; }
      const { pos:p, ...rest } = v;
      await save('sichtungen', { ...s, ...pre.keep, ...rest, anzahl: rest.anzahl || 1, lat:p?.lat ?? null, lng:p?.lng ?? null });
    },
    onDelete: s.id ? async () => { await remove('sichtungen', s.id); } : null });
}
function editAnsitz(a={}){
  let near = null;
  if (!a.id && !a.hochsitzId && lastFix && Date.now() - lastFix.t < 120000){
    const n = S.hochsitze.slice().sort((x,y) => dist(lastFix,x) - dist(lastFix,y))[0];
    if (n && dist(lastFix, n) < 400) near = n.id;
  }
  openForm({ title: a.id ? 'Ansitz bearbeiten' : 'Ansitz starten', values:{ start:nowLocal(), hochsitzId:near || '', ...a },
    fields:[ {key:'hochsitzId',label:'Hochsitz',type:'hochsitz',near: a.id ? null : lastFix}, {key:'start',label:'Beginn',type:'datetime'},
      ...(a.id && a.ende ? [{key:'ende',label:'Ende',type:'datetime'}] : []),
      {row:1}, {key:'wind',label:'Wind',type:'select',options:WIND}, {key:'wetter',label:'Wetter',type:'text',ph:'z. B. klar, 4 °C'}, {endrow:1},
      {key:'notiz',label:'Notizen',type:'textarea'} ],
    onSave: async v => {
      if (!v.hochsitzId){ toast('Bitte einen Hochsitz wählen'); return false; }
      const h = find('hochsitze', v.hochsitzId);
      await save('ansitze', { ...a, ...v, revierId: h?.revierId || '' });
      if (!a.id) showView('ansitz');
    },
    onDelete: a.id ? async () => { for (const s of S.sichtungen.filter(x => x.ansitzId === a.id)) await remove('sichtungen', s.id); await remove('ansitze', a.id); } : null,
    deleteLabel:'Ansitz inkl. Sichtungen löschen' });
}
async function startAnsitz(hochsitzId){
  if (activeAnsitz()){ toast('Es läuft bereits ein Ansitz'); showView('ansitz'); return; }
  if (!S.hochsitze.length){ toast('Lege zuerst einen Hochsitz an'); return; }
  if (hochsitzId){ editAnsitz({ hochsitzId }); return; }
  getGPS().catch(()=>{}).finally(() => editAnsitz({}));
}

/* ---------------- Karte ---------------- */
const LAYERS = {
  sat:   { name:'Satellit', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max:19, attr:'Bilder © Esri, Maxar, Earthstar Geographics' },
  satl:  { name:'Satellit + Namen', url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', max:19, attr:'Bilder © Esri', overlay:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}' },
  topo:  { name:'Topografisch', url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', max:17, attr:'© OpenStreetMap-Mitwirkende, SRTM | © OpenTopoMap (CC-BY-SA)' },
  osm:   { name:'Straßenkarte', url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max:19, attr:'© OpenStreetMap-Mitwirkende' }
};
const LAYER_ORDER = ['sat','satl','topo','osm'];
function makeBase(key){
  const L_ = LAYERS[key] || LAYERS.sat;
  const base = L.tileLayer(L_.url, { maxZoom:20, maxNativeZoom:L_.max, attribution:L_.attr });
  if (!L_.overlay) return base;
  return L.layerGroup([base, L.tileLayer(L_.overlay, { maxZoom:20, maxNativeZoom:L_.max })]);
}
let map, baseLayer, groups = {}, meMarker, meCircle;
function initMap(){
  const v = S.settings.mapView || { lat:51.36, lng:7.47, z:12 };   // Start: Raum Hagen
  map = L.map('map', { zoomControl:false, tapHold:true }).setView([v.lat, v.lng], v.z);
  setBase(S.settings.baseLayer || 'sat');
  groups.rv = L.layerGroup().addTo(map); groups.hs = L.layerGroup().addTo(map); groups.ab = L.layerGroup().addTo(map); groups.si = L.layerGroup().addTo(map);
  map.on('moveend', () => { const c = map.getCenter(); setSetting('mapView', { lat:c.lat, lng:c.lng, z:map.getZoom() }); });
  map.on('contextmenu', e => addMenu({ lat:e.latlng.lat, lng:e.latlng.lng }, 'An dieser Stelle'));
  $('#btn-layer').onclick = () => { const i = LAYER_ORDER.indexOf(S.settings.baseLayer || 'sat'); setBase(LAYER_ORDER[(i+1) % LAYER_ORDER.length]); };
  $('#btn-locate').onclick = locateMe;
  $('#btn-add').onclick = () => addMenu(null, 'Neu erfassen (Position: GPS)');
  $('#btn-filter').onclick = filterMenu;
  map.on('popupopen', e => {
    const el = e.popup.getElement(); if (el._bound) return; el._bound = true;
    el.addEventListener('click', ev => { const b = ev.target.closest('[data-act]'); if (!b) return; map.closePopup(); ACT[b.dataset.act](b.dataset.id); });
  });
}
function setBase(key){
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = makeBase(key).addTo(map); baseLayer.bringToBack?.();
  setSetting('baseLayer', key);
  const lbl = $('#layer-label'); lbl.textContent = LAYERS[key].name;
}
function filterMenu(){
  const f = S.settings.mapFilter || { hs:true, ab:true, si:true };
  if (f.rv === undefined) f.rv = true;
  const lab = (k, n) => `${f[k] ? '✓' : '○'}  ${n}`;
  actionSheet('Auf der Karte anzeigen', [
    { label:lab('rv','Reviergrenzen'), fn:() => toggle('rv') },
    { label:lab('hs','Hochsitze'), fn:() => toggle('hs') },
    { label:lab('ab','Abschüsse'), fn:() => toggle('ab') },
    { label:lab('si','Sichtungen'), fn:() => toggle('si') } ]);
  async function toggle(k){ f[k] = !f[k]; await setSetting('mapFilter', f); renderMap(); filterMenu(); }
}
function mkIcon(cls, html, size=30){ return L.divIcon({ className:'', html:`<div class="mk ${cls}" style="width:${size}px;height:${size}px">${html}</div>`, iconSize:[size,size], iconAnchor:[size/2,size/2], popupAnchor:[0,-size/2] }); }
function renderMap(){
  if (!map) return;
  const f = S.settings.mapFilter || { hs:true, ab:true, si:true };
  Object.values(groups).forEach(g => g.clearLayers());
  if (f.rv !== false) S.reviere.forEach((r, i) => { if (!r.grenzen?.length) return;
    const col = RV_COLORS[i % RV_COLORS.length];
    L.polygon(r.grenzen, { color:col, weight:3, opacity:.95, fillColor:col, fillOpacity:.08, interactive:false }).addTo(groups.rv)
      .bindTooltip(esc(r.name), { permanent:true, direction:'center', className:'rv-label' });
  });
  if (f.si) for (const s of S.sichtungen) if (s.lat != null){
    L.marker([s.lat, s.lng], { icon:mkIcon('mk-si', s.anzahl > 1 ? s.anzahl : '', 20) }).addTo(groups.si)
      .bindPopup(`<div class="pop"><h4>${esc(s.wildart)}${s.anzahl > 1 ? ` (${s.anzahl})` : ''}</h4><div class="muted">${fmtDT(s.zeit)}${s.details ? ' · ' + esc(s.details) : ''}</div><div class="row"><button class="btn" data-act="si" data-id="${s.id}">Öffnen</button></div></div>`);
  }
  if (f.ab) for (const a of S.abschuesse) if (a.lat != null){
    L.marker([a.lat, a.lng], { icon:mkIcon('mk-ab', '✚', 26), zIndexOffset:500 }).addTo(groups.ab)
      .bindPopup(`<div class="pop"><h4>${esc(a.wildart)}</h4><div class="muted">${fmtDT(a.zeit)}${a.geschlecht ? ' · ' + esc(a.geschlecht) : ''}${a.gewicht ? ` · ${a.gewicht} kg` : ''}</div><div class="row"><button class="btn" data-act="ab" data-id="${a.id}">Öffnen</button></div></div>`);
  }
  if (f.hs) for (const h of S.hochsitze){
    const nA = S.ansitze.filter(x => x.hochsitzId === h.id).length, nS = S.sichtungen.filter(x => x.hochsitzId === h.id).length, nB = S.abschuesse.filter(x => x.hochsitzId === h.id).length;
    L.marker([h.lat, h.lng], { icon:mkIcon('mk-hs', '🪜', 32), zIndexOffset:1000 }).addTo(groups.hs)
      .bindPopup(`<div class="pop"><h4>${esc(h.name)}</h4><div class="muted">${esc(h.typ||'')}${h.revierId && find('reviere',h.revierId) ? ' · ' + esc(find('reviere',h.revierId).name) : ''}</div>
        <div class="muted small" style="margin-top:4px">${nA} Ansitze · ${nS} Sichtungen · ${nB} Abschüsse</div>
        <div class="row"><button class="btn primary" data-act="hs-ansitz" data-id="${h.id}">Ansitz starten</button><button class="btn" data-act="hs-info" data-id="${h.id}">Details</button></div></div>`);
  }
}
async function locateMe(){
  const b = $('#btn-locate'); b.textContent = '⏳';
  try {
    const p = await getGPS(); const ll = [p.lat, p.lng];
    if (!meMarker){ meMarker = L.marker(ll, { icon:mkIcon('mk-me','',18), interactive:false }).addTo(map); meCircle = L.circle(ll, { radius:p.acc, weight:1, color:'#2f80ff', fillOpacity:.1, interactive:false }).addTo(map); }
    else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(p.acc); }
    map.setView(ll, Math.max(map.getZoom(), 16));
  } catch(e){ toast(e.message); }
  b.textContent = '📍';
}
async function posOrGPS(pos){
  if (pos) return pos;
  try { const p = await getGPS(); return { lat:p.lat, lng:p.lng }; }
  catch(e){ toast(e.message + ' – Kartenmitte verwendet'); const c = map.getCenter(); return { lat:c.lat, lng:c.lng }; }
}
function addMenu(pos, title){
  const act = activeAnsitz();
  actionSheet(title, [
    { label:'🎯  Abschuss', fn: async () => editAbschuss({}, preFromAnsitz(act, await posOrGPS(pos))) },
    { label:'👁️  Sichtung', fn: async () => editSichtung({}, preFromAnsitz(act, await posOrGPS(pos))) },
    { label:'🪜  Hochsitz / Einrichtung', fn: async () => editHochsitz({}, await posOrGPS(pos)) } ]);
}
function preFromAnsitz(act, pos){
  if (!act) return { pos };
  const h = find('hochsitze', act.hochsitzId);
  return { pos: pos || (h ? { lat:h.lat, lng:h.lng } : null), hochsitzId:act.hochsitzId, revierId:act.revierId || h?.revierId || '', keep:{ ansitzId:act.id } };
}

/* ---------------- Reviergrenzen ---------------- */
const RV_COLORS = ['#ffd34d','#ff8c42','#4dd0e1','#e57cff','#9be564','#ff5c8a'];
function ringArea(ring){ if (ring.length < 3) return 0; const R = 6371008.8, t = Math.PI/180; let s = 0;
  for (let i = 0; i < ring.length; i++){ const [la1, lo1] = ring[i], [la2, lo2] = ring[(i+1) % ring.length]; s += (lo2 - lo1) * t * (2 + Math.sin(la1*t) + Math.sin(la2*t)); }
  return Math.abs(s * R * R / 2); }
function fmtArea(rings){ const m2 = rings.reduce((a, r) => a + ringArea(r), 0);
  return m2 >= 1e6 ? `${(m2/1e6).toLocaleString('de-DE',{maximumFractionDigits:2})} km² (${Math.round(m2/1e4).toLocaleString('de-DE')} ha)` : `${(m2/1e4).toLocaleString('de-DE',{maximumFractionDigits:1})} ha`; }
function inRing(p, ring){ let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++){ const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if (((yi > p.lat) !== (yj > p.lat)) && (p.lng < (xj - xi) * (p.lat - yi) / (yj - yi) + xi)) ins = !ins; }
  return ins; }
function revierAt(p){ if (!p || p.lat == null) return ''; const r = S.reviere.find(r => (r.grenzen || []).some(g => inRing(p, g))); return r ? r.id : ''; }
function showRevierOnMap(id){ const r = find('reviere', id); if (!r?.grenzen?.length) return; if (sheetCfg) closeSheet(); showView('karte');
  setTimeout(() => map.fitBounds(L.latLngBounds(r.grenzen.flat()), { padding:[30,30] }), 80); }
function simplify(pts, tolM){
  if (pts.length < 4) return pts;
  const k = 111320, cos = Math.cos(pts[0][0] * Math.PI / 180);
  const xy = pts.map(([la, lo]) => [lo * k * cos, la * k]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length-1] = 1;
  const stack = [[0, pts.length-1]];
  while (stack.length){ const [a, b] = stack.pop(); let md = 0, mi = -1;
    const [ax, ay] = xy[a], [bx, by] = xy[b], dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy;
    for (let i = a + 1; i < b; i++){ const [px, py] = xy[i]; let t = L2 ? ((px-ax)*dx + (py-ay)*dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - ax - t*dx, py - ay - t*dy); if (d > md){ md = d; mi = i; } }
    if (md > tolM){ keep[mi] = 1; stack.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
function parseBoundaryFile(text){
  const rings = []; const t = text.trim();
  const ll = ([x, y]) => [y, x];
  if (t.startsWith('{') || t.startsWith('[')){
    const visit = g => { if (!g) return;
      if (g.type === 'FeatureCollection') g.features.forEach(f => visit(f.geometry));
      else if (g.type === 'Feature') visit(g.geometry);
      else if (g.type === 'GeometryCollection') g.geometries.forEach(visit);
      else if (g.type === 'Polygon') rings.push(g.coordinates[0].map(ll));
      else if (g.type === 'MultiPolygon') g.coordinates.forEach(pg => rings.push(pg[0].map(ll)));
      else if (g.type === 'LineString') rings.push(g.coordinates.map(ll)); };
    visit(JSON.parse(t));
  } else {
    const doc = new DOMParser().parseFromString(t, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Datei nicht lesbar');
    const tags = (el, n) => [...el.getElementsByTagNameNS('*', n)];
    const kml = s => s.trim().split(/\s+/).map(c => c.split(',').map(Number)).filter(a => a.length >= 2 && !isNaN(a[0]) && !isNaN(a[1])).map(ll);
    tags(doc, 'outerBoundaryIs').forEach(ob => { const c = tags(ob, 'coordinates')[0]; if (c) rings.push(kml(c.textContent)); });
    if (!rings.length) tags(doc, 'LineString').forEach(ls => { const c = tags(ls, 'coordinates')[0]; if (c) rings.push(kml(c.textContent)); });
    const gpx = el => [+el.getAttribute('lat'), +el.getAttribute('lon')];
    if (!rings.length) tags(doc, 'trkseg').forEach(sg => rings.push(tags(sg, 'trkpt').map(gpx)));
    if (!rings.length) tags(doc, 'rte').forEach(r => rings.push(tags(r, 'rtept').map(gpx)));
  }
  if (rings.some(r => r.some(([la, lo]) => Math.abs(la) > 90 || Math.abs(lo) > 180))) throw new Error('Koordinaten sind nicht in WGS84 (z. B. UTM). Bitte als KML oder GPX exportieren.');
  return rings.map(r => { if (r.length > 1){ const a = r[0], b = r[r.length-1]; if (a[0] === b[0] && a[1] === b[1]) r = r.slice(0, -1); } return simplify(r, 1.5); }).filter(r => r.length >= 3);
}
let drawMap, drawBase, drawLayer, drawCtx, drawState;
function drawBoundary(rings, revierId, hint){
  return new Promise(res => {
    $('#drawer').classList.remove('hidden');
    if (!drawMap){
      drawMap = L.map('drawmap', { zoomControl:false });
      drawCtx = L.layerGroup().addTo(drawMap); drawLayer = L.layerGroup().addTo(drawMap);
      drawMap.on('click', e => drawState?.add([e.latlng.lat, e.latlng.lng]));
    }
    if (drawBase) drawMap.removeLayer(drawBase);
    drawBase = makeBase(S.settings.baseLayer || 'sat').addTo(drawMap);
    drawCtx.clearLayers();   // Umgebung: andere Reviere & Hochsitze
    S.reviere.forEach(r => { if (r.id !== revierId && r.grenzen?.length) L.polygon(r.grenzen, { color:'#ffffff', weight:1.5, dashArray:'6 6', fillOpacity:0, interactive:false }).addTo(drawCtx); });
    S.hochsitze.forEach(h => L.marker([h.lat, h.lng], { icon:mkIcon('mk-hs', '🪜', 24), interactive:false }).addTo(drawCtx));
    const Rg = (rings || []).map(r => r.map(p => [...p])); if (!Rg.length) Rg.push([]);
    let cur = Rg.length - 1;
    const vIcon = first => L.divIcon({ className:'', html:`<div class="vtx${first ? ' first' : ''}"></div>`, iconSize:[22,22], iconAnchor:[11,11] });
    const info = $('#draw-info');
    const redraw = () => {
      drawLayer.clearLayers();
      Rg.forEach((ring, ri) => {
        const active = ri === cur;
        let shape = null;
        if (ring.length >= 2) shape = L.polygon(ring, { color: active ? '#ffd34d' : '#c9a227', weight: active ? 3 : 2, fillOpacity:.15, interactive:false }).addTo(drawLayer);
        if (!active || ring.length > 400) return;
        ring.forEach((p, i) => {
          const m = L.marker(p, { draggable:true, icon:vIcon(i === 0), zIndexOffset:1000 }).addTo(drawLayer);
          m.on('drag', e => { ring[i] = [e.latlng.lat, e.latlng.lng]; shape?.setLatLngs(ring); });
          m.on('dragend', redraw);
          m.on('click', () => { if (confirm('Diesen Punkt löschen?')){ ring.splice(i, 1); redraw(); } });
        });
        if (ring.length >= 3) ring.forEach((p, i) => { const q = ring[(i+1) % ring.length], mp = [(p[0]+q[0])/2, (p[1]+q[1])/2];
          L.marker(mp, { icon:L.divIcon({ className:'', html:'<div class="vtx mid"></div>', iconSize:[18,18], iconAnchor:[9,9] }), zIndexOffset:900 })
            .addTo(drawLayer).on('click', () => { ring.splice(i+1, 0, mp); redraw(); }); });
      });
      const ring = Rg[cur];
      info.textContent = hint && ring.length ? hint : ring.length === 0 ? 'Auf die Karte tippen, um Grenzpunkte zu setzen' :
        `${Rg.length > 1 ? `Fläche ${cur+1} von ${Rg.length} · ` : ''}${ring.length} Punkte${ring.length >= 3 ? ' · ' + fmtArea([ring]) : ''}${ring.length > 400 ? ' · zu viele Punkte zum Verschieben' : ''}`;
      hint = null;
    };
    drawState = { add: p => { Rg[cur].push(p); redraw(); } };
    const all = Rg.flat();
    setTimeout(() => { drawMap.invalidateSize();
      if (all.length) drawMap.fitBounds(L.latLngBounds(all), { padding:[40,40] });
      else { const c = map ? map.getCenter() : { lat:51.36, lng:7.47 }; drawMap.setView([c.lat, c.lng], map ? Math.max(map.getZoom(), 14) : 14); }
    }, 50);
    redraw();
    const done = v => { drawState = null; $('#drawer').classList.add('hidden'); res(v); };
    $('#draw-cancel').onclick = () => done(null);
    $('#draw-ok').onclick = () => { if (Rg.some(r => r.length > 0 && r.length < 3) && !confirm('Flächen mit weniger als 3 Punkten werden verworfen. Fertig?')) return; done(Rg.filter(r => r.length >= 3)); };
    $('#draw-undo').onclick = () => { if (Rg[cur].length) Rg[cur].pop(); else if (Rg.length > 1){ Rg.splice(cur, 1); cur = Rg.length - 1; } redraw(); };
    $('#draw-gps').onclick = async () => { const b = $('#draw-gps'); b.textContent = '⏳';
      try { const p = await getGPS(); Rg[cur].push([p.lat, p.lng]); drawMap.panTo([p.lat, p.lng]); redraw(); toast(`GPS-Punkt gesetzt (± ${Math.round(p.acc)} m)`, null, null, 1500); } catch(e){ toast(e.message); }
      b.textContent = '📍 GPS-Punkt'; };
    $('#draw-new').onclick = () => { if (Rg[cur].length < 3){ toast('Die aktuelle Fläche braucht mindestens 3 Punkte'); return; } Rg.push([]); cur = Rg.length - 1; redraw(); };
  });
}

/* Positionswahl */
let pickMap, pickBase;
function pickPosition(initial){
  return new Promise(res => {
    $('#picker').classList.remove('hidden');
    const center = initial || (map ? map.getCenter() : { lat:51.36, lng:7.47 });
    if (!pickMap){ pickMap = L.map('pickmap', { zoomControl:false }); }
    if (pickBase) pickMap.removeLayer(pickBase);
    pickBase = makeBase(S.settings.baseLayer || 'sat').addTo(pickMap);
    pickMap.setView([center.lat, center.lng], initial ? 17 : (map ? map.getZoom() : 14));
    setTimeout(() => pickMap.invalidateSize(), 50);
    const done = v => { $('#picker').classList.add('hidden'); res(v); };
    $('#pick-cancel').onclick = () => done(null);
    $('#pick-ok').onclick = () => { const c = pickMap.getCenter(); done({ lat:c.lat, lng:c.lng }); };
    $('#pick-gps').onclick = async () => { try { const p = await getGPS(); pickMap.setView([p.lat, p.lng], 18); } catch(e){ toast(e.message); } };
  });
}

/* Offline-Karten */
function tileList(bounds, zmin, zmax){
  const out = [];
  for (let z = zmin; z <= zmax; z++){
    const n = 2 ** z, xf = lng => Math.floor((lng + 180) / 360 * n);
    const yf = lat => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1/Math.cos(r)) / Math.PI) / 2 * n); };
    const x0 = xf(bounds.getWest()), x1 = xf(bounds.getEast()), y0 = yf(bounds.getNorth()), y1 = yf(bounds.getSouth());
    for (let x = Math.max(0,x0); x <= Math.min(n-1,x1); x++) for (let y = Math.max(0,y0); y <= Math.min(n-1,y1); y++) out.push({ z, x, y });
  }
  return out;
}
async function offlineSave(){
  showView('karte');
  if (!('caches' in window)){ toast('Offline-Speicher wird hier nicht unterstützt'); return; }
  const z = map.getZoom(), zmax = Math.min(18, z + 4);
  let tiles = tileList(map.getBounds(), Math.max(1, z - 2), zmax);
  if (tiles.length > 4000){ toast(`Ausschnitt zu groß (${tiles.length} Kacheln). Bitte weiter hineinzoomen.`); return; }
  if (!confirm(`Satellitenbilder für den sichtbaren Ausschnitt speichern?\n${tiles.length} Kacheln (Zoom ${Math.max(1,z-2)}–${zmax}), ca. ${Math.round(tiles.length*0.025)} MB.\nAm besten im WLAN ausführen.`)) return;
  const cache = await caches.open('tiles'); let done = 0, fail = 0;
  const urls = tiles.map(t => LAYERS.sat.url.replace('{z}', t.z).replace('{y}', t.y).replace('{x}', t.x));
  const worker = async () => { while (urls.length){ const u = urls.shift();
      try { if (!(await cache.match(u))){ const r = await fetch(u, { mode:'no-cors' }); await cache.put(u, r); } } catch(e){ fail++; }
      done++; if (done % 50 === 0) toast(`Offline-Karte: ${done} / ${tiles.length}`, null, null, 2000); } };
  await Promise.all(Array.from({ length:6 }, worker));
  toast(`Offline-Karte gespeichert (${done - fail} Kacheln${fail ? `, ${fail} Fehler` : ''})`);
  const list = S.settings.offlineAreas || []; const c = map.getCenter();
  list.push({ at:new Date().toISOString(), lat:c.lat, lng:c.lng, z, n:done - fail }); setSetting('offlineAreas', list);
}

/* ---------------- Ansitz-Ansicht ---------------- */
const activeAnsitz = () => S.ansitze.find(a => !a.ende);
function sightSummary(list){
  const m = {}; for (const s of list) m[s.wildart] = (m[s.wildart]||0) + (s.anzahl||1);
  return Object.entries(m).sort((a,b) => b[1]-a[1]).map(([w,n]) => `${n}× ${w}`).join(', ');
}
let ansitzTimer;
function renderAnsitz(){
  const v = $('#v-ansitz'); const act = activeAnsitz(); clearInterval(ansitzTimer);
  let html = '<h1>Ansitz</h1>';
  if (act){
    const h = find('hochsitze', act.hochsitzId), rv = find('reviere', act.revierId);
    const sights = S.sichtungen.filter(s => s.ansitzId === act.id).sort(byDateDesc('zeit'));
    const shots = S.abschuesse.filter(s => s.ansitzId === act.id);
    const favs = wildarten().filter(w => w.fav && !w.hidden);
    const cnt = n => sights.filter(s => s.wildart === n).reduce((a,s) => a + (s.anzahl||1), 0);
    html += `<div class="card active-ansitz">
      <div class="muted small">Läuft seit ${fmtT(act.start)} Uhr · <span class="timer" id="ans-timer">${dur(act.start)}</span></div>
      <div class="title">${esc(h?.name || 'Hochsitz?')}</div>
      <div class="muted small">${esc(rv?.name || '')}${act.wind ? ' · Wind ' + esc(act.wind) : ''}${act.wetter ? ' · ' + esc(act.wetter) : ''}</div>
      <h3>Schnell-Sichtung (1 Antippen = 1 Stück)</h3>
      <div class="quick">${favs.map(w => `<button data-q="${esc(w.name)}">${esc(w.name)}<span class="n">${cnt(w.name) || ''}</span></button>`).join('')}<button data-q="__other">Andere …<span class="n">Details</span></button></div>
      <button class="btn primary block big" id="ans-shot">🎯 Abschuss erfassen</button>
      <div class="btnrow" style="margin-top:8px"><button class="btn" id="ans-edit">Wind / Wetter</button><button class="btn" id="ans-end">Ansitz beenden</button></div>
    </div>
    <h2>Sichtungen dieses Ansitzes ${sights.length ? `<span class="muted small">(${esc(sightSummary(sights))})</span>` : ''}</h2>
    ${sights.length ? `<div class="list">${sights.map(sightItem).join('')}</div>` : '<div class="empty">Noch nichts gesehen.</div>'}
    ${shots.length ? `<h2>Abschüsse</h2><div class="list">${shots.map(shotItem).join('')}</div>` : ''}`;
  } else {
    html += `<button class="btn primary block big" id="ans-start">▶︎ Ansitz starten</button>
      <p class="muted small">Während des Ansitzes erfasst du Sichtungen mit einem Fingertipp. Abschüsse werden automatisch dem Ansitz zugeordnet.</p>`;
  }
  const past = S.ansitze.filter(a => a.ende).sort(byDateDesc('start'));
  html += `<h2>Letzte Ansitze</h2>` + (past.length ? `<div class="list">${past.slice(0, 60).map(a => {
    const h = find('hochsitze', a.hochsitzId), si = S.sichtungen.filter(s => s.ansitzId === a.id), ab = S.abschuesse.filter(s => s.ansitzId === a.id);
    return `<button class="item" data-act="an" data-id="${a.id}"><div class="grow"><div class="t">${ab.length ? '🎯 ' : ''}${esc(h?.name || '?')}</div><div class="s">${esc(sightSummary(si) || 'keine Sichtungen')}</div></div><div class="r">${fmtD(a.start)}<br>${fmtT(a.start)} · ${dur(a.start, a.ende)}</div></button>`; }).join('')}</div>` : '<div class="empty">Noch keine Ansitze.</div>');
  v.innerHTML = html;

  if (act){
    ansitzTimer = setInterval(() => { const t = $('#ans-timer'); if (t) t.textContent = dur(act.start); }, 30000);
    $('.quick', v).onclick = async e => {
      const b = e.target.closest('[data-q]'); if (!b) return;
      const h = find('hochsitze', act.hochsitzId);
      if (b.dataset.q === '__other') return editSichtung({}, preFromAnsitz(act, null));
      const s = await save('sichtungen', { ansitzId:act.id, hochsitzId:act.hochsitzId, revierId:act.revierId || '', zeit:nowLocal(), wildart:b.dataset.q, anzahl:1, lat:h?.lat ?? null, lng:h?.lng ?? null });
      navigator.vibrate?.(30); refreshAll();
      toast(`${s.wildart} · ${fmtT(s.zeit)} erfasst`, 'Details', () => editSichtung(s));
    };
    $('#ans-shot').onclick = () => editAbschuss({}, preFromAnsitz(act, null));
    $('#ans-edit').onclick = () => editAnsitz(act);
    $('#ans-end').onclick = async () => { if (!confirm('Ansitz jetzt beenden?')) return; await save('ansitze', { ...act, ende:nowLocal() }); refreshAll(); toast('Ansitz beendet'); };
  } else $('#ans-start').onclick = () => startAnsitz();
}
function sightItem(s){ return `<button class="item" data-act="si" data-id="${s.id}"><span class="dot" style="background:var(--blue)"></span><div class="grow"><div class="t">${s.anzahl > 1 ? s.anzahl + '× ' : ''}${esc(s.wildart)}</div><div class="s">${esc([s.geschlecht, s.details, s.verhalten, s.notiz].filter(Boolean).join(' · ') || '–')}</div></div><div class="r">${fmtT(s.zeit)}</div></button>`; }
function shotItem(a){
  const h = find('hochsitze', a.hochsitzId), rv = find('reviere', a.revierId);
  return `<button class="item" data-act="ab" data-id="${a.id}"><span class="dot" style="background:var(--red)"></span><div class="grow"><div class="t">${esc(a.wildart)}${a.geschlecht ? ` <span class="muted small">${esc(a.geschlecht)}</span>` : ''}</div><div class="s">${esc([h?.name, rv?.name, a.gewicht ? a.gewicht + ' kg' : '', a.fotos?.length ? '📷 ' + a.fotos.length : ''].filter(Boolean).join(' · ') || '–')}</div></div><div class="r">${fmtD(a.zeit)}<br>${fmtT(a.zeit)}</div></button>`;
}
function showAnsitz(id){
  const a = find('ansitze', id); if (!a) return;
  const h = find('hochsitze', a.hochsitzId), rv = find('reviere', a.revierId);
  const si = S.sichtungen.filter(s => s.ansitzId === id).sort((x,y) => (x.zeit||'').localeCompare(y.zeit||''));
  const ab = S.abschuesse.filter(s => s.ansitzId === id);
  const body = `<div class="card"><div class="t" style="font-size:19px;font-weight:700">${esc(h?.name || '?')}</div>
    <div class="muted">${fmtD(a.start)} · ${fmtT(a.start)}–${fmtT(a.ende)} Uhr (${dur(a.start, a.ende)})</div>
    <div class="muted small">${esc([rv?.name, a.wind ? 'Wind ' + a.wind : '', a.wetter].filter(Boolean).join(' · '))}</div>
    ${a.notiz ? `<p>${esc(a.notiz)}</p>` : ''}</div>
    <h2>Sichtungen</h2>${si.length ? `<div class="list">${si.map(sightItem).join('')}</div>` : '<div class="empty">Keine Sichtungen</div>'}
    ${ab.length ? `<h2>Abschüsse</h2><div class="list">${ab.map(shotItem).join('')}</div>` : ''}
    <div class="btnrow" style="margin-top:14px"><button class="btn" data-x="addsi">＋ Sichtung</button><button class="btn" data-x="edit">Bearbeiten</button></div>`;
  openSheet({ title:'Ansitz', body });
  $('#sheet-body').onclick = e => {
    const x = e.target.closest('[data-x]');
    if (x?.dataset.x === 'edit') editAnsitz(a);
    if (x?.dataset.x === 'addsi') editSichtung({}, { ...preFromAnsitz(a, null), zeit:a.start });
  };
}
function showHochsitz(id){
  const h = find('hochsitze', id); if (!h) return;
  const rv = find('reviere', h.revierId);
  const ans = S.ansitze.filter(a => a.hochsitzId === id).sort(byDateDesc('start'));
  const si = S.sichtungen.filter(s => s.hochsitzId === id), ab = S.abschuesse.filter(s => s.hochsitzId === id).sort(byDateDesc('zeit'));
  // Sichtungen nach Stunde
  const hours = {}; for (const s of si){ const hh = fmtT(s.zeit).slice(0,2); if (hh) hours[hh] = (hours[hh]||0) + (s.anzahl||1); }
  const body = `<div class="card"><div style="font-size:19px;font-weight:700">${esc(h.name)}</div><div class="muted">${esc(h.typ||'')}${rv ? ' · ' + esc(rv.name) : ''}</div>
    <div class="muted small">${esc(fmtPos(h))}</div>${h.notiz ? `<p>${esc(h.notiz)}</p>` : ''}
    <div class="btnrow" style="margin-top:10px"><button class="btn primary" data-x="start">Ansitz starten</button><button class="btn" data-x="edit">Bearbeiten</button></div>
    <a class="btn block" style="text-align:center;text-decoration:none" href="https://maps.apple.com/?daddr=${h.lat},${h.lng}" target="_blank" rel="noopener">🚙 Navigation (Apple Karten)</a></div>
    <div class="chips"><span class="chip"><b>${ans.length}</b> Ansitze</span><span class="chip"><b>${si.reduce((a,s)=>a+(s.anzahl||1),0)}</b> Stück gesehen</span><span class="chip"><b>${ab.length}</b> Abschüsse</span></div>
    ${si.length ? `<h3>Gesehen</h3><p>${esc(sightSummary(si))}</p><h3>Sichtungen nach Uhrzeit</h3><div class="chips">${Object.keys(hours).sort().map(k => `<span class="chip">${k} Uhr: <b>${hours[k]}</b></span>`).join('')}</div>` : ''}
    ${ab.length ? `<h2>Abschüsse</h2><div class="list">${ab.map(shotItem).join('')}</div>` : ''}
    ${ans.length ? `<h2>Ansitze</h2><div class="list">${ans.slice(0,30).map(a => `<button class="item" data-act="an" data-id="${a.id}"><div class="grow"><div class="t">${fmtD(a.start)} · ${fmtT(a.start)} Uhr</div><div class="s">${esc(sightSummary(S.sichtungen.filter(s=>s.ansitzId===a.id)) || 'keine Sichtungen')}</div></div><div class="r">${a.ende ? dur(a.start,a.ende) : 'läuft'}</div></button>`).join('')}</div>` : ''}`;
  openSheet({ title:'Hochsitz', body });
  $('#sheet-body').onclick = e => {
    const x = e.target.closest('[data-x]');
    if (x?.dataset.x === 'edit') editHochsitz(h);
    if (x?.dataset.x === 'start'){ closeSheet(); startAnsitz(h.id); }
  };
}

/* ---------------- Strecke ---------------- */
const streckeFilter = { jj:'', wa:'', rv:'' };
function renderStrecke(){
  const v = $('#v-strecke');
  const jjs = [...new Set(S.abschuesse.map(a => jagdjahr(a.zeit)).filter(Boolean))].sort().reverse();
  const was = [...new Set(S.abschuesse.map(a => a.wildart))].sort();
  let list = S.abschuesse.slice().sort(byDateDesc('zeit'));
  if (streckeFilter.jj) list = list.filter(a => jagdjahr(a.zeit) === streckeFilter.jj);
  if (streckeFilter.wa) list = list.filter(a => a.wildart === streckeFilter.wa);
  if (streckeFilter.rv) list = list.filter(a => a.revierId === streckeFilter.rv);
  const sum = {}; list.forEach(a => sum[a.wildart] = (sum[a.wildart]||0) + 1);
  v.innerHTML = `<h1>Strecke</h1>
    <button class="btn primary block" id="st-add">＋ Abschuss erfassen</button>
    <div class="filters" style="margin-top:12px">
      <select id="f-jj">${selOpts(jjs.map(j => ({ v:j, l:'Jagdjahr ' + j })), streckeFilter.jj, 'Alle Jahre')}</select>
      <select id="f-wa">${selOpts(was, streckeFilter.wa, 'Alle Wildarten')}</select></div>
    <div class="filters"><select id="f-rv">${selOpts(S.reviere.map(r => ({ v:r.id, l:r.name })), streckeFilter.rv, 'Alle Reviere')}</select></div>
    <div class="chips"><span class="chip">Gesamt <b>${list.length}</b></span>${Object.entries(sum).sort((a,b)=>b[1]-a[1]).map(([w,n]) => `<span class="chip">${esc(w)} <b>${n}</b></span>`).join('')}</div>
    ${list.length ? `<div class="list">${list.map(shotItem).join('')}</div>` : '<div class="empty">Keine Abschüsse.</div>'}
    <p class="muted small">Jagdjahr: 1. April – 31. März.</p>`;
  $('#st-add').onclick = () => editAbschuss({}, preFromAnsitz(activeAnsitz(), null));
  for (const [id, k] of [['f-jj','jj'],['f-wa','wa'],['f-rv','rv']]) $('#' + id).onchange = e => { streckeFilter[k] = e.target.value; renderStrecke(); };
}

/* ---------------- Mehr ---------------- */
async function renderMehr(){
  const v = $('#v-mehr');
  const last = S.settings.lastBackup;
  v.innerHTML = `<h1>Mehr</h1>
    <h2>Datensicherung</h2>
    <div class="card">
      <div>Letzte Sicherung: <b>${last ? new Date(last).toLocaleString('de-DE') : 'noch nie'}</b></div>
      <p class="muted small">Alle Daten liegen nur auf diesem iPhone. Die Sicherungsdatei enthält alles – auch die Fotos. Speichere sie in „Dateien“ (iCloud Drive) oder schicke sie per AirDrop auf das neue iPhone.</p>
      <button class="btn primary block" data-m="backup">💾 Sicherung erstellen</button>
      <button class="btn block" data-m="restore">📥 Sicherung einspielen</button>
      <div class="btnrow" style="margin-top:10px"><button class="btn" data-m="csv-ab">CSV Abschüsse</button><button class="btn" data-m="csv-si">CSV Sichtungen</button></div>
    </div>
    <h2>Reviere</h2>
    <div class="list">${S.reviere.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(r => `<button class="item" data-act="rv" data-id="${r.id}"><div class="grow"><div class="t">${esc(r.name)}</div><div class="s">${esc(r.land||'')}</div></div><div class="r">${S.hochsitze.filter(h=>h.revierId===r.id).length} Sitze${r.grenzen?.length ? '<br>' + fmtArea(r.grenzen) : ''}</div></button>`).join('') || '<div class="empty">Noch kein Revier</div>'}</div>
    <button class="btn block" data-m="rv-add">＋ Revier anlegen</button>
    <h2>Hochsitze & Einrichtungen</h2>
    <div class="list">${S.hochsitze.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(h => `<button class="item" data-act="hs-info" data-id="${h.id}"><span class="dot" style="background:var(--brown)"></span><div class="grow"><div class="t">${esc(h.name)}</div><div class="s">${esc([h.typ, find('reviere',h.revierId)?.name].filter(Boolean).join(' · '))}</div></div></button>`).join('') || '<div class="empty">Noch keine Hochsitze – auf der Karte lange drücken oder ＋ antippen.</div>'}</div>
    <h2>Wildarten</h2>
    <button class="btn block" data-m="wild">Wildarten verwalten (${wildarten().filter(w=>!w.hidden).length})</button>
    <h2>Offline-Karte</h2>
    <div class="card"><p class="muted small" style="margin-top:0">Für Reviere ohne Netz (z. B. Afrika, Belarus): Karte auf das Gebiet zoomen, dann hier speichern. Bereits angesehene Kartenbereiche werden zusätzlich automatisch zwischengespeichert.</p>
      <button class="btn block" data-m="offline">🛰️ Sichtbaren Kartenausschnitt speichern</button>
      <button class="btn block" data-m="offline-clear">Kartenspeicher leeren</button>
      <div class="muted small" id="tile-info" style="margin-top:8px"></div></div>
    <h2>Speicher</h2>
    <div class="card small" id="storage-info">…</div>
    <p class="muted small" style="text-align:center">Jagdbuch ${APP_VERSION} · Daten bleiben auf diesem Gerät</p>`;
  v.onclick = e => { const b = e.target.closest('[data-m]'); if (b) MEHR[b.dataset.m](); };
  // Speicherinfos
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    const nFoto = (await tx('fotos','readonly', s => s.count()));
    $('#storage-info').innerHTML = `${S.abschuesse.length} Abschüsse · ${S.sichtungen.length} Sichtungen · ${S.ansitze.length} Ansitze · ${S.hochsitze.length} Hochsitze · ${nFoto} Fotos<br>
      ${est ? `Belegt: ${(est.usage/1048576).toFixed(1)} MB` : ''}<br>
      Dauerhafter Speicher: ${persisted === true ? '✅ zugesichert' : persisted === false ? '⚠️ nicht zugesichert – regelmäßig sichern' : 'unbekannt'}<br>
      Modus: ${isStandalone() ? '✅ Home-Bildschirm-App' : '⚠️ im Browser geöffnet'}`;
    const n = S.settings.offlineAreas?.length || 0;
    $('#tile-info').textContent = n ? `${n} Gebiet(e) gespeichert, zuletzt ${new Date(S.settings.offlineAreas[n-1].at).toLocaleDateString('de-DE')}` : '';
  } catch(e){}
}
const MEHR = {
  backup: exportBackup,
  restore: () => $('#import-file').click(),
  'csv-ab': () => exportCSV('ab'),
  'csv-si': () => exportCSV('si'),
  'rv-add': () => editRevier(),
  wild: manageWild,
  offline: offlineSave,
  'offline-clear': async () => { if (!confirm('Alle gespeicherten Kartenbilder löschen? Deine Jagddaten bleiben erhalten.')) return; await caches.delete('tiles'); await setSetting('offlineAreas', []); toast('Kartenspeicher geleert'); renderMehr(); }
};
function manageWild(){
  const render = () => {
    const groups = {}; wildarten().forEach((w,i) => (groups[w.gruppe] ||= []).push({ ...w, i }));
    return `<p class="muted small">★ = erscheint als Schnelltaste beim Ansitz. Auge = in Auswahllisten anzeigen/ausblenden.</p>
      <div class="btnrow"><button class="btn primary" data-w="add">＋ Wildart hinzufügen</button></div>
      ${Object.entries(groups).map(([g, ws]) => `<h3>${esc(g)}</h3><div class="list">${ws.map(w => `<div class="wa-row ${w.hidden?'hid':''}"><span class="grow">${esc(w.name)}</span><button data-w="fav" data-i="${w.i}">${w.fav ? '★' : '☆'}</button><button data-w="hide" data-i="${w.i}">${w.hidden ? '🙈' : '👁️'}</button>${w.gruppe === 'Eigene' && w.name !== 'Sonstiges' ? `<button data-w="del" data-i="${w.i}">🗑️</button>` : ''}</div>`).join('')}</div>`).join('')}`;
  };
  openSheet({ title:'Wildarten', body:render(), onClose: refreshAll });
  $('#sheet-body').onclick = async e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    const list = wildarten().map(w => ({ ...w })), i = +b.dataset.i;
    if (b.dataset.w === 'add'){
      const n = prompt('Name der Wildart:'); if (!n) return;
      const g = prompt('Gruppe (z. B. Afrika, Osteuropa / Nordeuropa, Eigene):', 'Eigene') || 'Eigene';
      await addWildart(n, g.trim());
    } else {
      if (b.dataset.w === 'fav') list[i].fav = !list[i].fav;
      if (b.dataset.w === 'hide') list[i].hidden = !list[i].hidden;
      if (b.dataset.w === 'del'){ if (!confirm(`„${list[i].name}“ löschen? Bestehende Einträge behalten den Namen.`)) return; list.splice(i,1); }
      await setSetting('wildarten', list);
    }
    $('#sheet-body').innerHTML = render();
  };
}

/* ---------------- Sicherung / Wiederherstellung ---------------- */
async function exportBackup(){
  toast('Sicherung wird erstellt …');
  const data = {}; for (const s of STORES) data[s] = await dbAll(s);
  const payload = { app:'jagdbuch', format:BACKUP_FORMAT, version:APP_VERSION, exportedAt:new Date().toISOString(), data };
  const d = new Date(), name = `Jagdbuch-Sicherung-${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const blob = new Blob([JSON.stringify(payload)], { type:'application/json' });
  const file = new File([blob], name, { type:'application/json' });
  if (navigator.canShare && navigator.canShare({ files:[file] })){
    try { await navigator.share({ files:[file], title:name }); await setSetting('lastBackup', new Date().toISOString()); toast('Sicherung übergeben ✓'); refreshAll(); return; }
    catch(e){ if (e.name === 'AbortError'){ toast('Sicherung abgebrochen'); return; } }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  await setSetting('lastBackup', new Date().toISOString()); toast('Sicherung heruntergeladen ✓'); refreshAll();
}
$('#import-file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let p; try { p = JSON.parse(await f.text()); } catch(err){ toast('Datei ist keine gültige Sicherung'); return; }
  if (p?.app !== 'jagdbuch' || !p.data){ toast('Das ist keine Jagdbuch-Sicherung'); return; }
  const c = k => (p.data[k] || []).length;
  const body = `<div class="card"><b>${esc(f.name)}</b><div class="muted small">erstellt ${p.exportedAt ? new Date(p.exportedAt).toLocaleString('de-DE') : '?'}</div>
    <p>${c('abschuesse')} Abschüsse · ${c('sichtungen')} Sichtungen · ${c('ansitze')} Ansitze · ${c('hochsitze')} Hochsitze · ${c('reviere')} Reviere · ${c('fotos')} Fotos</p></div>
    <button class="btn primary block big" data-r="replace">Alles ersetzen</button>
    <p class="muted small">Für ein neues iPhone: Die Daten auf diesem Gerät werden vollständig durch die Sicherung ersetzt.</p>
    <button class="btn block big" data-r="merge">Zusammenführen</button>
    <p class="muted small">Ergänzt fehlende Einträge; bei doppelten gewinnt der zuletzt geänderte.</p>`;
  openSheet({ title:'Sicherung einspielen', body });
  $('#sheet-body').onclick = async ev => {
    const b = ev.target.closest('[data-r]'); if (!b) return;
    if (b.dataset.r === 'replace' && !confirm('Wirklich ALLE Daten auf diesem Gerät durch die Sicherung ersetzen?')) return;
    b.disabled = true; b.textContent = 'Wird eingespielt …';
    try { await importBackup(p, b.dataset.r); closeSheet(); await loadAll(); refreshAll(); toast('Sicherung eingespielt ✓'); }
    catch(err){ console.error(err); toast('Fehler: ' + err.message); b.disabled = false; }
  };
};
async function importBackup(p, mode){
  const keepLocal = { lastBackup:S.settings.lastBackup, mapView:S.settings.mapView };
  for (const s of STORES){
    const rows = p.data[s] || [];
    if (mode === 'replace'){
      await dbClear(s);
      await tx(s, 'readwrite', st => { rows.forEach(r => st.put(r)); });
    } else if (s === 'settings'){
      for (const r of rows){
        if (r.key === 'wildarten'){ const cur = wildarten().slice(); for (const w of r.value || []) if (!cur.some(x => x.name === w.name)) cur.push(w); await setSetting('wildarten', cur); }
        else if (!(r.key in S.settings)) await dbPut('settings', r);
      }
    } else {
      const existing = new Map((await dbAll(s)).map(x => [x.id, x]));
      await tx(s, 'readwrite', st => { rows.forEach(r => { const ex = existing.get(r.id); if (!ex || (r.updatedAt || '') >= (ex.updatedAt || '')) st.put(r); }); });
    }
  }
  if (mode === 'replace' && keepLocal.mapView) await dbPut('settings', { key:'mapView', value:keepLocal.mapView });
}
function exportCSV(kind){
  const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
  const dec = n => n == null ? '' : String(n).replace('.', ',');
  const coord = n => n == null ? '' : n.toFixed(6).replace('.', ',');
  let head, rows;
  if (kind === 'ab'){
    head = ['Datum','Uhrzeit','Jagdjahr','Wildart','Geschlecht','Altersklasse','Gewicht kg','Revier','Land','Hochsitz','Breite','Länge','Entfernung m','Waffe/Kaliber','Munition','Trophäe','Nachsuche','Besonderheiten','Fotos'];
    rows = S.abschuesse.slice().sort((a,b)=>(a.zeit||'').localeCompare(b.zeit||'')).map(a => { const rv = find('reviere',a.revierId);
      return [fmtD(a.zeit), fmtT(a.zeit), jagdjahr(a.zeit), a.wildart, a.geschlecht, a.alter, dec(a.gewicht), rv?.name, rv?.land, find('hochsitze',a.hochsitzId)?.name, coord(a.lat), coord(a.lng), dec(a.entfernung), a.kaliber, a.munition, a.trophaee, a.nachsuche ? 'ja' : '', a.notiz, (a.fotos||[]).length]; });
  } else {
    head = ['Datum','Uhrzeit','Wildart','Anzahl','Geschlecht','Zusammensetzung','Richtung/Verhalten','Revier','Hochsitz','Breite','Länge','Ansitz-Beginn','Bemerkung'];
    rows = S.sichtungen.slice().sort((a,b)=>(a.zeit||'').localeCompare(b.zeit||'')).map(s => [fmtD(s.zeit), fmtT(s.zeit), s.wildart, s.anzahl, s.geschlecht, s.details, s.verhalten, find('reviere',s.revierId)?.name, find('hochsitze',s.hochsitzId)?.name, coord(s.lat), coord(s.lng), fmtDT(find('ansitze',s.ansitzId)?.start), s.notiz]);
  }
  const csv = '﻿' + [head, ...rows].map(r => r.map(q).join(';')).join('\r\n');
  const name = `Jagdbuch-${kind === 'ab' ? 'Abschuesse' : 'Sichtungen'}-${nowLocal().slice(0,10)}.csv`;
  const file = new File([csv], name, { type:'text/csv' });
  if (navigator.canShare && navigator.canShare({ files:[file] })) navigator.share({ files:[file], title:name }).catch(()=>{});
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); }
}

/* ---------------- Navigation & globale Aktionen ---------------- */
const ACT = {
  'hs-ansitz': id => startAnsitz(id),
  'hs-info': id => showHochsitz(id),
  ab: id => editAbschuss(find('abschuesse', id)),
  si: id => editSichtung(find('sichtungen', id)),
  an: id => showAnsitz(id),
  rv: id => editRevier(find('reviere', id))
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.closest('.leaflet-popup')) return;
  ACT[b.dataset.act]?.(b.dataset.id);
});
let currentView = 'karte';
function showView(name){
  currentView = name;
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'v-' + name));
  if (name === 'karte' && map) setTimeout(() => map.invalidateSize(), 30);
  renderView(name);
}
function renderView(name){ ({ karte:renderMap, ansitz:renderAnsitz, strecke:renderStrecke, mehr:renderMehr })[name]?.(); }
function refreshAll(){ renderMap(); renderView(currentView); renderBanner(); updateTabBadge(); }
function updateTabBadge(){ const b = $('#tabs [data-view="ansitz"]'); b.style.color = activeAnsitz() && currentView !== 'ansitz' ? 'var(--accent)' : ''; }
$('#tabs').onclick = e => { const b = e.target.closest('[data-view]'); if (b) showView(b.dataset.view); };

const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function renderBanner(){
  const b = $('#banner'); let msg = '', btn = '', fn = null;
  const hasData = S.abschuesse.length + S.sichtungen.length + S.hochsitze.length > 0;
  const last = S.settings.lastBackup ? new Date(S.settings.lastBackup) : null;
  if (isIOS() && !isStandalone()){ msg = 'Wichtig: Über „Teilen → Zum Home-Bildschirm“ installieren. Daten im Safari-Tab sind getrennt von der App.'; }
  else if (hasData && (!last || Date.now() - last > 14*864e5)){ msg = last ? `Letzte Sicherung vor ${Math.floor((Date.now()-last)/864e5)} Tagen.` : 'Noch keine Datensicherung erstellt.'; btn = 'Jetzt sichern'; fn = exportBackup; }
  b.classList.toggle('hidden', !msg);
  b.innerHTML = msg ? `<span>${esc(msg)}</span>${btn ? `<button>${esc(btn)}</button>` : ''}` : '';
  if (fn) $('button', b).onclick = fn;
  if (map) setTimeout(() => map.invalidateSize(), 30);
}

/* ---------------- Start ---------------- */

(async function init(){
  try { await loadAll(); }
  catch(e){ document.body.innerHTML = `<div style="padding:40px 20px">Datenspeicher nicht verfügbar: ${esc(e.message)}<br><br>Bitte nicht im privaten Safari-Modus öffnen.</div>`; return; }
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch(e){}
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
  initMap();
  renderBanner();
  showView(activeAnsitz() ? 'ansitz' : 'karte');
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAll(); });
})();
