import { createViewer, sceneThumb } from './viewer.js';
import * as db from './db.js';
import { rectify, outputSize } from './rectify.js';

const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const FACE_ORDER = ['north', 'west', 'east', 'south', 'floor', 'ceiling'];
const FACE_LABEL = { north: 'Mur en face', west: 'Mur gauche', east: 'Mur droit', south: 'Mur derrière', floor: 'Sol', ceiling: 'Plafond' };
const PANO_MAX = 6144, PHOTO_MAX = 4096, PLAN_MAX = 2048;

let project = null;
let sel = null;
let picking = false;
const urls = new Map();
const imageURL = id => urls.get(id) || '';

// ---------- utilitaires ----------
function toast(msg, ms = 2600) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

async function busy(msg, fn) {
  const b = document.createElement('div');
  b.className = 'busy';
  b.textContent = msg;
  document.body.appendChild(b);
  await new Promise(r => setTimeout(r, 30));
  try { return await fn(); } finally { b.remove(); }
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

const blobToDataURL = blob => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
const slug = s => (s || 'visite').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'visite';

/** Décode une photo (orientation EXIF respectée), la réduit et la recompresse en JPEG. */
async function prepareImage(file, maxSide) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
  return { blob, w, h };
}

async function storeImage(blob) {
  const id = 'img_' + uid();
  await db.put('images', { id, project: project.id, blob });
  urls.set(id, URL.createObjectURL(blob));
  return id;
}

async function dropImage(id) {
  if (!id) return;
  await db.del('images', id);
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

/** Toutes les images utilisées par le projet ; `display` = seulement celles affichées dans la visite. */
function referencedImages(p, display = false) {
  const ids = new Set();
  if (p.plan?.image) ids.add(p.plan.image);
  for (const s of p.scenes) {
    if (s.image) ids.add(s.image);
    for (const f of Object.values(s.faces || {})) {
      if (f?.img) ids.add(f.img);
      if (!display && f?.src) ids.add(f.src);
    }
  }
  return ids;
}

const scene = id => project.scenes.find(s => s.id === id);

// ---------- projet ----------
function blankProject() {
  return { id: 'p_' + uid(), name: 'Nouvelle visite', scenes: [], plan: null, start: null, created: Date.now(), updated: Date.now() };
}

let saveTimer = null, refreshTimer = null;
function commit({ props = false, list = true } = {}) {
  project.updated = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.put('projects', project), 300);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => viewer.refresh(project), 120);
  if (list) renderList();
  if (props) renderProps();
  $('#guide').hidden = project.scenes.length > 0;
}

async function loadProject(id) {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  project = await db.get('projects', id);
  const used = referencedImages(project);
  for (const im of await db.imagesOf(id)) {
    if (used.has(im.id)) urls.set(im.id, URL.createObjectURL(im.blob));
    else db.del('images', im.id); // image orpheline
  }
  try { localStorage.setItem('sv-last', id); } catch {}
  sel = project.scenes[0]?.id || null;
  $('#projName').value = project.name;
  await renderProjects();
  renderList();
  renderProps();
  $('#guide').hidden = project.scenes.length > 0;
  await viewer.refresh(project);
  if (sel && viewer.current() !== sel) viewer.goTo(sel, { instant: true });
}

async function newProject() {
  const p = blankProject();
  await db.put('projects', p);
  await loadProject(p.id);
}

async function deleteProject() {
  if (!confirm(`Supprimer définitivement le projet « ${project.name} » et ses photos ?`)) return;
  for (const im of await db.imagesOf(project.id)) await db.del('images', im.id);
  await db.del('projects', project.id);
  const rest = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  if (rest.length) await loadProject(rest[0].id); else await newProject();
}

