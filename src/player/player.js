// Il gattino: mesh procedurale in stile mockup (flat, niente shading),
// animazioni procedurali (passo, respiro, salto). Fluttua di 1 px come tutto.

import * as THREE from 'three';
import { PX } from '../config.js?v=mrt9jcee';
import { patchLuci } from '../fx/materials.js?v=mrt9jcee';

const mat = (colore) => patchLuci(new THREE.MeshBasicMaterial({ color: colore }));

export class Gatto {
  constructor(colore = 0x2f9be8, scuro = 0x1d5fa8) {
    this.gruppo = new THREE.Group();          // ancorato ai piedi
    this.corpo = new THREE.Group();           // parte animata (bob/squash)
    this.gruppo.add(this.corpo);

    const mCorpo = mat(colore), mScuro = mat(scuro);

    const busto = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.38), mCorpo);
    busto.position.y = 0.27;
    const testa = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.46, 0.48), mCorpo);
    testa.position.y = 0.76;

    const orecchio = new THREE.ConeGeometry(0.1, 0.26, 4);
    const orecchioS = new THREE.Mesh(orecchio, mScuro);
    orecchioS.position.set(-0.15, 1.08, 0); orecchioS.rotation.y = Math.PI / 4;
    const orecchioD = orecchioS.clone(); orecchioD.position.x = 0.15;

    const mBianco = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mNero = new THREE.MeshBasicMaterial({ color: 0x101418 });
    const occhio = new THREE.BoxGeometry(0.07, 0.15, 0.02);
    const occhioS = new THREE.Mesh(occhio, mBianco);
    occhioS.position.set(-0.11, 0.78, 0.245);
    const occhioD = occhioS.clone(); occhioD.position.x = 0.11;
    const pupilla = new THREE.BoxGeometry(0.035, 0.07, 0.02);
    const pupillaS = new THREE.Mesh(pupilla, mNero);
    pupillaS.position.set(-0.11, 0.765, 0.252);
    const pupillaD = pupillaS.clone(); pupillaD.position.x = 0.11;

    const coda = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.34), mScuro);
    coda.position.set(0, 0.36, -0.28); coda.rotation.x = -0.85;
    this.coda = coda;

    this.corpo.add(busto, testa, orecchioS, orecchioD, occhioS, occhioD, pupillaS, pupillaD, coda);

    this._t = 0;
    this._yaw = 0;
    this._squash = 0;
  }

  /** Sincronizza posa e animazione. piedi = Vector3 dei piedi (fisica). */
  aggiorna(dt, piedi, velX, velZ, aTerra) {
    this._t += dt;
    this.gruppo.position.set(piedi.x, piedi.y + PX, piedi.z); // fluttua di 1 px

    const velPiana = Math.hypot(velX, velZ);
    if (velPiana > 0.3) {
      const target = Math.atan2(velX, velZ);
      let d = target - this._yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      this._yaw += d * Math.min(1, dt * 12);
      this.gruppo.rotation.y = this._yaw;
    }

    // passo saltellante da diorama / respiro da fermo / stiramento in aria
    let bob = 0, scalaY = 1;
    if (!aTerra) {
      scalaY = 1.07;
      this._squash = 0.16;
    } else if (velPiana > 0.3) {
      bob = Math.abs(Math.sin(this._t * 9)) * 0.07;
      this.coda.rotation.x = -0.85 + Math.sin(this._t * 9) * 0.18;
    } else {
      scalaY = 1 + Math.sin(this._t * 2.2) * 0.013;
      this.coda.rotation.x = -0.85 + Math.sin(this._t * 1.6) * 0.08;
    }
    if (aTerra && this._squash > 0) {
      scalaY = 1 - this._squash * 0.6;
      this._squash = Math.max(0, this._squash - dt * 1.2);
    }
    // scala e bob SMUSSATI verso il target: niente pop se aTerra ha un singolo blip
    const k = Math.min(1, dt * 14);
    this._scalaY = (this._scalaY ?? 1) + (scalaY - (this._scalaY ?? 1)) * k;
    this._bob = (this._bob ?? 0) + (bob - (this._bob ?? 0)) * k;
    this.corpo.position.y = this._bob;
    this.corpo.scale.set(1 + (1 - this._scalaY) * 0.5, this._scalaY, 1 + (1 - this._scalaY) * 0.5);
  }
}
