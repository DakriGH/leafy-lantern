// Riflessi planari dell'acqua (stile TOTK/BirdiBirdson): la scena viene
// ri-renderizzata SPECCHIATA sotto il piano dell'acqua, a bassa risoluzione,
// e il materiale dell'acqua la campiona con un wobble. Matematica del mirror
// portata dal Reflector di three (camera virtuale + near-plane obliquo che
// taglia tutto ciò che sta sotto il pelo).
//
// Costo: un render extra della scena a ~1/8 dei pixel (0.35²), SOLO quando
// i riflessi sono attivi e c'è acqua inquadrata. Su mobile: spenti di default.

import * as THREE from 'three';

const SCALA_RT = 0.35;

export class RiflessoAcqua {
  constructor(renderer) {
    this.renderer = renderer;
    this.attivo = false;              // scelto dalla qualità (desktop sì, mobile no)
    this.rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: true });
    this.matriceTexture = new THREE.Matrix4();
    this.camera = new THREE.PerspectiveCamera();

    this._piano = new THREE.Plane();
    this._normale = new THREE.Vector3(0, 1, 0);
    this._puntoPiano = new THREE.Vector3();
    this._posCamera = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._lookAt = new THREE.Vector3();
    this._vista = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
  }

  dimensiona(w, h, dpr) {
    this.rt.setSize(Math.max(2, Math.floor(w * dpr * SCALA_RT)), Math.max(2, Math.floor(h * dpr * SCALA_RT)));
  }

  /** Renderizza il riflesso per il piano y = quota. Ritorna false se non ha senso
   *  (riflessi spenti o camera sotto il pelo). `nascosti` = mesh da escludere. */
  aggiorna(scena, camera, quota, nascosti) {
    if (!this.attivo) return false;
    const cam = this.camera;

    this._puntoPiano.set(0, quota, 0);
    this._posCamera.setFromMatrixPosition(camera.matrixWorld);
    this._vista.subVectors(this._puntoPiano, this._posCamera);
    if (this._vista.dot(this._normale) > 0) return false;   // camera sott'acqua

    this._vista.reflect(this._normale).negate();
    this._vista.add(this._puntoPiano);

    this._rot.extractRotation(camera.matrixWorld);
    this._lookAt.set(0, 0, -1).applyMatrix4(this._rot).add(this._posCamera);
    this._target.subVectors(this._puntoPiano, this._lookAt);
    this._target.reflect(this._normale).negate();
    this._target.add(this._puntoPiano);

    cam.position.copy(this._vista);
    cam.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(this._normale);
    cam.lookAt(this._target);
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);

    // matrice per campionare la texture in spazio schermo del mirror
    this.matriceTexture.set(
      0.5, 0, 0, 0.5,
      0, 0.5, 0, 0.5,
      0, 0, 0.5, 0.5,
      0, 0, 0, 1,
    );
    this.matriceTexture.multiply(cam.projectionMatrix);
    this.matriceTexture.multiply(cam.matrixWorldInverse);

    // near-plane OBLIQUO sul pelo: il mirror non vede ciò che sta sotto l'acqua
    this._piano.setFromNormalAndCoplanarPoint(this._normale, this._puntoPiano);
    this._piano.applyMatrix4(cam.matrixWorldInverse);
    this._clip.set(this._piano.normal.x, this._piano.normal.y, this._piano.normal.z, this._piano.constant);
    const p = cam.projectionMatrix;
    this._q.x = (Math.sign(this._clip.x) + p.elements[8]) / p.elements[0];
    this._q.y = (Math.sign(this._clip.y) + p.elements[9]) / p.elements[5];
    this._q.z = -1.0;
    this._q.w = (1.0 + p.elements[10]) / p.elements[14];
    this._clip.multiplyScalar(2.0 / this._clip.dot(this._q));
    p.elements[2] = this._clip.x;
    p.elements[6] = this._clip.y;
    p.elements[10] = this._clip.z + 1.0;
    p.elements[14] = this._clip.w;

    // render nel target, con l'acqua (e ciò che va escluso) nascosta
    const eraVisibile = [];
    for (const m of nascosti) { eraVisibile.push(m.visible); m.visible = false; }
    const rtPrima = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(scena, cam);
    this.renderer.setRenderTarget(rtPrima);
    for (let i = 0; i < nascosti.length; i++) nascosti[i].visible = eraVisibile[i];
    return true;
  }
}