async function renderProjects() {
  const list = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  $('#projSel').innerHTML = list.map(p => `<option value="${p.id}" ${p.id === project.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

// ---------- liste des pièces ----------
function renderList() {
  const box = $('#sceneList');
  box.innerHTML = project.scenes.length ? '' : '<p class="help">Aucune pièce pour l\'instant.</p>';
  const startId = project.start || project.scenes[0]?.id;
  for (const s of project.scenes) {
    const it = document.createElement('div');
    it.className = 'scene-item' + (s.id === sel ? ' sel' : '');
    const th = sceneThumb(s);
    const kind = s.type === 'room' ? 'Pièce 3D' : (s.hfov >= 359 ? 'Photo 360°' : `Panorama ${Math.round(s.hfov)}°`);
    it.innerHTML = `<div class="th" style="${th ? `background-image:url('${imageURL(th)}')` : ''}"></div>
      <div class="nm">${esc(s.name)} ${s.id === startId ? '<span class="star" title="Pièce de départ">★</span>' : ''}<small>${kind} · ${(s.hotspots || []).length} passage(s)</small></div>`;
    it.onclick = () => select(s.id);
    box.appendChild(it);
  }
}

function select(id) {
  if (sel === id) return;
  sel = id;
  setPicking(false);
  renderList();
  renderProps();
  if (viewer.current() !== id) viewer.goTo(id);
}

// ---------- panneau de propriétés ----------
function renderProps() {
  const s = scene(sel);
  const box = $('#props');
  const projectSection = `<section><h3>Projet</h3><button class="danger" id="pDelProj">Supprimer ce projet</button></section>`;
  if (!s) { box.innerHTML = projectSection; $('#pDelProj').onclick = deleteProject; return; }
  const others = project.scenes.filter(x => x.id !== s.id);
  const isStart = (project.start || project.scenes[0]?.id) === s.id;

  let typeBlock;
  if (s.type === 'pano') {
    typeBlock = `
      <div class="field">Angle horizontal couvert par la photo : <b id="pHfovV">${Math.round(s.hfov)}°</b>
        <input type="range" id="pHfov" min="30" max="360" step="1" value="${s.hfov}"></div>
      <p class="help">360° pour une photo sphérique (format 2:1). Panorama de téléphone : souvent entre 180° et 300°. Photo normale : environ 65°.</p>
      <label class="btn">Remplacer la photo…<input type="file" id="pReplace" accept="image/*" hidden></label>`;
  } else {
    const d = s.dims;
    typeBlock = `
      <div class="row">
        <label class="field">Largeur (m)<input type="number" id="pW" min="0.5" max="50" step="0.1" value="${d.w}"></label>
        <label class="field">Profondeur (m)<input type="number" id="pD" min="0.5" max="50" step="0.1" value="${d.d}"></label>
        <label class="field">Hauteur (m)<input type="number" id="pH" min="1.5" max="10" step="0.1" value="${d.h}"></label>
      </div>
      <p class="help">Touchez une case pour y plaquer une photo. « En face » = le mur que l'on voit en entrant.</p>
      <div class="faces">${FACE_ORDER.map(f => {
        const fc = s.faces?.[f];
        return `<button class="face ${fc ? 'has' : ''}" data-face="${f}" style="${fc ? `background-image:url('${imageURL(fc.img)}')` : ''}">
          ${fc ? `<span class="x btn" data-del="${f}" title="Retirer">×</span>` : ''}<span>${fc ? '' : '+ '}${FACE_LABEL[f]}</span></button>`;
      }).join('')}</div>`;
  }

  const hs = (s.hotspots || []).map((h, i) => `
    <div class="hs-row" data-i="${i}">
      <select data-k="target">${others.map(o => `<option value="${o.id}" ${o.id === h.target ? 'selected' : ''}>→ ${esc(o.name)}</option>`).join('')}</select>
      <input type="text" data-k="label" placeholder="Texte (facultatif)" value="${esc(h.label || '')}">
      <button class="ghost danger" data-k="del" title="Supprimer">✕</button>
    </div>`).join('');

  box.innerHTML = `
    <section class="stack">
      <h3>${s.type === 'room' ? 'Pièce 3D' : 'Pièce (photo)'}</h3>
      <label class="field">Nom<input type="text" id="pName" value="${esc(s.name)}"></label>
      ${typeBlock}
    </section>
    <section class="stack">
      <h3>Points de passage</h3>
      ${hs || '<p class="help">Aucun. Ajoutez-en un sur chaque porte pour passer d\'une pièce à l\'autre.</p>'}
      <button id="pAddHs" ${others.length ? '' : 'disabled title="Ajoutez d\'abord une autre pièce"'}>+ Ajouter un point de passage</button>
    </section>
    <section class="stack">
      <h3>Vue</h3>
      <button id="pView">Utiliser la vue actuelle comme vue d'arrivée</button>
      <button id="pStart" ${isStart ? 'disabled' : ''}>${isStart ? '★ Pièce de départ de la visite' : 'Définir comme pièce de départ'}</button>
      <div class="row"><button id="pUp" style="flex:1">↑ Monter</button><button id="pDown" style="flex:1">↓ Descendre</button></div>
      <button class="danger" id="pDel">Supprimer cette pièce</button>
    </section>
    ${projectSection}`;

  $('#pDelProj').onclick = deleteProject;
  $('#pName').oninput = e => { s.name = e.target.value; commit(); };
  if (s.type === 'pano') {
    $('#pHfov').oninput = e => { s.hfov = +e.target.value; $('#pHfovV').textContent = s.hfov + '°'; commit({ list: false }); };
    $('#pHfov').onchange = () => renderList();
    $('#pReplace').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      await busy('Préparation de la photo…', async () => {
        const im = await prepareImage(f, PANO_MAX);
        const old = s.image;
        s.image = await storeImage(im.blob);
        s.aspect = im.w / im.h;
        s.hfov = guessHfov(s.aspect);
        await dropImage(old);
      });
      commit({ props: true });
    };
  } else {
    for (const [k, idn] of [['w', '#pW'], ['d', '#pD'], ['h', '#pH']]) {
      $(idn).onchange = e => {
        const v = parseFloat(e.target.value);
        if (v > 0.2) { s.dims[k] = v; commit(); }
      };
    }
    box.querySelectorAll('.face').forEach(b => b.onclick = e => {
      const del = e.target.closest('[data-del]');
      if (del) { removeFace(s, del.dataset.del); return; }
      editFace(s, b.dataset.face);
    });
  }
  box.querySelectorAll('.hs-row').forEach(row => {
    const h = s.hotspots[+row.dataset.i];
    row.querySelector('[data-k=target]').onchange = e => { h.target = e.target.value; commit(); };
    row.querySelector('[data-k=label]').oninput = e => { h.label = e.target.value; commit({ list: false }); };
    row.querySelector('[data-k=del]').onclick = () => { s.hotspots.splice(+row.dataset.i, 1); commit({ props: true }); };
  });
  $('#pAddHs').onclick = () => setPicking(!picking);
  $('#pView').onclick = () => { s.view = viewer.getView(); commit(); toast('Vue d\'arrivée enregistrée'); };
  $('#pStart').onclick = () => { project.start = s.id; commit({ props: true }); };
  $('#pUp').onclick = () => move(s, -1);
  $('#pDown').onclick = () => move(s, 1);
  $('#pDel').onclick = () => deleteScene(s);
}

function move(s, dir) {
  const a = project.scenes, i = a.indexOf(s), j = i + dir;
  if (j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  commit();
}

async function deleteScene(s) {
  if (!confirm(`Supprimer la pièce « ${s.name} » ?`)) return;
  project.scenes = project.scenes.filter(x => x !== s);
  for (const o of project.scenes) o.hotspots = (o.hotspots || []).filter(h => h.target !== s.id);
  if (project.start === s.id) project.start = null;
  await dropImage(s.image);
  for (const f of Object.values(s.faces || {})) { await dropImage(f.img); await dropImage(f.src); }
  sel = project.scenes[0]?.id || null;
  commit({ props: true });
}

// ---------- points de passage ----------
function setPicking(on) {
  picking = on;
  viewer.setPicking(on);
  $('#pickHint').hidden = !on;
  const b = $('#pAddHs');
  if (b) b.textContent = on ? 'Annuler (cliquez dans la vue…)' : '+ Ajouter un point de passage';
}

function onPick({ sceneId, pos }) {
  if (!picking) return;
  const s = scene(sceneId);
  setPicking(false);
  if (!s) return;
  const linked = new Set((s.hotspots || []).map(h => h.target));
  const others = project.scenes.filter(x => x.id !== s.id);
  const target = (others.find(o => !linked.has(o.id)) || others[0])?.id;
  if (!target) return;
  (s.hotspots ||= []).push({ id: 'h_' + uid(), pos, target, label: '' });
  commit({ props: true });
  toast('Point ajouté — choisissez sa destination dans le panneau');
}

// ---------- ajout de pièces ----------
function guessHfov(aspect) {
  if (aspect > 1.9 && aspect < 2.1) return 360; // équirectangulaire
  if (aspect >= 2.1) return Math.min(360, Math.round(65 * aspect)); // panorama de téléphone
  return aspect >= 1 ? 65 : 50; // photo normale
}

function nameFromFile(f) {
  const n = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return n ? n[0].toUpperCase() + n.slice(1) : 'Pièce';
}

async function addPanos(files) {
  if (!files.length) return;
  let firstId = null;
  await busy(`Préparation de ${files.length} photo(s)…`, async () => {
    for (const f of files) {
      const im = await prepareImage(f, PANO_MAX);
      const s = {
        id: 's_' + uid(), type: 'pano', name: nameFromFile(f),
        image: await storeImage(im.blob), aspect: im.w / im.h, hfov: guessHfov(im.w / im.h),
        hotspots: [], view: { yaw: 0, pitch: 0 },
      };
      project.scenes.push(s);
      firstId ||= s.id;
    }
  });
  sel = firstId;
  commit({ props: true });
  await viewer.refresh(project);
  viewer.goTo(firstId);
}

function addRoom() {
  const s = { id: 's_' + uid(), type: 'room', name: 'Pièce 3D', dims: { w: 4, d: 5, h: 2.6 }, faces: {}, hotspots: [], view: null };
  project.scenes.push(s);
  sel = s.id;
  commit({ props: true });
  viewer.refresh(project).then(() => viewer.goTo(s.id));
}

// ---------- photos des murs (redressement) ----------
function faceSize(s, f) {
  const { w, d, h } = s.dims;
  return f === 'floor' || f === 'ceiling' ? [w, d] : f === 'north' || f === 'south' ? [w, h] : [d, h];
}

function pickFile(input) {
  return new Promise(res => {
    input.value = '';
    input.onchange = () => res(input.files[0] || null);
    input.click();
  });
}

async function editFace(s, f) {
  const cur = s.faces?.[f];
  let srcId = cur?.src, corners = cur?.corners;
  if (!srcId) {
    const file = await pickFile($('#inFace'));
    if (!file) return;
    const im = await busy('Chargement de la photo…', () => prepareImage(file, PHOTO_MAX));
    srcId = await storeImage(im.blob);
    corners = null;
  }
  const blob = await (await fetch(imageURL(srcId))).blob();
  const bmp = await createImageBitmap(blob);
  const [rw, rh] = faceSize(s, f);
  const res = await rectifyDialog(bmp, corners, `${FACE_LABEL[f]} — ${s.name} (${rw} × ${rh} m)`);
  if (!res) { if (!cur) await dropImage(srcId); bmp.close(); return; }
  await busy('Redressement…', async () => {
    const [ow, oh] = outputSize(rw, rh, 2048);
    const canvas = rectify(bmp, res, ow, oh);
    const out = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.88));
    const old = cur?.img;
    (s.faces ||= {})[f] = { img: await storeImage(out), src: srcId, corners: res };
    await dropImage(old);
  });
  bmp.close();
  commit({ props: true });
}

async function removeFace(s, f) {
  const fc = s.faces?.[f];
  if (!fc) return;
  delete s.faces[f];
  await dropImage(fc.img);
  await dropImage(fc.src);
  commit({ props: true });
}

/** Fenêtre de placement des 4 coins. Résout avec les coins [TL,TR,BR,BL] (px de l'image) ou null. */
function rectifyDialog(img, corners, title) {
  const W = img.width, H = img.height;
  const full = [[0, 0], [W, 0], [W, H], [0, H]];
  let pts = corners ? corners.map(p => [...p]) : [[W * 0.1, H * 0.1], [W * 0.9, H * 0.1], [W * 0.9, H * 0.9], [W * 0.1, H * 0.9]];
  const modal = $('#mRect'), cv = $('#rcCanvas'), ctx = cv.getContext('2d');
  $('#rcTitle').textContent = 'Redresser la photo — ' + title;
  modal.hidden = false;
  let drag = -1, fit = { s: 1, ox: 0, oy: 0 };

  function layout() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const pad = 24 * dpr;
    const s = Math.min((cv.width - 2 * pad) / W, (cv.height - 2 * pad) / H);
    fit = { s, ox: (cv.width - W * s) / 2, oy: (cv.height - H * s) / 2, dpr };
  }
  const toC = p => [fit.ox + p[0] * fit.s, fit.oy + p[1] * fit.s];
  const toI = (x, y) => [Math.min(W, Math.max(0, (x - fit.ox) / fit.s)), Math.min(H, Math.max(0, (y - fit.oy) / fit.s))];

  function draw() {
    const { dpr } = fit;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, fit.ox, fit.oy, W * fit.s, H * fit.s);
    const c = pts.map(toC);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cv.width, cv.height);
    ctx.moveTo(...c[0]); c.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ff7a50'; ctx.lineWidth = 2 * dpr;
    ctx.beginPath(); ctx.moveTo(...c[0]); c.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath(); ctx.stroke();
    ctx.restore();
    const labels = ['↖', '↗', '↘', '↙'];
    c.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p[0], p[1], 11 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = i === drag ? '#ff7a50' : '#fff'; ctx.fill();
      ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#d2552f'; ctx.stroke();
      ctx.fillStyle = '#d2552f'; ctx.font = `${12 * dpr}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], p[0], p[1]);
    });
    if (drag >= 0) { // loupe
      const R = 70 * dpr, z = 3, p = pts[drag], cp = c[drag];
      const lx = cp[0] < cv.width / 2 ? cv.width - R - 12 * dpr : R + 12 * dpr, ly = R + 12 * dpr;
      ctx.save();
      ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#000'; ctx.fillRect(lx - R, ly - R, 2 * R, 2 * R);
      const srcR = R / (fit.s * z);
      ctx.drawImage(img, p[0] - srcR, p[1] - srcR, srcR * 2, srcR * 2, lx - R, ly - R, 2 * R, 2 * R);
      ctx.strokeStyle = '#ff7a50'; ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.moveTo(lx - R, ly); ctx.lineTo(lx + R, ly); ctx.moveTo(lx, ly - R); ctx.lineTo(lx, ly + R); ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(lx, ly, R, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * dpr; ctx.stroke();
    }
  }

  const evPos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * fit.dpr, (e.clientY - r.top) * fit.dpr]; };
  cv.onpointerdown = e => {
    const [x, y] = evPos(e);
    let best = -1, bd = 40 * fit.dpr;
    pts.map(toC).forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    drag = best;
    cv.setPointerCapture(e.pointerId);
    draw();
  };
  cv.onpointermove = e => { if (drag < 0) return; pts[drag] = toI(...evPos(e)); draw(); };
  cv.onpointerup = () => { drag = -1; draw(); };
  const onResize = () => { layout(); draw(); };
  window.addEventListener('resize', onResize);
  requestAnimationFrame(onResize);

  return new Promise(res => {
    const close = v => { modal.hidden = true; window.removeEventListener('resize', onResize); res(v); };
    $('#rcRotate').onclick = () => { pts = [pts[3], pts[0], pts[1], pts[2]]; draw(); };
    $('#rcFull').onclick = () => { pts = full.map(p => [...p]); draw(); };
    $('#rcCancel').onclick = () => close(null);
    $('#rcOk').onclick = () => close(pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]));
  });
}

