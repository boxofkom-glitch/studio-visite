// Lecteur de visite virtuelle : utilisé par l'éditeur ET intégré tel quel dans la visite exportée.
import * as THREE from 'three';

const D2R = Math.PI / 180;
const EYE = 1.6;

const STYLE = `
.vt-root{position:absolute;inset:0;overflow:hidden;background:#111;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;touch-action:none}
.vt-root canvas{display:block;width:100%;height:100%;cursor:grab}
.vt-root.drag canvas{cursor:grabbing}
.vt-root.picking canvas{cursor:crosshair}
.vt-root.picking .vt-hs{pointer-events:none;opacity:.5}
.vt-fade{position:absolute;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .3s}
.vt-fade.on{opacity:1}
.vt-title{position:absolute;left:16px;top:14px;right:170px;text-shadow:0 1px 4px rgba(0,0,0,.8);pointer-events:none}
.vt-title b{display:block;font-size:12px;opacity:.85;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.vt-title span{font-size:20px;font-weight:600}
.vt-tools{position:absolute;right:12px;top:12px;display:flex;gap:8px}
.vt-btn{width:40px;height:40px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;cursor:pointer;display:grid;place-items:center;padding:0}
.vt-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.vt-btn:hover{background:rgba(0,0,0,.7)}
.vt-btn.on{background:#fff;color:#111}
.vt-strip{position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;padding:12px;overflow-x:auto;background:linear-gradient(transparent,rgba(0,0,0,.6))}
.vt-thumb{flex:0 0 auto;display:flex;flex-direction:column;align-items:stretch;width:104px;border:2px solid transparent;border-radius:8px;overflow:hidden;background:#333;cursor:pointer;padding:0;color:#fff;font:12px system-ui,sans-serif;text-align:left}
.vt-thumb.cur{border-color:#fff}
.vt-thumb div{flex:0 0 58px;background:#444 center/cover no-repeat}
.vt-thumb span{display:block;padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(0,0,0,.65)}
.vt-hs{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;border:0;background:none;color:#fff;padding:0;font:inherit;will-change:transform}
.vt-hs i{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.92);color:#111;display:grid;place-items:center;box-shadow:0 0 0 6px rgba(255,255,255,.3);animation:vtp 2s infinite}
.vt-hs i svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.vt-hs span{font-size:13px;font-weight:600;background:rgba(0,0,0,.65);padding:3px 9px;border-radius:10px;white-space:nowrap}
.vt-hs:hover i{background:#fff;transform:scale(1.08)}
@keyframes vtp{50%{box-shadow:0 0 0 11px rgba(255,255,255,.12)}}
.vt-map{position:absolute;right:12px;bottom:100px;width:200px;max-width:40%;border-radius:10px;overflow:hidden;background:rgba(20,20,20,.8);box-shadow:0 2px 12px rgba(0,0,0,.5)}
.vt-map .pl{position:relative;width:100%;background:#2a2a2a center/100% 100% no-repeat}
.vt-map .pl.grid{background-image:linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px);background-size:20px 20px}
.vt-map .dot{position:absolute;width:14px;height:14px;transform:translate(-50%,-50%);border-radius:50%;background:#fff;border:2px solid #222;cursor:pointer;padding:0}
.vt-map .dot.cur{background:#e8613c;border-color:#fff;width:18px;height:18px}
.vt-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.6);padding:10px 16px;border-radius:20px;font-size:14px;pointer-events:none;transition:opacity .6s;white-space:nowrap}
.vt-hint.off{opacity:0}
@media (max-width:600px){.vt-map{width:110px}.vt-thumb{width:84px}.vt-thumb div{flex-basis:44px}.vt-title span{font-size:17px}}
.vt-empty{position:absolute;inset:0;display:grid;place-items:center;color:#aaa;font-size:15px;pointer-events:none;text-align:center;padding:20px}
`;

