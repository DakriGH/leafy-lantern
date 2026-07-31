// Pioggia: striscioline verticali in UNA sola mesh. La caduta è tutta nel vertex
// shader (wrap con mod): zero lavoro CPU per goccia. Insieme a uPioggia
// (materials.js) accende le increspature sull'acqua.
//
// PIOVE DOVE CI SONO LE NUVOLE, non addosso al giocatore. Era il difetto che il
// committente ha visto subito allontanando la camera: la scatola di gocce lo
// seguiva, quindi la pioggia era una colonna che camminava con lui e il resto
// del mondo restava asciutto. Adesso ogni goccia guarda se ha una nuvola SOPRA —
// le stesse nuvole che si vedono in cielo, con la loro deriva — e se non ce l'ha
// non esiste.
//
// ⚠ E LE GOCCE STANNO NEL MONDO, NON NEL GIOCATORE. Questo è il bug che faceva
// dire «la pioggia ogni tanto va al contrario»: la mesh era piazzata sul
// giocatore e le gocce vivevano in coordinate LOCALI, quindi camminando l'intera
// colonna d'acqua traslava insieme a lui. A schermo una goccia che cade a 19
// blocchi al secondo mentre il mondo le scorre sotto a 5 sembra andare di
// traverso; scendendo una collina il volume si abbassava di colpo e le gocce
// sembravano salire. Non era «ogni tanto»: era ogni volta che ci si muoveva, e
// più forte quanto più veloce si andava.
//
// Adesso ogni goccia calcola la sua posizione IN MONDO e ci si aggancia: quello
// che segue il giocatore non è la goccia ma la MAGLIA su cui le gocce sono
// disposte, che scatta di un passo intero per volta (`avvolgi`). Un salto di un
// periodo intero è invisibile per definizione — la goccia riparte esattamente
// dove ne finiva un'altra — mentre fra un salto e l'altro la pioggia sta ferma
// nel mondo, cioè cade dritta.
//
// L'AREA SEGUE LO ZOOM. Era un quadrato fisso di 26 blocchi: allontanando la
// camera si vedeva la pioggia solo in una toppa attorno al gatto e tutto il
// resto del panorama era asciutto («è solo sul player, quando dezoomo non vedo
// niente»). Le basi delle gocce sono NORMALIZZATE in [-0.5, 0.5] e le moltiplica
// una uniform: allargare il campo è un numero, non una geometria da rifare, e la
// goccia non cambia dimensione perché la forma non viene scalata.
//
// L'INTENSITÀ non è solo l'opacità: una tempesta ha gocce più fitte, più lunghe
// e più veloci di una pioggerella, e se cambia solo il colore si vede che è la
// stessa pioggia sbiadita.

import * as THREE from 'three';

const GOCCE = 1500;
const AREA_MIN = 30;      // lato della zona di pioggia da vicino
const AREA_MAX = 130;     // …e con la camera lontana
const ALTEZZA = 26;
const NUVOLE_MAX = 12;    // quante nuvole può guardare una goccia

