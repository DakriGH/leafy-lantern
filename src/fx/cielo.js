// IL CIELO — gradiente, l'astro, il suo bagliore e le stelle.
//
// Prima era `scena.background = un colore`: una parete di tinta piatta. Da lì
// venivano tre cose che mancavano tutte insieme:
//  · nessuna SFUMATURA fra orizzonte e zenit, cioè il cielo non aveva profondità;
//  · nessun SOLE e nessuna LUNA da guardare — la luce c'era ma la sorgente no,
//    e l'ombra puntava da una parte dove non si vedeva niente;
//  · nessun BAGLIORE quando li inquadri.
//
// COM'È FATTO: una cupola che segue la camera (raggio grande, facce interne,
// disegnata per prima e senza scrivere la profondità). Tutto il resto è nel
// fragment shader, quindi il cielo costa DUE TRIANGOLI di vertici e una passata
// di pixel senza texture né overdraw.
//
// LO STILE RESTA QUELLO DEL GIOCO: il disco dell'astro ha il BORDO NETTO come le
// nuvole e le ombre — non è una palla sfocata — mentre il bagliore attorno è
// l'unica cosa deliberatamente morbida di tutta la scena, perché un bagliore a
// gradini non è un bagliore, è un bersaglio.
//
// L'ORIZZONTE È IL COLORE DELLA NEBBIA, e non è un caso: il terreno lontano
// sfuma nella nebbia, e se la nebbia e il cielo all'orizzonte non sono lo stesso
// colore si vede la riga dove finisce il mondo. Il ciclo giorno/notte passa
// entrambi da qui.

import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    // la cupola segue la camera: si toglie la traslazione dalla vista, così il
    // cielo non si "avvicina" mai e non entra mai dentro la geometria
    mat4 vistaFerma = viewMatrix;
    vistaFerma[3].xyz = vec3(0.0);
    vec4 p = projectionMatrix * vistaFerma * modelMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;    // z = w ⇒ profondità 1: sempre dietro a tutto
  }
