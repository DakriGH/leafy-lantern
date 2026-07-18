// Segnaposto del PERCORSO click-to-move: una scia di puntini dal gatto alla
// meta + un anello pulsante sulla destinazione, così è chiaro dove sei
// diretto. Legge `controller.percorso` (celle [x,y,z]) e `controller.indice`.
// Unlit come tutto il resto (niente luci three reali).

import * as THREE from 'three';

const COLORE = 0xffc86e;               // ambra, come l'accento della GUI
const MAX_PUNTI = 96;

export class SegnaPercorso {
  constructor(scena) {
    // scia: nuvola di punti riciclata, riempita dai waypoint interpolati
    this._pos = new Float32Array(MAX_PUNTI * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.scia = new THREE.Points(g, new THREE.PointsMaterial({
      color: COLORE, size: 0.16, transparent: true, opacity: 0.9,
      depthWrite: false, sizeAttenuation: true,
    }));
    this.scia.frustumCulled = false;
    this.scia.renderOrder = 4;
    this.scia.visible = false;
    scena.add(this.scia);

    // destinazione: anello piatto che pulsa, con CONTORNO scuro dietro così si
    // vede anche su sabbia/erba chiara (prima spariva sui toni caldi)
    this.meta = new THREE.Group();
    const bordo = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.46, 30).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1a1206, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    bordo.position.y = -0.005;
    const anello = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 30).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COLORE, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this._anello = anello;
    this.meta.add(bordo, anello);
    this.meta.renderOrder = 4;
    this.meta.visible = false;
    scena.add(this.meta);

    this._t = 0;
    this._ultimo = null;             // riferimento all'ultimo percorso disegnato
  }

  /** Dal loop. `pos` = posizione attuale del gatto (per far partire la scia da lì). */
  aggiorna(controller, pos, dt) {
    const perc = controller.percorso;
    if (!perc || perc.length === 0) {
      if (this.scia.visible) { this.scia.visible = false; this.meta.visible = false; }
      this._ultimo = null;
      return;
    }

    // ricostruisci la scia solo se il percorso o il waypoint corrente cambiano
    const firma = perc.length * 1000 + controller.indice;
    if (firma !== this._ultimo) {
      this._ultimo = firma;
      let n = 0;
      // dal gatto al prossimo waypoint, poi via via fino alla meta
      let px = pos.x, pz = pos.z, py = pos.y + 0.05;
      for (let i = controller.indice; i < perc.length && n < MAX_PUNTI; i++) {
        const w = perc[i];
        const tx = w[0] + 0.5, tz = w[2] + 0.5, ty = w[1] + 0.05;
        const passi = 4;
        for (let s = 1; s <= passi && n < MAX_PUNTI; s++) {
          const f = s / passi;
          this._pos[n * 3] = px + (tx - px) * f;
          this._pos[n * 3 + 1] = py + (ty - py) * f;
          this._pos[n * 3 + 2] = pz + (tz - pz) * f;
          n++;
        }
        px = tx; pz = tz; py = ty;
      }
      this.scia.geometry.setDrawRange(0, n);
      this.scia.geometry.attributes.position.needsUpdate = true;
      const fine = perc[perc.length - 1];
      this.meta.position.set(fine[0] + 0.5, fine[1] + 0.06, fine[2] + 0.5);
    }

    this._t += dt;
    const pulse = 1 + Math.sin(this._t * 4) * 0.12;
    this.meta.scale.setScalar(pulse);
    this._anello.material.opacity = 0.65 + Math.sin(this._t * 4) * 0.25;
    this.scia.visible = true;
    this.meta.visible = true;
  }
}
