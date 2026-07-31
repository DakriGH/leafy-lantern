// Pioggia: striscioline verticali in UNA sola mesh che segue il player.
// La caduta è tutta nel vertex shader (wrap con mod): zero lavoro CPU per
// goccia. Insieme a uPioggia (materials.js) accende le increspature sull'acqua.
//
// PIOVE DOVE CI SONO LE NUVOLE, non addosso al giocatore. Era il difetto che il
// committente ha visto subito allontanando la camera: la scatola di gocce lo
// seguiva, quindi la pioggia era una colonna che camminava con lui e il resto
// del mondo restava asciutto. Adesso ogni goccia guarda se ha una nuvola SOPRA —
// le stesse nuvole che si vedono in cielo, con la loro deriva — e se non ce l'ha
// non esiste. La scatola continua a seguire il giocatore (simulare la pioggia
// su tutto il mondo sarebbe assurdo), ma dentro la scatola la pioggia c'è solo
// dove deve esserci: si vedono i rovesci passare, e il bordo di un rovescio.
//
// L'INTENSITÀ non è solo l'opacità: una tempesta ha gocce più fitte, più lunghe
// e più veloci di una pioggerella, e se cambia solo il colore si vede che è la
// stessa pioggia sbiadita.
//
// IL ROVESCIO È PIÙ LARGO DELLA NUVOLA CHE LO FA, e la scala cresce con
// l'intensità (`impostaNuvole`, secondo argomento). Non è una scorciatoia: la
// sagoma che si vede in cielo è il nucleo denso, la pioggia cade su un'area più
// ampia — e soprattutto è quello che rende la cosa LEGGIBILE. Con il disco a
// misura di nuvola, dieci nuvole da sette blocchi di raggio su un'area di cento
// coprono il 4%: misurato, il giocatore non aveva quasi mai una nuvola sopra e
// «piove» voleva dire «non si vede niente». Con la pioggerella si vedono i
// rovesci passare a chiazze; con la tempesta piove dappertutto, che è appunto
// quello che fa una tempesta.

import * as THREE from 'three';

const GOCCE = 380;
const AREA = 26;          // lato della zona di pioggia intorno al player
const ALTEZZA = 22;
const NUVOLE_MAX = 12;    // quante nuvole può guardare una goccia

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
      uniforms: {
        uT: { value: 0 }, uAlpha: { value: 0 }, uNeve: { value: 0 },
        uForza: { value: 1 },      // 0 pioggerella … 1 tempesta
        uNuvole: { value: Array.from({ length: NUVOLE_MAX }, () => new THREE.Vector4(0, 0, -1, 0)) },
        uNuvoleNum: { value: 0 },
      },
      vertexShader: /* glsl */`
        attribute vec3 aBase;
        varying float vV;
        varying float vSotto;
        uniform float uT;
        uniform float uNeve;
        uniform float uForza;
        uniform vec4 uNuvole[${NUVOLE_MAX}];   // (x, z, raggio, riserva) in MONDO
        uniform int uNuvoleNum;
        void main() {
          // HA UNA NUVOLA SOPRA? La goccia sta in coordinate locali (la mesh
          // segue il giocatore), le nuvole in coordinate mondo: si somma
          // l'origine della mesh. Il bordo del rovescio è sfumato, se no la
          // pioggia si taglia con un cerchio netto e sembra un riflettore.
          vec2 mondoXZ = modelMatrix[3].xz + aBase.xz;
          float sotto = 0.0;
          for (int i = 0; i < ${NUVOLE_MAX}; i++) {
            if (i >= uNuvoleNum) break;
            float r = uNuvole[i].z;
            if (r <= 0.0) continue;
            float d = distance(mondoXZ, uNuvole[i].xy);
            sotto = max(sotto, 1.0 - smoothstep(r * 0.45, r, d));
          }
          vSotto = sotto;

          // pioggia: strisce rapide e dritte · NEVE: fiocchi corti, lenti,
          // che dondolano di lato (stessa mesh, cambia solo la matematica)
          // L'INTENSITÀ entra nella VELOCITÀ e nella LUNGHEZZA, non solo
          // nell'opacità: una tempesta non è una pioggerella sbiadita.
          float velo = mix(19.0, 2.6, uNeve) * mix(0.55, 1.45, uForza);
          float caduta = mod(aBase.y - uT * velo, ${ALTEZZA.toFixed(1)});
          vec3 p = vec3(aBase.x, caduta, aBase.z);
          p.x += uNeve * sin(uT * 1.3 + aBase.y * 2.1 + aBase.x) * 0.5;
          p.z += uNeve * cos(uT * 1.1 + aBase.x * 1.7) * 0.4;
          // con la tempesta la pioggia va di traverso
          p.xz += vec2(0.9, 0.35) * (1.0 - uNeve) * uForza * uForza * (${ALTEZZA.toFixed(1)} - caduta) * 0.10;
          vec3 forma = position;
          forma.y *= mix(1.0, 0.14, uNeve) * mix(0.6, 1.6, uForza);
          forma.xz *= mix(1.0, 4.5, uNeve);
          // fuori dal rovescio la goccia non c'è: si chiude su se stessa
          forma *= step(0.02, sotto);
          vV = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p + forma, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying float vV;
        varying float vSotto;
        uniform float uAlpha;
        uniform float uNeve;
        void main() {
          if (vSotto < 0.02) discard;
          vec3 tinta = mix(vec3(0.75, 0.85, 0.98), vec3(0.99, 0.99, 1.0), uNeve);
          float a = mix(uAlpha * (0.15 + 0.5 * vV), uAlpha * 1.4, uNeve);
          gl_FragColor = vec4(tinta, a * vSotto);
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

  /** 0 = pioggerella · 1 = tempesta. Cambia velocità, lunghezza, inclinazione
   *  e quantità delle gocce, non solo l'opacità. */
  intensita(v) { this._forzaVerso = Math.max(0, Math.min(1, v)); }

  /**
   * DOVE STANNO LE NUVOLE ADESSO, in coordinate mondo: (x, z, raggio).
   * Gliele passa main una volta per frame prendendole da fx/nuvole.js — sono
   * le stesse che si vedono in cielo, deriva compresa, quindi il rovescio
   * cammina insieme alla nuvola che lo fa.
   */
  impostaNuvole(dischi, scala = 1) {
    const u = this.materiale.uniforms;
    const n = Math.min(dischi.length, NUVOLE_MAX);
    for (let i = 0; i < n; i++) {
      const d = dischi[i];
      u.uNuvole.value[i].set(d.x, d.z, d.r * scala, 0);
    }
    u.uNuvoleNum.value = n;
  }

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
    un.uForza.value += ((this._forzaVerso ?? 0.5) - un.uForza.value) * Math.min(1, dt * 0.7);
    un.uAlpha.value = (0.30 + 0.34 * un.uForza.value) * this._fade;
    // la neve non increspa l'acqua come la pioggia
    return this._fade * (1 - un.uNeve.value * 0.85);
  }
}