`;

const FRAG = /* glsl */`
  precision mediump float;
  varying vec3 vDir;
  uniform vec3 uBasso;      // colore all'orizzonte (= colore della nebbia)
  uniform vec3 uAlto;       // colore allo zenit
  uniform vec3 uAstro;      // direzione VERSO sole o luna (la stessa dell'ombra)
  uniform vec3 uAstroCol;   // colore del disco
  uniform vec3 uAlone;      // colore del bagliore attorno
  uniform float uNotte;     // 0 giorno, 1 notte: accende stelle e luna
  uniform float uAltezza;   // quanto è alto l'astro (0 orizzonte, 1 allo zenit)

  // hash 3D per le stelle: niente texture, niente attributi
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  void main() {
    vec3 d = normalize(vDir);

    // ---- IL GRADIENTE -------------------------------------------------------
    // La potenza schiaccia la sfumatura verso l'orizzonte: senza, il cielo si
    // schiarisce troppo presto e la fascia bassa — quella che si vede davvero
    // nella vista a diorama — resta tutta della stessa tinta.
    float su = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uBasso, uAlto, pow(su, 0.55));
    // sotto l'orizzonte (si vede inclinando la camera) si continua a scendere
    col = mix(col, uBasso * 0.86, clamp(-d.y * 2.0, 0.0, 1.0));

    // ---- LE STELLE ----------------------------------------------------------
    // Solo di notte e solo in alto: all'orizzonte la nebbia se le mangerebbe
    // comunque, e calcolarle lì sarebbe lavoro buttato.
    if (uNotte > 0.01 && d.y > 0.02) {
      // LA CELLA NON È LA STELLA. Accendendo la cella intera si ottengono
      // quadratini e rombi grandi come francobolli — provato, sembravano
      // coriandoli. La cella dice SE c'è una stella; dove sta dentro la cella e
      // quanto è piccola lo dicono altri due hash. La griglia è fissa nel mondo,
      // quindi le stelle stanno ferme mentre la camera gira.
      vec3 q = d * 300.0;
      vec3 g = floor(q);
      float h = hash31(g);
      if (h > 0.982) {
        vec3 centro = vec3(hash31(g + 11.3), hash31(g + 23.7), hash31(g + 37.1)) - 0.5;
        float dd = length(fract(q) - 0.5 - centro * 0.7);
        float lum = smoothstep(0.34, 0.04, dd) * (h - 0.982) / 0.018;
        // VERSO L'ORIZZONTE LA GRIGLIA FINISCE SOTTO IL PIXEL e le stelle
        // diventano un motivo a scacchi — moiré, non stelle. Dove una cella è
        // più piccola di un pixel non si disegna: è la stessa regola degli
        // anelli di pioggia e dei nastri sull'acqua.
        lum *= clamp(1.4 - length(fwidth(q)) * 0.5, 0.0, 1.0);
        col += vec3(0.85, 0.88, 1.0) * lum * uNotte * clamp(d.y * 3.0, 0.0, 1.0);
      }
    }

    // ---- L'ASTRO E IL SUO BAGLIORE -----------------------------------------
    float cs = dot(d, uAstro);
    if (cs > 0.0) {
      // IL BAGLIORE PRIMA, il disco dopo: così il disco resta pulito e netto
      // sopra l'alone invece di essere annacquato da lui.
      // Due potenze: una stretta e forte (il fuoco), una larghissima e debole
      // (il velo che tinge mezzo cielo attorno al sole basso).
      // L'ALONE NON DEVE MANGIARSI IL DISCO: a 0.85 il bagliore stretto satura
      // a bianco su un'area più larga del disco, e del disco non resta niente —
      // si vedeva una palla sfocata, cioè esattamente quello che questo gioco
      // non fa. Il bagliore stretto ora è più stretto E più debole: fa da orlo
      // al disco invece di coprirlo.
      float stretto = pow(cs, 3000.0) * 0.5;
      float medio = pow(cs, 90.0) * 0.14;
      float largo = pow(cs, 10.0);
      // il velo largo si apre quando l'astro è BASSO: è all'alba e al tramonto
      // che il cielo si accende attorno, non a mezzogiorno
      float bassoAstro = 1.0 - clamp(uAltezza, 0.0, 1.0);
      col += uAlone * (stretto + medio + largo * (0.05 + 0.28 * bassoAstro));

      // IL DISCO, a bordo netto come tutto il resto del gioco. La soglia è il
      // coseno del raggio angolare: 0.99965 ≈ 1.5 gradi, che a schermo è un
      // disco piccolo come dev'essere — un sole grande sembra un lampione.
      float bordo = fwidth(cs) * 1.2;
      float disco = smoothstep(0.99960 - bordo, 0.99960 + bordo, cs);
      vec3 tinta = uAstroCol;
      if (uNotte > 0.5) {
        // LA LUNA HA UNA FACCIA: due macchie scure fisse, se no è un disco
        // bianco e si legge come un buco nel cielo.
        vec3 su2 = normalize(cross(uAstro, vec3(0.0, 0.0, 1.0)) + 1e-5);
        vec3 de2 = normalize(cross(uAstro, su2));
        vec2 uv = vec2(dot(d, de2), dot(d, su2)) * 120.0;
        float mare = smoothstep(0.42, 0.30, length(uv - vec2(-0.18, 0.12)))
                   + smoothstep(0.30, 0.20, length(uv - vec2(0.22, -0.15)));
        tinta *= 1.0 - 0.16 * clamp(mare, 0.0, 1.0);
      }
      col = mix(col, tinta, disco);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export class Cielo {
  constructor(scena) {
    const g = new THREE.SphereGeometry(1, 24, 16);
    this.materiale = new THREE.ShaderMaterial({
      uniforms: {
        uBasso: { value: new THREE.Color(0x8fd3ff) },
        uAlto: { value: new THREE.Color(0x3f8fd8) },
        uAstro: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() },
        uAstroCol: { value: new THREE.Color(1, 0.98, 0.90) },
        uAlone: { value: new THREE.Color(1.0, 0.85, 0.55) },
        uNotte: { value: 0 },
        uAltezza: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.materiale);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;   // prima di tutto: fa da sfondo
    scena.add(this.mesh);
  }

  imposta(on) { this.mesh.visible = on; }

  /**
   * Lo chiama il ciclo giorno/notte, una volta per frame.
   * @param basso colore dell'orizzonte (lo stesso della nebbia)
   * @param alto  colore dello zenit
   * @param astro direzione VERSO l'astro (la stessa che fa l'ombra)
   * @param notte 0..1
   */
  aggiorna(basso, alto, astro, notte) {
    const u = this.materiale.uniforms;
    u.uBasso.value.copy(basso);
    u.uAlto.value.copy(alto);
    u.uAstro.value.copy(astro).normalize();
    u.uNotte.value = notte;
    u.uAltezza.value = Math.max(0, u.uAstro.value.y);
    if (notte > 0.5) {
      u.uAstroCol.value.setRGB(0.92, 0.94, 1.0);
      u.uAlone.value.setRGB(0.45, 0.52, 0.75);
    } else {
      u.uAstroCol.value.setRGB(1.0, 0.98, 0.88);
      // l'alone vira al caldo quando l'astro scende: è il tramonto che si accende
      const k = 1 - Math.min(1, u.uAltezza.value * 2.2);
      u.uAlone.value.setRGB(1.0, 0.86 - 0.22 * k, 0.62 - 0.42 * k);
    }
  }
}