export class Pioggia {
  constructor(scena) {
    const pos = new Float32Array(GOCCE * 4 * 3);
    const base = new Float32Array(GOCCE * 4 * 3);
    const uv = new Float32Array(GOCCE * 4 * 2);
    const idx = [];
    for (let i = 0; i < GOCCE; i++) {
      // NORMALIZZATE: xz in [-0.5, 0.5], y in [0, 1]. Le scala uArea/ALTEZZA.
      const bx = Math.random() - 0.5;
      const by = Math.random();
      const bz = Math.random() - 0.5;
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
    // la mesh sta nell'ORIGINE e i vertici sono già in coordinate mondo: la
    // sfera di culling deve coprire tutto il campo, se no sparisce a tradimento
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.materiale = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uT: { value: 0 }, uAlpha: { value: 0 }, uNeve: { value: 0 },
        uForza: { value: 1 },      // 0 pioggerella … 1 tempesta
        uCentro: { value: new THREE.Vector3() },   // il giocatore, in MONDO
        uArea: { value: AREA_MIN },
        uPixel: { value: 0.002 },  // quanti BLOCCHI vale un pixel a distanza 1
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
        uniform vec3 uCentro;
        uniform float uArea;
        uniform float uPixel;
        uniform vec4 uNuvole[${NUVOLE_MAX}];   // (x, z, raggio, riserva) in MONDO
        uniform int uNuvoleNum;

        // Riporta una coordinata dentro il periodo centrato su c: la goccia salta
        // di un PERIODO INTERO, cioè finisce dove ne cominciava un'altra, e il
        // salto non si vede. È l'unico movimento che la maglia fa seguendo il
        // giocatore: fra un salto e l'altro la pioggia sta ferma nel mondo.
        float avvolgi(float v, float c, float periodo) {
          return v + floor((c - v) / periodo + 0.5) * periodo;
        }

        void main() {
          float area = uArea;
          // ---- la posizione della goccia, IN MONDO ---------------------------
          vec2 baseXZ = aBase.xz * area;
          vec2 mondoXZ = vec2(avvolgi(baseXZ.x, uCentro.x, area),
                              avvolgi(baseXZ.y, uCentro.z, area));

          // HA UNA NUVOLA SOPRA? Il bordo del rovescio è sfumato, se no la
          // pioggia si taglia con un cerchio netto e sembra un riflettore.
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
          float alto = ${ALTEZZA.toFixed(1)};
          // la quota scende col tempo e si avvolge attorno alla testa del
          // giocatore: cade nel MONDO, non dentro una scatola che lo insegue
          float cadutaY = mod(aBase.y * alto - uT * velo, alto);
          float mondoY = avvolgi(cadutaY, uCentro.y + alto * 0.35, alto);

          vec3 p = vec3(mondoXZ.x, mondoY, mondoXZ.y);
          p.x += uNeve * sin(uT * 1.3 + aBase.y * 21.0 + aBase.x * 7.0) * 0.5;
          p.z += uNeve * cos(uT * 1.1 + aBase.x * 17.0) * 0.4;
          // con la tempesta la pioggia va di traverso: l'inclinazione dipende da
          // QUANTO È SCESA, e siccome adesso la quota è quella vera del mondo il
          // riferimento è la testa del giocatore
          float scesa = clamp((uCentro.y + alto * 0.85 - mondoY) / alto, 0.0, 1.0);
          p.xz += vec2(0.9, 0.35) * (1.0 - uNeve) * uForza * uForza * scesa * 2.4;

          vec3 forma = position;
          forma.y *= mix(1.0, 0.14, uNeve) * mix(0.6, 1.6, uForza);
          forma.xz *= mix(1.0, 4.5, uNeve);
          // ---- LARGHEZZA MINIMA IN PIXEL, non «goccia più grossa» -----------
          //
          // ⚠ IL PRIMO TENTATIVO ERA UNA PEZZA, e il committente l'ha vista al
          // volo: «hai solo scalato, così quando la telecamera è lontana le
          // gocce sembrano giganti?». Sì, ed era sbagliato — una goccia a venti
          // metri diventava larga mezzo metro.
          //
          // Il problema vero non è la distanza, è che una goccia larga sedici
          // millesimi di blocco è SOTTO il pixel: la rasterizzazione la
          // cancella, e non perché sia lontana ma perché è più sottile di quanto
          // lo schermo sappia disegnare. La cura giusta è quella che usano tutti
          // i tratti sottili (linee, cavi, fili d'erba lontani): si tiene la
          // larghezza VERA finché copre almeno un pixel, e solo sotto quella
          // soglia la si allarga fino a un pixel — quindi da vicino la goccia è
          // esattamente quella di prima, e lontano non è «gigante»: è larga un
          // pixel, il minimo per esistere.
          //
          // uPixel = quanti blocchi vale un pixel a distanza 1 dalla camera;
          // moltiplicato per la profondità dà il blocco-per-pixel qui.
          float prof = -(modelViewMatrix * vec4(p, 1.0)).z;
          float minLargo = uPixel * max(prof, 0.1) * 0.75;
          float largo = max(length(forma.xz), 1e-6);
          forma.xz *= max(1.0, minLargo / largo);
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
    this.mesh.frustumCulled = false;
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

  /**
   * Ritorna l'intensità corrente (0..1) per le increspature sull'acqua.
   * `distanzaCamera` allarga il campo di pioggia quando ci si allontana: con la
   * camera a sessanta blocchi si guarda un panorama, e la pioggia deve esserci
   * su tutto il panorama.
   */
  aggiorna(dt, tempo, bersaglio, distanzaCamera = 0, pixelPerBlocco = 0.002) {
    const verso = this.attiva ? 1 : 0;
    this._fade += (verso - this._fade) * Math.min(1, dt * 2.5);
    const un = this.materiale.uniforms;
    un.uNeve.value += ((this._neveVerso || 0) - un.uNeve.value) * Math.min(1, dt * 1.5);
    if (this._fade < 0.01) { this.mesh.visible = false; return 0; }
    this.mesh.visible = true;
    un.uCentro.value.copy(bersaglio);
    // L'AREA SI MUOVE A SCATTI GROSSI, di proposito: cambiarla di continuo
    // vorrebbe dire spostare TUTTE le gocce a ogni frame mentre lo zoom si
    // assesta, e quello sì che si vedrebbe. Quantizzata a otto blocchi, cambia
    // solo quando lo zoom cambia davvero.
    const voluta = Math.max(AREA_MIN, Math.min(AREA_MAX, distanzaCamera * 2.2));
    un.uArea.value = Math.round(voluta / 8) * 8;
    // QUANTO VALE UN PIXEL, in blocchi, a distanza 1 dalla camera: e' la
    // costante che trasforma «almeno un pixel» in una larghezza di mondo.
    // 2·tan(fov/2)/altezzaInPixel — la calcola chi chiama, che ha la camera.
    un.uPixel.value = pixelPerBlocco;
    un.uT.value = tempo;
    un.uForza.value += ((this._forzaVerso ?? 0.5) - un.uForza.value) * Math.min(1, dt * 0.7);
    un.uAlpha.value = (0.30 + 0.34 * un.uForza.value) * this._fade;
    // la neve non increspa l'acqua come la pioggia
    return this._fade * (1 - un.uNeve.value * 0.85);
  }
}
