// Pioggia: striscioline verticali in UNA sola mesh che segue il player.
// La caduta è tutta nel vertex shader (wrap con mod): zero lavoro CPU per
// goccia. Insieme a uPioggia (materials.js) accende le increspature sull'acqua.

import * as THREE from 'three';

const GOCCE = 380;
const AREA = 26;          // lato della zona di pioggia intorno al player
const ALTEZZA = 22;

export class Pioggia {
  constructor(scena) {
    const pos = new Float32Array(GOCCE * 4 * 3);
    const base = new Float32Array(GOCCE * 4 * 3);
    const uv = new Float32Array(GOCCE * 4 * 2);
    const idx = [];
    for (let i = 0; i < GOCCE; i++) {
      const bx = (Math.random() - 0.5) * AREA;
      const by = Math.random() * ALTEZZA;
      const bz = (Math.random() - 0.5) * AREA;
      const ang = Math.random() * Math.PI;
      const dx = Math.cos(ang) * 0.016, dz = Math.sin(ang) * 0.016;
      const L = 0.5 + Math.random() * 0.25;
      for (let v = 0; v < 4; v++) {
        const j = (i * 4 + v) * 3;
        const destra = v === 1 || v === 2 ? 1 : -1;
        const su = v >= 2 ? 1 : 0;
        pos[j] = destra * dx; pos[j + 1] = su * L; pos[j + 2] = destra * dz;
        base[j] = bx; base[j + 1] = by; base[j + 2] = bz;
        uv[(i * 4 + v) * 2] = 0; uv[(i * 4 + v) * 2 + 1] = su;
      }
      const o = i * 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), AREA);   // mai cullata male

    this.materiale = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 }, uAlpha: { value: 0 }, uNeve: { value: 0 } },
      vertexShader: /* glsl */`
        attribute vec3 aBase;
        varying float vV;
        uniform float uT;
        uniform float uNeve;
        void main() {
          // pioggia: strisce rapide e dritte · NEVE: fiocchi corti, lenti,
          // che dondolano di lato (stessa mesh, cambia solo la matematica)
          float velo = mix(19.0, 2.6, uNeve);
          float caduta = mod(aBase.y - uT * velo, ${ALTEZZA.toFixed(1)});
          vec3 p = vec3(aBase.x, caduta, aBase.z);
          p.x += uNeve * sin(uT * 1.3 + aBase.y * 2.1 + aBase.x) * 0.5;
          p.z += uNeve * cos(uT * 1.1 + aBase.x * 1.7) * 0.4;
          vec3 forma = position;
          forma.y *= mix(1.0, 0.14, uNeve);       // striscia → fiocco
          forma.xz *= mix(1.0, 4.5, uNeve);
          vV = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p + forma, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vV;
        uniform float uAlpha;
        uniform float uNeve;
        void main() {
          vec3 tinta = mix(vec3(0.75, 0.85, 0.98), vec3(0.99, 0.99, 1.0), uNeve);
          float a = mix(uAlpha * (0.15 + 0.5 * vV), uAlpha * 1.4, uNeve);
          gl_FragColor = vec4(tinta, a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, this.materiale);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
    scena.add(this.mesh);
    this.attiva = false;
    this._fade = 0;      // 0..1 con transizione morbida
  }

  imposta(attiva) { this.attiva = attiva; }

  /** 0 = pioggia · 1 = neve (transizione morbida nel loop). */
  neve(v) { this._neveVerso = v; }

  /** Ritorna l'intensità corrente (0..1) per le increspature sull'acqua. */
  aggiorna(dt, tempo, bersaglio) {
    const verso = this.attiva ? 1 : 0;
    this._fade += (verso - this._fade) * Math.min(1, dt * 2.5);
    const un = this.materiale.uniforms;
    un.uNeve.value += ((this._neveVerso || 0) - un.uNeve.value) * Math.min(1, dt * 1.5);
    if (this._fade < 0.01) { this.mesh.visible = false; return 0; }
    this.mesh.visible = true;
    this.mesh.position.set(bersaglio.x, bersaglio.y - 3, bersaglio.z);
    un.uT.value = tempo;
    un.uAlpha.value = 0.42 * this._fade;
    // la neve non increspa l'acqua come la pioggia
    return this._fade * (1 - un.uNeve.value * 0.85);
  }
}