// ---------- plan ----------
let planSel = null;
function openPlan() {
  planSel = project.scenes.find(s => !s.map)?.id || project.scenes[0]?.id || null;
  $('#mPlan').hidden = false;
  renderPlan();
}

function renderPlan() {
  $('#planChips').innerHTML = project.scenes.map(s =>
    `<button data-id="${s.id}" class="${s.id === planSel ? 'sel' : ''}">${s.map ? '✓ ' : ''}${esc(s.name)}</button>`).join('') ||
    '<p class="help">Ajoutez d\'abord des pièces.</p>';
  $('#planChips').querySelectorAll('button').forEach(b => b.onclick = () => { planSel = b.dataset.id; renderPlan(); });
  const area = $('#planArea');
  area.className = project.plan ? '' : 'grid';
  area.style.backgroundImage = project.plan ? `url('${imageURL(project.plan.image)}')` : '';
  area.style.aspectRatio = String(project.plan?.aspect || 4 / 3);
  area.style.width = '100%';
  area.innerHTML = project.scenes.filter(s => s.map).map(s =>
    `<div class="dot" style="left:${s.map.x * 100}%;top:${s.map.y * 100}%">${esc(s.name)}</div>`).join('');
}

$('#planArea').onclick = e => {
  const s = scene(planSel);
  if (!s) return;
  const r = e.currentTarget.getBoundingClientRect();
  s.map = { x: +((e.clientX - r.left) / r.width).toFixed(4), y: +((e.clientY - r.top) / r.height).toFixed(4) };
  planSel = project.scenes.find(x => !x.map)?.id || planSel;
  commit();
  renderPlan();
};
$('#inPlan').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const im = await busy('Chargement du plan…', () => prepareImage(f, PLAN_MAX));
  const old = project.plan?.image;
  project.plan = { image: await storeImage(im.blob), aspect: im.w / im.h };
  await dropImage(old);
  commit();
  renderPlan();
};
$('#planClear').onclick = async () => {
  if (!project.plan) return;
  await dropImage(project.plan.image);
  project.plan = null;
  commit();
  renderPlan();
};
$('#planUnplace').onclick = () => { const s = scene(planSel); if (s) { delete s.map; commit(); renderPlan(); } };
$('#planDone').onclick = () => { $('#mPlan').hidden = true; };

