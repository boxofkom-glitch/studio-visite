// Lecteur de visite virtuelle : utilisé par l'éditeur ET intégré tel quel dans la visite exportée.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const D2R = Math.PI / 180;
const EYE = 1.6;

/**
 * Meubles et déco (dimensions par défaut en mètres). w = largeur, d = profondeur, h = hauteur.
 * y = hauteur du bas de l'objet par rapport au sol ('ceil' = sous le plafond). wall = se pose contre un mur.
 */
export const CATALOG = {
  canape: { label: 'Canapé', cat: 'Salon', w: 2.0, d: 0.9, h: 0.85, color: '#6b7b8c' },
  fauteuil: { label: 'Fauteuil', cat: 'Salon', w: 0.9, d: 0.85, h: 0.85, color: '#b0644a' },
  table_basse: { label: 'Table basse', cat: 'Salon', w: 1.1, d: 0.6, h: 0.4, color: '#8a5a3b' },
  meuble_tv: { label: 'Meuble TV', cat: 'Salon', w: 1.6, d: 0.42, h: 0.5, color: '#efece6' },
  tapis: { label: 'Tapis', cat: 'Salon', w: 2.0, d: 1.4, h: 0.01, color: '#a3523a', photo: true },
  table: { label: 'Table', cat: 'Repas', w: 1.6, d: 0.9, h: 0.75, color: '#8a5a3b' },
  table_ronde: { label: 'Table ronde', cat: 'Repas', w: 1.0, d: 1.0, h: 0.75, color: '#f2efe9' },
  chaise: { label: 'Chaise', cat: 'Repas', w: 0.45, d: 0.5, h: 0.9, color: '#2f2f2f' },
  tabouret: { label: 'Tabouret', cat: 'Repas', w: 0.38, d: 0.38, h: 0.75, color: '#c9a27a' },
  comptoir: { label: 'Comptoir / îlot', cat: 'Repas', w: 2.0, d: 0.65, h: 0.92, color: '#3d5a66', photo: true },
  lit: { label: 'Lit', cat: 'Chambre', w: 1.6, d: 2.05, h: 1.0, color: '#d8cbb8' },
  chevet: { label: 'Table de chevet', cat: 'Chambre', w: 0.45, d: 0.4, h: 0.5, color: '#efece6' },
  armoire: { label: 'Armoire / placard', cat: 'Chambre', w: 1.2, d: 0.6, h: 2.1, color: '#efece6' },
  bureau: { label: 'Bureau', cat: 'Chambre', w: 1.2, d: 0.6, h: 0.75, color: '#f2efe9' },
  etagere: { label: 'Étagère', cat: 'Rangement', w: 0.9, d: 0.35, h: 1.8, color: '#a77b52' },
  commode: { label: 'Commode', cat: 'Rangement', w: 1.0, d: 0.5, h: 0.85, color: '#a77b52' },
  plante: { label: 'Plante', cat: 'Déco', w: 0.6, d: 0.6, h: 1.2, color: '#3f7d3a' },
  lampadaire: { label: 'Lampadaire', cat: 'Déco', w: 0.44, d: 0.44, h: 1.6, color: '#f3e3c3' },
  suspension: { label: 'Suspension', cat: 'Déco', w: 0.38, d: 0.38, h: 0.25, color: '#e9e4da', y: 'ceil' },
  cadre: { label: 'Cadre / tableau', cat: 'Déco', w: 0.8, d: 0.03, h: 0.6, color: '#222222', y: 1.3, wall: true, photo: true },
  miroir: { label: 'Miroir', cat: 'Déco', w: 0.6, d: 0.03, h: 1.2, color: '#c9a86a', y: 0.6, wall: true },
  fenetre: { label: 'Fenêtre', cat: 'Murs', w: 1.2, d: 0.08, h: 1.35, color: '#ffffff', y: 0.9, wall: true, photo: true },
  porte: { label: 'Porte (passage)', cat: 'Murs', w: 0.9, d: 0.06, h: 2.05, color: '#f0ede8', wall: true, photo: true, door: true },
  baignoire: { label: 'Baignoire', cat: 'Salle de bain', w: 1.7, d: 0.75, h: 0.58, color: '#f7f7f5' },
  douche: { label: 'Douche', cat: 'Salle de bain', w: 0.9, d: 0.9, h: 2.0, color: '#f7f7f5' },
  vasque: { label: 'Meuble vasque', cat: 'Salle de bain', w: 0.8, d: 0.48, h: 0.85, color: '#efece6' },
  wc: { label: 'WC', cat: 'Salle de bain', w: 0.38, d: 0.65, h: 0.78, color: '#f7f7f5' },
  boite: { label: 'Bloc personnalisé', cat: 'Autre', w: 1.0, d: 1.0, h: 1.0, color: '#cccccc', photo: true },
  modele: { label: 'Modèle 3D (.glb)', cat: 'Autre', w: 1.0, d: 1.0, h: 1.0, color: '#cccccc' },
};