const ICONS = {
  fs: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  rot: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/></svg>',
  go: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Image de vignette d'une pièce (photo 360° ou premier mur texturé). */
export function sceneThumb(s) {
  if (s.type === 'pano') return s.image;
  const f = s.faces || {};
  for (const k of ['north', 'east', 'west', 'south', 'floor', 'ceiling']) if (f[k]?.img) return f[k].img;
  return null;
}

/** Géométrie des 6 faces d'une pièce 3D : [nom, largeur, hauteur, position, rotation]. */
export function roomFaces(dims) {
  const { w, d, h } = dims;
  return [
    ['floor', w, d, [0, 0, 0], [-Math.PI / 2, 0, 0]],
    ['ceiling', w, d, [0, h, 0], [Math.PI / 2, 0, 0]],
    ['north', w, h, [0, h / 2, -d / 2], [0, 0, 0]],
    ['south', w, h, [0, h / 2, d / 2], [0, Math.PI, 0]],
    ['west', d, h, [-w / 2, h / 2, 0], [0, Math.PI / 2, 0]],
    ['east', d, h, [w / 2, h / 2, 0], [0, -Math.PI / 2, 0]],
  ];
}

const SHADE = { floor: 0xb9b1a4, ceiling: 0xf1efea, north: 0xe1dcd4, south: 0xd6d0c7, west: 0xdcd6ce, east: 0xd2ccc2 };

/**
 * Crée un lecteur dans `container`.
 * project : { name, scenes:[...], plan, start }
 * imageURL(id) : URL (blob: ou data:) d'une image
 * opts : { onSceneChange(id), onPick({sceneId,pos,face}), hint:true }
 */
export function createViewer(container, project, imageURL, opts = {}) {
  if (!document.getElementById('vt-style')) {
    const st = el('style');
    st.id = 'vt-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }
  const root = el('div', 'vt-root');
  container.appendChild(root);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  root.appendChild(renderer.domElement);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 2000);
  const world = new THREE.Scene();
  const group = new THREE.Group();
  world.add(group);

  const hsLayer = el('div');
  const fade = el('div', 'vt-fade');
  const title = el('div', 'vt-title');
  const tools = el('div', 'vt-tools');
  const strip = el('div', 'vt-strip');
  const map = el('div', 'vt-map');
  const hint = el('div', 'vt-hint off');
  const empty = el('div', 'vt-empty');
  root.append(hsLayer, title, tools, map, strip, hint, empty, fade);

  const btnRot = el('button', 'vt-btn', ICONS.rot);
  btnRot.title = 'Rotation automatique';
  const btnMap = el('button', 'vt-btn on', ICONS.map);
  btnMap.title = 'Plan';
  const btnFs = el('button', 'vt-btn', ICONS.fs);
  btnFs.title = 'Plein écran';
  tools.append(btnRot, btnMap, btnFs);

  let P = project;
  let cur = null; // pièce affichée
  let yaw = 0, pitch = 0, fov = 75;
  const pos = new THREE.Vector3(0, 0, 0);
  let walkTo = null;
  let autorotate = false, mapOn = true, picking = false, interacted = false;
  let hotspots = []; // {el, world:Vector3}
  let lastInput = performance.now();
  let token = 0;
  const texCache = new Map();
  const keys = new Set();

  // ---------- textures ----------
  function loadTex(id) {
    if (!id) return Promise.resolve(null);
    let e = texCache.get(id);
    if (!e) {
      e = new Promise(res => {
        const t = new THREE.TextureLoader().load(imageURL(id), () => res(t), undefined, () => res(null));
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso;
      });
      texCache.set(id, e);
    }
    return e;
  }

  function sceneTexIds(s) {
    if (s.type === 'pano') return [s.image];
    return Object.values(s.faces || {}).map(f => f?.img).filter(Boolean);
  }

  // ---------- construction des pièces ----------
  function clearGroup() {
    for (const o of [...group.children]) {
      group.remove(o);
      o.geometry?.dispose();
      o.material?.dispose();
    }
  }

  async function build(s) {
    const texs = {};
    for (const id of sceneTexIds(s)) texs[id] = await loadTex(id);
    clearGroup();
    if (s.type === 'pano') {
      const aspect = s.aspect || 2;
      const h = (s.hfov || 360) * D2R;
      const v = Math.min(Math.PI, h / aspect);
      const g = new THREE.SphereGeometry(500, 96, 48, -Math.PI / 2 - h / 2, h, (Math.PI - v) / 2, v);
      g.scale(-1, 1, 1);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: texs[s.image] || null, color: texs[s.image] ? 0xffffff : 0x333333 }));
      m.userData.face = 'pano';
      group.add(m);
    } else {
      for (const [f, pw, ph, p, r] of roomFaces(s.dims)) {
        const t = texs[s.faces?.[f]?.img];
        const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial(t ? { map: t } : { color: SHADE[f] }));
        m.position.set(...p);
        m.rotation.set(...r);
        m.userData.face = f;
        group.add(m);
      }
      const { w, d, h } = s.dims;
      const box = new THREE.BoxGeometry(w, h, d);
      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
      box.dispose();
      lines.position.y = h / 2;
      group.add(lines);
    }
    buildHotspots(s);
  }

  function buildHotspots(s) {
    hsLayer.innerHTML = '';
    hotspots = [];
    for (const h of s.hotspots || []) {
      const target = P.scenes.find(x => x.id === h.target);
      if (!target) continue;
      const b = el('button', 'vt-hs', `<i>${ICONS.go}</i><span>${esc(h.label || target.name)}</span>`);
      b.onclick = e => { e.stopPropagation(); goTo(target.id); };
      hsLayer.appendChild(b);
      const v = new THREE.Vector3(...h.pos);
      if (s.type === 'pano') v.normalize().multiplyScalar(100);
      hotspots.push({ el: b, world: v });
    }
  }

  function applyView(s) {
    const v = s.view || {};
    yaw = v.yaw || 0;
    pitch = v.pitch || 0;
    fov = 75;
    walkTo = null;
    if (s.type === 'room') {
      pos.set(v.x ?? 0, EYE, v.z ?? s.dims.d * 0.25);
      clampPos();
    } else pos.set(0, 0, 0);
  }

  // ---------- interface ----------
  function buildUI() {
    title.innerHTML = `<b>${esc(P.name || '')}</b><span>${esc(cur?.name || '')}</span>`;
    strip.innerHTML = '';
    strip.style.display = P.scenes.length > 1 ? '' : 'none';
    for (const s of P.scenes) {
      const t = el('button', 'vt-thumb' + (s === cur ? ' cur' : ''), `<div></div><span>${esc(s.name)}</span>`);
      const img = sceneThumb(s);
      if (img) t.firstChild.style.backgroundImage = `url("${imageURL(img)}")`;
      t.onclick = () => goTo(s.id);
      strip.appendChild(t);
    }
    map.innerHTML = '';
    const placed = P.scenes.filter(s => s.map);
    btnMap.style.display = placed.length ? '' : 'none';
    map.style.display = placed.length && mapOn ? '' : 'none';
    map.style.bottom = P.scenes.length > 1 ? '100px' : '12px';
    if (placed.length) {
      const pl = el('div', 'pl' + (P.plan ? '' : ' grid'));
      pl.style.aspectRatio = String(P.plan?.aspect || 4 / 3);
      if (P.plan) pl.style.backgroundImage = `url("${imageURL(P.plan.image)}")`;
      for (const s of placed) {
        const d = el('button', 'dot' + (s === cur ? ' cur' : ''));
        d.style.left = s.map.x * 100 + '%';
        d.style.top = s.map.y * 100 + '%';
        d.title = s.name;
        d.onclick = () => goTo(s.id);
        pl.appendChild(d);
      }
      map.appendChild(pl);
    }
    empty.textContent = P.scenes.length ? '' : (opts.emptyText || 'Aucune pièce');
    empty.style.display = P.scenes.length ? 'none' : '';
  }

  btnRot.onclick = () => { autorotate = !autorotate; btnRot.classList.toggle('on', autorotate); };
  btnMap.onclick = () => { mapOn = !mapOn; btnMap.classList.toggle('on', mapOn); buildUI(); };
  btnFs.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else (root.requestFullscreen || root.webkitRequestFullscreen)?.call(root);
  };

  function showHint() {
    if (interacted || opts.hint === false) return;
    hint.textContent = cur?.type === 'room'
      ? 'Glissez pour regarder · cliquez au sol pour avancer'
      : 'Glissez pour regarder autour';
    hint.classList.remove('off');
  }

  // ---------- navigation ----------
  async function goTo(id, { keepView = false, instant = false } = {}) {
    const s = P.scenes.find(x => x.id === id);
    if (!s) return;
    const my = ++token;
    if (!instant && cur) {
      fade.classList.add('on');
      await new Promise(r => setTimeout(r, 300));
    }
    await build(s);
    if (my !== token) return;
    const changed = cur !== s;
    cur = s;
    if (!keepView) applyView(s);
    buildUI();
    showHint();
    fade.classList.remove('on');
    if (changed) opts.onSceneChange?.(s.id);
  }

  // ---------- contrôles ----------
  const ptrs = new Map();
  let down = null, pinch = null;
  const cv = renderer.domElement;

  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov };
      down = null;
    }
    root.classList.add('drag');
    markInput();
  });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      fov = THREE.MathUtils.clamp(pinch.fov * pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), 30, 95);
      return;
    }
    if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    const k = (camera.fov * D2R) / Math.max(1, cv.clientHeight);
    yaw -= dx * k;
    pitch += dy * k;
    walkTo = null;
    markInput();
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) root.classList.remove('drag');
    if (down && ptrs.size === 0 && down.moved < 6 && performance.now() - down.t < 500) click(e);
    if (!ptrs.size) down = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; pinch = null; root.classList.remove('drag'); });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    fov = THREE.MathUtils.clamp(fov + e.deltaY * 0.04, 30, 95);
    markInput();
  }, { passive: false });

  const onKeyDown = e => {
    if (e.target.closest?.('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'z', 'q', 's', 'd', 'w', 'a'].includes(k)) {
      if (!root.isConnected || !root.offsetParent && document.fullscreenElement !== root) return;
      keys.add(k);
      markInput();
    }
  };
  const onKeyUp = e => keys.delete(e.key.toLowerCase());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  function markInput() {
    lastInput = performance.now();
    if (!interacted && cur) { interacted = true; hint.classList.add('off'); }
  }

  const ray = new THREE.Raycaster();
  function click(e) {
    if (!cur) return;
    const r = cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(group.children.filter(o => o.isMesh))[0];
    if (picking) {
      let p;
      if (cur.type === 'pano') p = ray.ray.direction.clone().normalize();
      else if (hit) p = hit.point.clone().lerp(new THREE.Vector3(0, cur.dims.h / 2, 0), 0.02);
      if (p) opts.onPick?.({ sceneId: cur.id, pos: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)], face: hit?.object.userData.face });
      return;
    }
    if (cur.type === 'room' && hit?.object.userData.face === 'floor') {
      walkTo = new THREE.Vector3(hit.point.x, EYE, hit.point.z);
    }
  }

  function clampPos() {
    if (cur?.type !== 'room') return;
    const m = 0.3, { w, d } = cur.dims;
    pos.x = THREE.MathUtils.clamp(pos.x, -w / 2 + m, w / 2 - m);
    pos.z = THREE.MathUtils.clamp(pos.z, -d / 2 + m, d / 2 - m);
    if (w < 2 * m) pos.x = 0;
    if (d < 2 * m) pos.z = 0;
  }

  // ---------- boucle ----------
  const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * renderer.getPixelRatio()) || cv.height !== Math.round(H * renderer.getPixelRatio())) {
      renderer.setSize(W, H, false);
    }
    camera.aspect = W / H;
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 12);

    if (cur) {
      const isRoom = cur.type === 'room';
      // déplacements clavier
      const rotK = (keys.has('arrowleft') || keys.has('q') || keys.has('a') ? -1 : 0) + (keys.has('arrowright') || keys.has('d') ? 1 : 0);
      const movK = (keys.has('arrowup') || keys.has('z') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
      yaw += rotK * dt * 1.4;
      if (isRoom && movK) {
        pos.x += Math.sin(yaw) * movK * dt * 1.6;
        pos.z -= Math.cos(yaw) * movK * dt * 1.6;
        walkTo = null;
      } else if (!isRoom && movK) pitch += movK * dt * 1.0;
      if (isRoom && walkTo) {
        tmp.subVectors(walkTo, pos);
        const dist = tmp.length();
        if (dist < 0.02) walkTo = null;
        else pos.addScaledVector(tmp, Math.min(1, dt * 3.5));
      }
      clampPos();
      if (autorotate && now - lastInput > 1500) yaw += dt * 0.08;

      // limites de vue (panoramas partiels)
      let pMax = 85 * D2R, pMin = -85 * D2R;
      if (cur.type === 'pano') {
        const h = (cur.hfov || 360) * D2R;
        const v = Math.min(Math.PI, h / (cur.aspect || 2));
        const camV = camera.fov * D2R;
        const camH = 2 * Math.atan(Math.tan(camV / 2) * camera.aspect);
        if (v < Math.PI * 0.99) {
          const lim = Math.max(0, v / 2 - camV / 2);
          pMax = Math.min(pMax, lim); pMin = Math.max(pMin, -lim);
        }
        if (h < Math.PI * 1.99) {
          const lim = Math.max(0, h / 2 - camH / 2);
          if (autorotate && Math.abs(yaw) >= lim && lim > 0) { autorotate = false; btnRot.classList.remove('on'); }
          yaw = THREE.MathUtils.clamp(yaw, -lim, lim);
        }
      }
      pitch = THREE.MathUtils.clamp(pitch, pMin, pMax);

      fwd.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      camera.position.copy(pos);
      camera.lookAt(tmp.copy(pos).add(fwd));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // points de passage (éléments HTML projetés)
      for (const h of hotspots) {
        tmp.copy(h.world).sub(camera.position);
        const vis = tmp.dot(fwd) > 0.05;
        if (vis) {
          tmp.copy(h.world).project(camera);
          const x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H;
          h.el.style.display = '';
          h.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-20px)`;
        } else h.el.style.display = 'none';
      }
    }
    renderer.render(world, camera);
  }
  let raf = requestAnimationFrame(frame);

  // ---------- démarrage ----------
  const first = P.scenes.find(s => s.id === P.start) || P.scenes[0];
  if (first) goTo(first.id, { instant: true }); else buildUI();

  return {
    root,
    goTo,
    current: () => cur?.id,
    /** Met à jour le projet sans réinitialiser la vue. */
    async refresh(p) {
      P = p;
      if (cur) {
        const s = P.scenes.find(x => x.id === cur.id);
        if (s) { cur = s; await build(s); buildUI(); return; }
      }
      cur = null;
      clearGroup();
      hsLayer.innerHTML = '';
      hotspots = [];
      const f = P.scenes.find(s => s.id === P.start) || P.scenes[0];
      if (f) await goTo(f.id, { instant: true }); else buildUI();
    },
    setPicking(on) { picking = on; root.classList.toggle('picking', on); },
    getView() {
      const v = { yaw: +yaw.toFixed(4), pitch: +pitch.toFixed(4) };
      if (cur?.type === 'room') { v.x = +pos.x.toFixed(3); v.z = +pos.z.toFixed(3); }
      return v;
    },
    forgetTexture(id) { texCache.delete(id); },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      clearGroup();
      for (const p of texCache.values()) p.then(t => t?.dispose());
      renderer.dispose();
      root.remove();
    },
  };
}