// ---------- export ----------
let viewerSrc = null;
async function exportHTML() {
  viewerSrc ||= await (await fetch('viewer.js')).text();
  const ids = referencedImages(project, true);
  const images = {};
  for (const id of ids) images[id] = await blobToDataURL(await (await fetch(imageURL(id))).blob());
  const data = {
    name: project.name, start: project.start, plan: project.plan,
    scenes: project.scenes.map(s => ({
      ...s,
      faces: s.faces ? Object.fromEntries(Object.entries(s.faces).map(([k, v]) => [k, { img: v.img }])) : undefined,
    })),
  };
  const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(project.name)}</title>
<meta property="og:title" content="${esc(project.name)}">
<script type="importmap">{"imports":{"three":"${THREE_URL}"}}</script>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}</style>
</head>
<body>
<noscript>Activez JavaScript pour voir la visite.</noscript>
<script type="module">
${viewerSrc}
const DATA = ${json(data)};
const IMAGES = ${json(images)};
createViewer(document.body, DATA, id => IMAGES[id] || '');
</script>
</body>
</html>`;
}

function checkReady() {
  if (!project.scenes.length) { toast('Ajoutez au moins une pièce.'); return false; }
  return true;
}

$('#btnExport').onclick = async () => {
  if (!checkReady()) return;
  const html = await busy('Création de la visite…', exportHTML);
  const blob = new Blob([html], { type: 'text/html' });
  const name = `visite-${slug(project.name)}.html`;
  download(blob, name);
  $('#exName').textContent = name;
  $('#exSize').textContent = (blob.size / 1048576).toFixed(1) + ' Mo';
  $('#mExport').hidden = false;
};
$('#exClose').onclick = () => { $('#mExport').hidden = true; };

$('#btnPreview').onclick = async () => {
  if (!checkReady()) return;
  const html = await busy('Préparation de l\'aperçu…', exportHTML);
  const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const box = document.createElement('div');
  box.className = 'preview';
  box.innerHTML = `<iframe allow="fullscreen" allowfullscreen></iframe><button class="primary">Fermer l'aperçu</button>`;
  box.querySelector('iframe').src = u;
  box.querySelector('button').onclick = () => { box.remove(); URL.revokeObjectURL(u); };
  document.body.appendChild(box);
};

