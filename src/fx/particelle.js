// Particellari dell'acqua: puntini bianchi leggerissimi.
//  · CORRENTE: puntini che scivolano lungo il flusso sul pelo;
//  · IMPATTO CASCATA: bollicine che saltano su dove la colonna tocca l'acqua,
//    più numerose e vivaci quanto più alta è la caduta.
// Un solo THREE.Points, buffer riciclato: costo CPU e GPU irrisorio.

import * as THREE from 'three';
import { ambienteAttuale } from './materials.js?v=ms8osh8u';

const MAX = 180;

export class Particelle {
  constructor(scena) {
    this.pos = new Float32Array(MAX * 3);
    this.alfa = new Float32Array(MAX);
    this.scala = new Float32Array(MAX);
    this.col = new Float32Array(MAX * 3).fill(1);   // colore per-particella
    this.vel = new Float32Array(MAX * 3);
    this.vita = new Float32Array(MAX);      // secondi rimanenti; <=0 = libera
    this.durata = new Float32Array(MAX);
    this.galleggia = new Uint8Array(MAX);   // 1 = resta sul pelo (niente gravità)
    // 0 = goccia tonda · >0 = FOGLIA che svolazza (il valore è anche il seme
    // della sua rotazione, così due foglie vicine non girano all'unisono)
    this.forma = new Float32Array(MAX);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlfa', new THREE.BufferAttribute(this.alfa, 1));
    g.setAttribute('aScala', new THREE.BufferAttribute(this.scala, 1));
    g.setAttribute('aColore', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aForma', new THREE.BufferAttribute(this.forma, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    // uAmbiente: lo STESSO colore d'ambiente che tinge tutta la scena unlit
    // (fx/materials.js). I batuffoli erano bianco pieno e NON illuminati, quindi
    // di notte BRILLAVANO come lampadine mentre la schiuma dello shader si
    // abbassava col buio: due acque diverse nello stesso fotogramma. Moltiplicando
    // il colore per l'ambiente le goccioline seguono il giorno/notte come la
    // schiuma di riva — di notte diventano grigio-blu, non fari. Vale per TUTTI
    // gli usi del sistema (rottura blocchi, tuffi, pioggia, palle): sono tutti
    // spruzzi unlit che allo stesso modo non devono accendersi al buio.
    this.materiale = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uAmbiente: { value: new THREE.Color(1, 1, 1) }, uTempo: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float aAlfa;
        attribute float aScala;
        attribute vec3 aColore;
        attribute float aForma;
        varying float vAlfa;
        varying vec3 vCol;
        varying float vForma;
        void main() {
          vAlfa = aAlfa;
          vCol = aColore;
          vForma = aForma;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aScala * 130.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vAlfa;
        varying vec3 vCol;
        varying float vForma;
        uniform vec3 uAmbiente;
        uniform float uTempo;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float m;
          if (vForma > 0.001) {
            // UNA FOGLIA CHE SVOLAZZA, non un pallino colorato. Le particelle
            // del calpestio avevano il colore giusto e la forma sbagliata: da
            // vicino erano coriandoli tondi. Qui il quadratino del punto si
            // RUOTA nel fragment (i THREE.Points non ruotano) e dentro si
            // ritaglia la stessa sagoma allungata delle foglie a terra: chi
            // vola via somiglia a quello che era per terra un attimo prima.
            float a = uTempo * 3.1 + vForma * 6.283;
            float c = cos(a), s2 = sin(a);
            // il quadratino sta fermo, la SAGOMA gira dentro: si ruota la
            // coordinata al contrario. 1.75 perché a 2.2 la punta usciva dal
            // quadratino e veniva tagliata — e una foglia tagliata a metà si
            // legge come due macchie, non come una foglia (visto a schermo).
            vec2 q = vec2(d.x * c - d.y * s2, d.x * s2 + d.y * c) * 1.75;
            // e si vede di taglio mentre gira: la larghezza si stringe, ma NON
            // si divide — il termine che la accartocciava spezzava la sagoma in
            // due lobi a certi angoli, e sembrava una farfalla.
            q.x /= mix(0.42, 1.0, abs(cos(a * 1.3)));
            float larga = 1.0 - 0.22 * abs(q.y);
            float f = (q.x * q.x) / (larga * larga) + q.y * q.y * (0.9 + q.y * 0.35);
            if (f > 1.0) discard;
            m = 1.0;
          } else {
            // DISCO NETTO, non batuffolo sfumato. La sfumatura andava da 0.5 a
            // 0.32 — mezzo raggio di sfocatura — e in mezzo a un mondo dai bordi
            // netti le particelle erano l'unica cosa molle.
            m = smoothstep(0.5, 0.44, length(d));
          }
          gl_FragColor = vec4(vCol * uAmbiente, vAlfa * m);
        }`,
    });
    this.punti = new THREE.Points(g, this.materiale);
    this.punti.renderOrder = 3;
    this.punti.frustumCulled = false;
    scena.add(this.punti);
    this._next = 0;
  }

  emetti(x, y, z, vx, vy, vz, vita, scala, galleggia = 0, colore = null, forma = 0) {
    const i = this._next;
    this._next = (this._next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.vita[i] = vita; this.durata[i] = vita;
    this.scala[i] = scala;
    this.galleggia[i] = galleggia;
    this.forma[i] = forma;
    if (forma) this.punti.geometry.attributes.aForma.needsUpdate = true;
    if (colore) { this.col[i * 3] = colore[0]; this.col[i * 3 + 1] = colore[1]; this.col[i * 3 + 2] = colore[2]; }
    else { this.col[i * 3] = 0.95; this.col[i * 3 + 1] = 0.99; this.col[i * 3 + 2] = 1; }
    this.punti.geometry.attributes.aColore.needsUpdate = true;
  }

  aggiorna(dt) {
    // segue l'ora del giorno come il resto della scena unlit (vedi il costruttore)
    this.materiale.uniforms.uAmbiente.value.copy(ambienteAttuale());
    this.materiale.uniforms.uTempo.value += dt;
    let vivi = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.vita[i] <= 0) { this.alfa[i] = 0; continue; }
      this.vita[i] -= dt;
      if (this.vita[i] <= 0) { this.alfa[i] = 0; continue; }
      vivi++;
      const j = i * 3;
      if (this.forma[i] > 0) {
        // UNA FOGLIA NON CADE COME UNA GOCCIA: pesa niente, quindi scende piano
        // e va a destra e sinistra mentre scende. Senza questo, la forma giusta
        // cadeva come un sasso e l'effetto non c'era comunque.
        this.vel[j + 1] -= 1.5 * dt;
        const t = this.materiale.uniforms.uTempo.value * 2.4 + this.forma[i] * 6.283;
        this.vel[j] += Math.cos(t) * 2.2 * dt;
        this.vel[j + 2] += Math.sin(t * 0.9) * 2.2 * dt;
      } else if (!this.galleggia[i]) {
        this.vel[j + 1] -= 5.5 * dt;   // bollicine: su poi giù
      }
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = this.vita[i] / this.durata[i];
      // una foglia e' un oggetto, non uno spruzzo: a 0.55 di opacita' si vedeva
      // il terreno attraverso, e una foglia trasparente non e' una foglia
      this.alfa[i] = (this.forma[i] > 0 ? 0.98 : 0.55) * Math.min(1, f * 3);
    }
    this.punti.visible = vivi > 0;
    if (vivi > 0) {
      this.punti.geometry.attributes.position.needsUpdate = true;
      this.punti.geometry.attributes.aAlfa.needsUpdate = true;
      this.punti.geometry.attributes.aScala.needsUpdate = true;
    }
  }
}