/** Construit un meuble (origine = centre au sol, avant = +z local). */
function buildItem(it, roomH, tex, model) {
  const g = new THREE.Group();
  const { w, d, h } = it;
  const col = new THREE.Color(it.color || CATALOG[it.kind]?.color || '#cccccc');
  const m = new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.4, metalness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.6 });
  const photo = tex ? new THREE.MeshBasicMaterial({ map: tex }) : null;
  const B = (bw, bh, bd, x, y, z, mat = m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(Math.max(bw, 0.001), Math.max(bh, 0.001), Math.max(bd, 0.001)), mat);
    o.position.set(x, y, z); g.add(o); return o;
  };
  const C = (rt, rb, ch, x, y, z, mat = m, open = false) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, Math.max(ch, 0.001), 32, 1, open), mat);
    o.position.set(x, y, z); g.add(o); return o;
  };
  const P = (pw, ph, x, y, z, mat, rx = 0) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o;
  };
  const corners = (fn, ix, iz) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) fn(sx * ix, sz * iz); };

  switch (it.kind) {
    case 'table': case 'bureau': case 'table_basse':
      B(w, 0.04, d, 0, h - 0.02, 0);
      corners((x, z) => B(0.05, h - 0.04, 0.05, x, (h - 0.04) / 2, z, it.kind === 'table_basse' ? m : dark), w / 2 - 0.06, d / 2 - 0.06);
      break;
    case 'table_ronde':
      C(w / 2, w / 2, 0.04, 0, h - 0.02, 0);
      C(0.04, 0.04, h - 0.04, 0, (h - 0.04) / 2, 0, dark);
      C(w * 0.25, w * 0.28, 0.03, 0, 0.015, 0, dark);
      break;
    case 'chaise': {
      const sh = Math.min(0.46, h * 0.55);
      B(w, 0.05, d, 0, sh, 0);
      corners((x, z) => B(0.035, sh, 0.035, x, sh / 2, z, dark), w / 2 - 0.03, d / 2 - 0.03);
      B(w, h - sh, 0.04, 0, sh + (h - sh) / 2, -d / 2 + 0.02);
      break;
    }
    case 'tabouret':
      C(w / 2, w / 2, 0.05, 0, h - 0.025, 0);
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) C(0.015, 0.015, h - 0.05, x * w * 0.32, (h - 0.05) / 2, z * w * 0.32, dark);
      C(w * 0.33, w * 0.33, 0.012, 0, h * 0.3, 0, dark);
      break;
    case 'canape': case 'fauteuil': {
      const aw = Math.min(0.2, w * 0.18), sh = 0.42;
      B(w, sh - 0.12, d, 0, 0.05 + (sh - 0.12) / 2, 0);
      B(w - 2 * aw, 0.14, d - 0.22, 0, sh - 0.02, 0.11);
      B(w, h - 0.05, 0.22, 0, 0.05 + (h - 0.05) / 2, -d / 2 + 0.11);
      for (const s of [-1, 1]) B(aw, 0.62, d, s * (w / 2 - aw / 2), 0.36, 0);
      corners((x, z) => B(0.04, 0.05, 0.04, x, 0.025, z, dark), w / 2 - 0.05, d / 2 - 0.05);
      break;
    }
    case 'meuble_tv': case 'commode': case 'chevet': case 'vasque': {
      const legs = it.kind === 'vasque' ? 0 : 0.08;
      B(w, h - legs, d, 0, legs + (h - legs) / 2, 0);
      if (legs) corners((x, z) => B(0.03, legs, 0.03, x, legs / 2, z, dark), w / 2 - 0.04, d / 2 - 0.04);
      const n = it.kind === 'commode' ? 3 : it.kind === 'meuble_tv' ? 1 : 2;
      for (let i = 1; i < n + (it.kind === 'meuble_tv' ? 1 : 0); i++) B(w * 0.96, 0.006, 0.004, 0, legs + (h - legs) * i / (n + (it.kind === 'meuble_tv' ? 1 : 0)), d / 2 + 0.002, dark);
      if (it.kind === 'meuble_tv') {
        B(Math.min(w * 0.85, 1.25), 0.72, 0.04, 0, h + 0.42, -d / 4, dark);
        B(0.25, 0.06, 0.18, 0, h + 0.03, -d / 4, dark);
      }
      if (it.kind === 'vasque') {
        B(w + 0.02, 0.03, d + 0.02, 0, h + 0.015, 0, white);
        C(0.17, 0.13, 0.12, 0, h + 0.09, 0.02, white);
        C(0.012, 0.012, 0.25, 0, h + 0.125, -d / 2 + 0.07, dark);
        B(w * 0.8, 0.7, 0.02, 0, h + 0.75, -d / 2 + 0.01, new THREE.MeshBasicMaterial({ color: 0xc9d6dd }));
      }
      break;
    }
    case 'lit':
      B(w, 0.3, d, 0, 0.15, 0);
      B(w - 0.04, 0.22, d - 0.1, 0, 0.41, 0.04, white);
      for (const s of [-1, 1]) B(w * 0.38, 0.1, 0.32, s * w * 0.22, 0.57, -d / 2 + 0.3, white);
      B(w - 0.02, 0.06, d * 0.55, 0, 0.53, d * 0.2, m);
      B(w, h, 0.08, 0, h / 2, -d / 2 + 0.04);
      break;
    case 'armoire':
      B(w, h, d, 0, h / 2, 0);
      B(0.008, h * 0.96, 0.006, 0, h / 2, d / 2 + 0.003, dark);
      for (const s of [-1, 1]) B(0.02, 0.25, 0.02, s * 0.05, h * 0.5, d / 2 + 0.015, dark);
      break;
    case 'etagere': {
      for (const s of [-1, 1]) B(0.03, h, d, s * (w / 2 - 0.015), h / 2, 0);
      B(w, h, 0.012, 0, h / 2, -d / 2 + 0.006);
      const n = Math.max(2, Math.round(h / 0.38));
      for (let i = 0; i < n; i++) B(w - 0.06, 0.025, d - 0.012, 0, 0.0125 + i * (h - 0.025) / (n - 1), 0.006);
      break;
    }
    case 'comptoir':
      B(w, h - 0.04, d - 0.04, 0, (h - 0.04) / 2, 0);
      B(w + 0.04, 0.04, d + 0.02, 0, h - 0.02, 0, white);
      if (photo) P(w, h - 0.04, 0, (h - 0.04) / 2, (d - 0.04) / 2 + 0.002, photo);
      break;
    case 'plante': {
      const r = w / 2;
      const pot = new THREE.MeshStandardMaterial({ color: 0xb5653c, roughness: 0.9 });
      C(r * 0.5, r * 0.38, 0.32, 0, 0.16, 0, pot);
      C(0.02, 0.025, h * 0.5, 0, 0.32 + h * 0.2, 0, new THREE.MeshStandardMaterial({ color: 0x5b4030 }));
      const leaf = new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, flatShading: true });
      for (let i = 0; i < 6; i++) {
        const a = i * 2.3, t = i / 5, rr = r * (0.55 - t * 0.25);
        const o = new THREE.Mesh(new THREE.IcosahedronGeometry(rr, 1), leaf);
        o.position.set(Math.cos(a) * r * 0.3 * (1 - t), 0.45 + (h - 0.45 - rr) * t, Math.sin(a) * r * 0.3 * (1 - t));
        g.add(o);
      }
      break;
    }
    case 'lampadaire': {
      C(0.15, 0.16, 0.03, 0, 0.015, 0, dark);
      C(0.013, 0.013, h - 0.28, 0, 0.03 + (h - 0.28) / 2, 0, dark);
      const shade = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, side: THREE.DoubleSide });
      C(w * 0.3, w / 2, 0.3, 0, h - 0.15, 0, shade, true);
      break;
    }
    case 'suspension': {
      const shade = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.5 });
      C(0.05, w / 2, h, 0, h / 2, 0, shade, true);
      C(w * 0.12, w * 0.12, 0.02, 0, 0.05, 0, new THREE.MeshBasicMaterial({ color: 0xfff3d6 }));
      const cord = Math.max(0.01, roomH - (it.y || 0) - h);
      C(0.004, 0.004, cord, 0, h + cord / 2, 0, dark);
      break;
    }
    case 'cadre':
      B(w, h, d, 0, h / 2, 0);
      P(w - 0.08, h - 0.08, 0, h / 2, d / 2 + 0.002, photo || white);
      break;
    case 'miroir':
      B(w, h, d, 0, h / 2, 0);
      P(w - 0.06, h - 0.06, 0, h / 2, d / 2 + 0.002, new THREE.MeshBasicMaterial({ color: 0xc9d6dd }));
      break;
    case 'tapis':
      P(w, d, 0, 0.006, 0, photo || m, -Math.PI / 2);
      break;
    case 'fenetre': {
      const t = 0.06;
      B(w, t, d, 0, t / 2, 0); B(w, t, d, 0, h - t / 2, 0);
      for (const s of [-1, 1]) B(t, h, d, s * (w / 2 - t / 2), h / 2, 0);
      B(0.04, h - 2 * t, d * 0.8, 0, h / 2, 0);
      const glass = photo || new THREE.MeshBasicMaterial({ color: 0xcfe3f0 });
      P(w - 2 * t, h - 2 * t, 0, h / 2, 0, glass);
      B(w + 0.1, 0.03, 0.18, 0, -0.015, 0.06, white);
      break;
    }
    case 'porte': {
      const frame = new THREE.MeshStandardMaterial({ color: 0xf3f1ec });
      B(w + 0.12, 0.06, d + 0.03, 0, h + 0.03, 0, frame);
      for (const s of [-1, 1]) B(0.06, h, d + 0.03, s * (w / 2 + 0.03), h / 2, 0, frame);
      B(w, h, d * 0.6, 0, h / 2, 0);
      if (photo) P(w, h, 0, h / 2, d * 0.3 + 0.002, photo);
      B(0.12, 0.02, 0.04, w / 2 - 0.12, h * 0.48, d * 0.3 + 0.03, dark);
      break;
    }
    case 'baignoire':
      B(w, h, d, 0, h / 2, 0, white);
      B(w - 0.12, 0.02, d - 0.12, 0, h - 0.005, 0, new THREE.MeshStandardMaterial({ color: 0xe9eef0 }));
      C(0.012, 0.012, 0.2, w / 2 - 0.1, h + 0.1, -d / 2 + 0.06, dark);
      break;
    case 'douche': {
      const glass = new THREE.MeshStandardMaterial({ color: 0xdfeef3, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      B(w, 0.05, d, 0, 0.025, 0, white);
      P(w, h - 0.05, 0, 0.05 + (h - 0.05) / 2, d / 2, glass);
      C(0.1, 0.1, 0.01, 0, h - 0.1, -d / 2 + 0.2, dark);
      C(0.01, 0.01, 0.2, 0, h - 0.0, -d / 2 + 0.2, dark);
      break;
    }
    case 'wc':
      B(w * 0.8, 0.38, d * 0.55, 0, 0.19, 0.05, white);
      C(w / 2, w * 0.45, 0.06, 0, 0.41, 0.06, white);
      B(w, 0.38, 0.17, 0, 0.6, -d / 2 + 0.085, white);
      break;
    case 'modele':
      if (model) {
        const o = model.clone(true);
        const box = new THREE.Box3().setFromObject(o), size = box.getSize(new THREE.Vector3());
        o.scale.multiplyScalar(size.y > 0 ? h / size.y : 1);
        const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3());
        o.position.x -= c.x; o.position.z -= c.z; o.position.y -= b2.min.y;
        o.traverse(n => { n.userData.cached = true; });
        g.add(o);
      } else B(w, h, d, 0, h / 2, 0, new THREE.MeshStandardMaterial({ color: 0x999999, wireframe: true }));
      break;
    default: // bloc personnalisé
      B(w, h, d, 0, h / 2, 0, photo || m);
  }
  g.position.set(it.x || 0, it.y || 0, it.z || 0);
  g.rotation.y = (it.rot || 0) * D2R;
  g.traverse(o => { o.userData.itemId = it.id; });
  return g;
}

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
.vt-card{position:absolute;left:12px;bottom:100px;width:260px;max-width:calc(100% - 24px);background:rgba(255,255,255,.95);color:#1d1b18;border-radius:12px;padding:12px 14px;box-shadow:0 4px 18px rgba(0,0,0,.35);font-size:13px;line-height:1.45}
.vt-card h4{margin:0 0 2px;font-size:15px}
.vt-card .pr{font-size:18px;font-weight:700;color:#c2462a}
.vt-card .ag{margin-top:8px;padding-top:8px;border-top:1px solid #e5e1da;color:#555}
.vt-card a{color:#c2462a}
.vt-btn b{font:700 17px Georgia,serif}
@media (max-width:600px){.vt-card{bottom:84px;width:200px;font-size:12px}}
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
  world.add(new THREE.HemisphereLight(0xffffff, 0x8a8070, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3, 6, 4);
  world.add(sun);
  const gltfLoader = new GLTFLoader();
  const modelCache = new Map();
  const itemGroups = new Map();
  let selItem = null, selHelper = null;

  const hsLayer = el('div');
  const fade = el('div', 'vt-fade');
  const title = el('div', 'vt-title');
  const tools = el('div', 'vt-tools');
  const strip = el('div', 'vt-strip');
  const map = el('div', 'vt-map');
  const hint = el('div', 'vt-hint off');
  const empty = el('div', 'vt-empty');
  const card = el('div', 'vt-card');
  root.append(hsLayer, title, tools, map, card, strip, hint, empty, fade);

  const btnInfo = el('button', 'vt-btn on', '<b>i</b>');
  btnInfo.title = 'Informations';
  let infoOn = true;
  btnInfo.onclick = () => { infoOn = !infoOn; btnInfo.classList.toggle('on', infoOn); buildUI(); };
  tools.append(btnInfo);
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
    return [...Object.values(s.faces || {}).map(f => f?.img), ...(s.items || []).map(i => i.img)].filter(Boolean);
  }

  function loadModel(id) {
    if (!id) return Promise.resolve(null);
    let p = modelCache.get(id);
    if (!p) {
      p = new Promise(res => gltfLoader.load(imageURL(id), g => res(g.scene), undefined, () => res(null)));
      modelCache.set(id, p);
    }
    return p;
  }

  // ---------- construction des pièces ----------
  function clearGroup() {
    selHelper = null;
    itemGroups.clear();
    for (const o of [...group.children]) {
      group.remove(o);
      o.traverse(n => {
        if (n.userData.cached) return;
        n.geometry?.dispose();
        n.material?.dispose?.();
      });
    }
  }

  function updateSel() {
    if (selHelper) { group.remove(selHelper); selHelper.geometry.dispose(); selHelper = null; }
    const g = itemGroups.get(selItem);
    if (g) { selHelper = new THREE.BoxHelper(g, 0xff6a3d); group.add(selHelper); }
  }

  async function build(s) {
    const texs = {}, models = {};
    for (const id of sceneTexIds(s)) texs[id] = await loadTex(id);
    for (const it of s.items || []) if (it.model) models[it.model] = await loadModel(it.model);
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
      for (const it of s.items || []) {
        const g = buildItem(it, h, texs[it.img], models[it.model]);
        itemGroups.set(it.id, g);
        group.add(g);
      }
      updateSel();
    }
    buildHotspots(s);
  }

  function buildHotspots(s) {
    hsLayer.innerHTML = '';
    hotspots = [];
    const add = (target, label, v) => {
      const b = el('button', 'vt-hs', `<i>${ICONS.go}</i><span>${esc(label || target.name)}</span>`);
      b.onclick = e => { e.stopPropagation(); goTo(target.id); };
      hsLayer.appendChild(b);
      hotspots.push({ el: b, world: v });
    };
    for (const h of s.hotspots || []) {
      const target = P.scenes.find(x => x.id === h.target);
      if (!target) continue;
      const v = new THREE.Vector3(...h.pos);
      if (s.type === 'pano') v.normalize().multiplyScalar(100);
      add(target, h.label, v);
    }
    for (const it of s.items || []) {
      const target = it.kind === 'porte' && P.scenes.find(x => x.id === it.target);
      const g = itemGroups.get(it.id);
      if (!target || !g) continue;
      g.updateMatrixWorld(true);
      add(target, it.label, g.localToWorld(new THREE.Vector3(0, Math.min(it.h * 0.6, 1.3), it.d / 2 + 0.05)));
    }
  }

  function applyView(s) {
    const v = s.view || {};
    yaw = v.yaw || 0;
    pitch = v.pitch || 0;
    fov = 75;
    walkTo = null;
    if (s.type === 'room') {
      pos.set(v.x ?? 0, EYE, v.z ?? s.dims.d / 2 - 0.35);
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
    const I = P.info || {};
    const hasInfo = ['titre', 'prix', 'surface', 'details', 'agence', 'contact'].some(k => I[k]);
    btnInfo.style.display = hasInfo ? '' : 'none';
    card.style.display = hasInfo && infoOn ? '' : 'none';
    card.style.bottom = P.scenes.length > 1 ? '' : '12px';
    if (hasInfo) {
      const link = c => /@/.test(c) ? `<a href="mailto:${esc(c)}">${esc(c)}</a>`
        : /^[+\d][\d .-]{6,}$/.test(c) ? `<a href="tel:${esc(c.replace(/[ .-]/g, ''))}">${esc(c)}</a>` : esc(c);
      card.innerHTML = (I.titre ? `<h4>${esc(I.titre)}</h4>` : '') +
        (I.prix ? `<div class="pr">${esc(I.prix)}</div>` : '') +
        [I.surface, I.details].filter(Boolean).map(t => `<div>${esc(t)}</div>`).join('') +
        (I.agence || I.contact ? `<div class="ag">${I.agence ? `<b>${esc(I.agence)}</b><br>` : ''}${(I.contact || '').split(/\s*[,;\n]\s*/).filter(Boolean).map(link).join('<br>')}</div>` : '');
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
    if (ptrs.size === 1) {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
      // éditeur : saisir un meuble pour le faire glisser au sol
      if (opts.editItems && !picking && cur?.type === 'room') {
        const hit = hitAt(e), id = hit?.object.userData.itemId;
        const g = itemGroups.get(id), p = hit?.point;
        if (g) {
          // plan horizontal à la hauteur du point saisi : le meuble suit le doigt même saisi en hauteur
          down.drag = { id, dx: g.position.x - p.x, dz: g.position.z - p.z, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -p.y) };
          if (selItem !== id) { selItem = id; updateSel(); opts.onItemSelect?.(id); }
        }
      }
    }
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
    if (down?.drag) {
      const it = cur.items?.find(i => i.id === down.drag.id), g = itemGroups.get(down.drag.id), p = new THREE.Vector3();
      hitAt(e, false);
      if (it && g && ray.ray.intersectPlane(down.drag.plane, p)) {
        const { w, d } = cur.dims;
        it.x = +THREE.MathUtils.clamp(p.x + down.drag.dx, -w / 2, w / 2).toFixed(3);
        it.z = +THREE.MathUtils.clamp(p.z + down.drag.dz, -d / 2, d / 2).toFixed(3);
        g.position.x = it.x; g.position.z = it.z;
        selHelper?.update();
      }
      return;
    }
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
    if (endDrag()) return;
    if (down && ptrs.size === 0 && down.moved < 6 && performance.now() - down.t < 500) click(e);
    if (!ptrs.size) down = null;
  };
  cv.addEventListener('pointerup', up);
  /** Fin du déplacement d'un meuble : replace les points de passage et prévient l'éditeur. */
  function endDrag() {
    if (!down?.drag || down.moved < 6) return false;
    const id = down.drag.id;
    down = null;
    buildHotspots(cur);
    opts.onItemChange?.(id);
    return true;
  }
  cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); endDrag(); down = null; pinch = null; root.classList.remove('drag'); });
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
  /** Positionne le rayon sous le pointeur et renvoie le premier objet touché. */
  function hitAt(e, intersect = true) {
    const r = cv.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    return intersect ? ray.intersectObjects(group.children, true).find(h => h.object.isMesh) : null;
  }

  function click(e) {
    if (!cur) return;
    const hit = hitAt(e);
    const itemId = hit?.object.userData.itemId;
    if (picking) {
      let p;
      if (cur.type === 'pano') p = ray.ray.direction.clone().normalize();
      else if (hit) p = hit.point.clone().lerp(new THREE.Vector3(0, cur.dims.h / 2, 0), 0.02);
      if (p) opts.onPick?.({ sceneId: cur.id, pos: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)], face: hit?.object.userData.face });
      return;
    }
    if (itemId) {
      const it = cur.items?.find(i => i.id === itemId);
      if (opts.editItems) { selItem = itemId; updateSel(); opts.onItemSelect?.(itemId); }
      else if (it?.kind === 'porte' && it.target) goTo(it.target);
      return;
    }
    if (opts.editItems && selItem) { selItem = null; updateSel(); opts.onItemSelect?.(null); }
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
    selectItem(id) { selItem = id; updateSel(); },
    /** Point au sol à ~1,5 m devant la caméra (dans la pièce 3D affichée). */
    frontPoint() {
      if (cur?.type !== 'room') return { x: 0, z: 0 };
      const { w, d } = cur.dims;
      return {
        x: +THREE.MathUtils.clamp(pos.x + Math.sin(yaw) * 1.5, -w / 2 + 0.4, w / 2 - 0.4).toFixed(2),
        z: +THREE.MathUtils.clamp(pos.z - Math.cos(yaw) * 1.5, -d / 2 + 0.4, d / 2 - 0.4).toFixed(2),
      };
    },
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