// ---------- fichier projet (.visite) ----------
$('#btnSave').onclick = async () => {
  const blob = await busy('Sauvegarde…', async () => {
    const images = {};
    for (const id of referencedImages(project)) images[id] = await blobToDataURL(await (await fetch(imageURL(id))).blob());
    return new Blob([JSON.stringify({ format: 'studio-visite', version: 1, project, images })], { type: 'application/json' });
  });
  download(blob, `${slug(project.name)}.visite`);
};

$('#btnOpen').onclick = async () => {
  const f = await pickFile($('#inProject'));
  if (!f) return;
  try {
    await busy('Ouverture…', async () => {
      const data = JSON.parse(await f.text());
      if (data.format !== 'studio-visite') throw new Error('format');
      let txt = JSON.stringify(data.project);
      const pid = 'p_' + uid();
      const remap = {};
      for (const id of Object.keys(data.images)) remap[id] = 'img_' + uid();
      for (const [a, b] of Object.entries(remap)) txt = txt.split(`"${a}"`).join(`"${b}"`);
      const p = JSON.parse(txt);
      p.id = pid;
      p.updated = Date.now();
      for (const [id, url] of Object.entries(data.images)) {
        await db.put('images', { id: remap[id], project: pid, blob: await (await fetch(url)).blob() });
      }
      await db.put('projects', p);
      await loadProject(pid);
    });
    toast('Projet ouvert');
  } catch (e) {
    console.error(e);
    toast('Fichier non reconnu.');
  }
};

// ---------- démarrage ----------
const viewer = createViewer($('#viewerHost'), blankProject(), imageURL, {
  onPick,
  onSceneChange: id => { if (sel !== id) { sel = id; setPicking(false); renderList(); renderProps(); } },
  emptyText: '',
});

$('#inPano').onchange = e => { const fs = [...e.target.files]; e.target.value = ''; addPanos(fs); };
$('#btnRoom').onclick = addRoom;
$('#btnPlan').onclick = openPlan;
$('#btnNew').onclick = newProject;
$('#projSel').onchange = e => loadProject(e.target.value);
$('#projName').oninput = e => { project.name = e.target.value; commit({ list: false }); };
$('#projName').onchange = () => renderProjects();
window.addEventListener('keydown', e => { if (e.key === 'Escape' && picking) setPicking(false); });

(async () => {
  const list = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  let last = null;
  try { last = localStorage.getItem('sv-last'); } catch {}
  const id = list.find(p => p.id === last)?.id || list[0]?.id;
  if (id) await loadProject(id); else await newProject();
})();
