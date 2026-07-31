// IL CIELO — gradiente, l'astro, il suo bagliore e le stelle.
//
// Prima era `scena.background = un colore`: una parete di tinta piatta. Da lì
// venivano tre cose che mancavano tutte insieme:
//  · nessuna SFUMATURA fra orizzonte e zenit, cioè il cielo non aveva profondità;
//  · nessun SOLE e nessuna LUNA da guardare — la luce c'era ma la sorgente no,
//    e l'ombra puntava da una parte dove non si vedeva niente;
//  · nessun BAGLIORE quando li inquadri.
//
// ⚠ E PER TRE GIRI NESSUNO L'HA VISTO, questo cielo: la camera non poteva
// scendere sotto il giocatore, quindi si fermava quindici gradi sopra
// l'orizzonte e tutto ciò che c'è qui dentro restava fuori inquadratura. È il
// motivo per cui il committente continuava a dire «non hai ancora aggiornato il
// cielo» mentre il cielo c'era: una cosa che non si può guardare non esiste.
// Sistemato il pitch della camera (config.js, CAMERA.pitchMin), questo file è
// diventato di colpo la metà dello schermo — e allora andava fatto bene.
//
// COM'È FATTO: una cupola che segue la camera (raggio grande, facce interne,
// disegnata per prima e senza scrivere la profondità). Tutto il resto è nel
// fragment shader, quindi il cielo costa DUE TRIANGOLI di vertici e una passata
// di pixel senza texture né overdraw.
//
// LO STILE RESTA QUELLO DEL GIOCO: il disco dell'astro ha il BORDO NETTO come le
// nuvole e le ombre, e anche la corona attorno è fatta di ANELLI a bordo vivo,
// non di una sfumatura gaussiana. Resta morbido solo il velo largo che tinge
// mezzo cielo attorno al sole basso: quello è atmosfera, non un oggetto.
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
  uniform float uTempo;     // secondi: scintillio e stella cadente
  uniform float uFase;      // fase lunare: 0 nuova, 0.5 piena, 1 nuova

  // hash 3D per le stelle: niente texture, niente attributi
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float hash11(float n) { return fract(sin(n * 78.233) * 43758.5453); }

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

    // ---- LA FOSCHIA SULLA LINEA D'ORIZZONTE ---------------------------------
    // Una fascia chiara e stretta proprio dove il cielo tocca il mondo. Fa due
    // cose in una: dà PROFONDITÀ a un fondale che senza è una parete dipinta, e
    // nasconde il punto in cui il terreno lontano finisce dentro la nebbia — se
    // i due colori non si toccano lì, si vede la riga.
    float foschia = exp(-abs(d.y) * 13.0);
    col = mix(col, uBasso * 1.12 + vec3(0.02), foschia * 0.55);

    // ---- LE STELLE ----------------------------------------------------------
    // Solo di notte e solo in alto: all'orizzonte la nebbia se le mangerebbe
    // comunque, e calcolarle lì sarebbe lavoro buttato.
    if (uNotte > 0.01 && d.y > 0.02) {
      // LA VIA LATTEA: una fascia dove le stelle sono molto più fitte. Non è una
      // texture né un rumore in più — è la STESSA griglia con la soglia
      // abbassata dove passa la fascia. Costa una moltiplicazione, e un cielo
      // notturno con una fascia più fitta smette di sembrare carta da parati.
      float via = exp(-pow(dot(d, normalize(vec3(0.46, 0.30, -0.84))) * 3.1, 2.0));
      float soglia = mix(0.984, 0.946, via);

      // LA CELLA NON È LA STELLA. Accendendo la cella intera si ottengono
      // quadratini e rombi grandi come francobolli — provato, sembravano
      // coriandoli. La cella dice SE c'è una stella; dove sta dentro la cella e
      // quanto è piccola lo dicono altri due hash. La griglia è fissa nel mondo,
      // quindi le stelle stanno ferme mentre la camera gira.
      vec3 q = d * 300.0;
      vec3 g = floor(q);
      float h = hash31(g);
      if (h > soglia) {
        vec3 centro = vec3(hash31(g + 11.3), hash31(g + 23.7), hash31(g + 37.1)) - 0.5;
        float dd = length(fract(q) - 0.5 - centro * 0.7);
        // ALCUNE STELLE SONO PIÙ GROSSE. Tutte della stessa taglia danno una
        // spolverata regolare; poche più grandi e più accese e il cielo prende
        // subito il carattere di un cielo — sono quelle che l'occhio unisce.
        float grossa = step(0.9965, h);
        float raggio = mix(0.30, 0.46, grossa);
        float lum = smoothstep(raggio, 0.04, dd) * (h - soglia) / (1.0 - soglia);
        lum *= mix(1.0, 2.1, grossa);
        // e BATTONO, ognuna col suo ritmo: un cielo di puntini fermi è una
        // decalcomania appiccicata dietro al mondo
        lum *= 0.78 + 0.22 * sin(uTempo * (0.7 + hash31(g + 5.1) * 1.6) + hash31(g + 9.7) * 6.283);
        // VERSO L'ORIZZONTE LA GRIGLIA FINISCE SOTTO IL PIXEL e le stelle
        // diventano un motivo a scacchi — moiré, non stelle. Dove una cella è
        // più piccola di un pixel non si disegna: è la stessa regola degli
        // anelli di pioggia e dei nastri sull'acqua.
        lum *= clamp(1.4 - length(fwidth(q)) * 0.5, 0.0, 1.0);
        col += vec3(0.85, 0.88, 1.0) * lum * uNotte * clamp(d.y * 3.0, 0.0, 1.0);
      }

      // ---- LA STELLA CADENTE ------------------------------------------------
      // Una ogni diciassette secondi, e dura un attimo. Non è decorazione a
      // caso: è l'unica cosa che si MUOVE in un cielo notturno fermo, ed è
      // quella che fa venire voglia di guardare in su una seconda volta.
      float giro = uTempo / 17.0;
      float n = floor(giro), f = fract(giro);
      if (f < 0.16) {
        // due punti sulla cupola scelti dal numero della meteora: nasce in alto
        // e scende di traverso, mai due volte uguale
        vec3 A = normalize(vec3(hash11(n) * 2.0 - 1.0,
                                0.55 + hash11(n + 3.0) * 0.4,
                                hash11(n + 7.0) * 2.0 - 1.0));
        vec3 B = normalize(A + vec3(hash11(n + 11.0) - 0.5, -0.65, hash11(n + 13.0) - 0.5));
        float t = f / 0.16;
        float scia = 0.0;
        // la CODA: quattro campioni all'indietro, sempre più deboli
        for (int k = 0; k < 4; k++) {
          float tk = clamp(t - float(k) * 0.035, 0.0, 1.0);
          vec3 P = normalize(mix(A, B, tk));
          scia = max(scia, smoothstep(0.010, 0.0, distance(d, P)) * (1.0 - float(k) * 0.24));
        }
        // entra e esce in dissolvenza: una meteora che appare e sparisce di
        // colpo si legge come un difetto di disegno, non come una stella
        col += vec3(0.95, 0.97, 1.0) * scia * uNotte
             * smoothstep(0.0, 0.12, t) * smoothstep(1.0, 0.72, t);
      }
    }

    // ---- L'ASTRO E IL SUO BAGLIORE -----------------------------------------
    float cs = dot(d, uAstro);
    if (cs > 0.0) {
      // IL BAGLIORE PRIMA, il disco dopo: così il disco resta pulito e netto
      // sopra l'alone invece di essere annacquato da lui.
      float medio = pow(cs, 90.0) * 0.13;
      float largo = pow(cs, 10.0);
      // il velo largo si apre quando l'astro è BASSO: è all'alba e al tramonto
      // che il cielo si accende attorno, non a mezzogiorno
      float bassoAstro = 1.0 - clamp(uAltezza, 0.0, 1.0);
      col += uAlone * (medio + largo * (0.05 + 0.28 * bassoAstro));

      // ---- LA CORONA A GRADINI ----------------------------------------------
      // ⚠ QUI C'ERA UNA GAUSSIANA STRETTA, cioè l'unica cosa sfocata di tutto il
      // gioco messa esattamente dove l'occhio va a finire: il sole diventava una
      // palla sfumata in mezzo a un mondo di bordi netti. È lo stesso rilievo
      // che il committente aveva già fatto per le nuvole e per i particellari,
      // solo applicato al cielo. Adesso sono DUE ANELLI a bordo vivo, come i
      // toni piatti delle nuvole: disegnati, non sfocati.
      float ang = acos(clamp(cs, -1.0, 1.0));
      float b = fwidth(ang) * 1.3;
      float a1 = 1.0 - smoothstep(0.052 - b, 0.052 + b, ang);
      float a2 = 1.0 - smoothstep(0.115 - b, 0.115 + b, ang);
      col += uAlone * (a1 * 0.34 + a2 * 0.15);

      // IL DISCO, a bordo netto come tutto il resto del gioco. La soglia è il
      // coseno del raggio angolare: 0.99960 ≈ 1.6 gradi, che a schermo è un
      // disco piccolo come dev'essere — un sole grande sembra un lampione.
      float bordo = fwidth(cs) * 1.2;
      float disco = smoothstep(0.99960 - bordo, 0.99960 + bordo, cs);
      vec3 tinta = uAstroCol;
      if (uNotte > 0.5) {
        // gli assi del disco: servono sia alle macchie sia alla fase
        vec3 su2 = normalize(cross(uAstro, vec3(0.0, 0.0, 1.0)) + 1e-5);
        vec3 de2 = normalize(cross(uAstro, su2));
        vec2 uv = vec2(dot(d, de2), dot(d, su2)) * 120.0;
        // LA LUNA HA UNA FACCIA: due macchie scure fisse, se no è un disco
        // bianco e si legge come un buco nel cielo.
        float mare = smoothstep(0.42, 0.30, length(uv - vec2(-0.18, 0.12)))
                   + smoothstep(0.30, 0.20, length(uv - vec2(0.22, -0.15)));
        tinta *= 1.0 - 0.16 * clamp(mare, 0.0, 1.0);

        // ---- E HA LE FASI ---------------------------------------------------
        // Era piena tutte le notti. Una luna che cambia è la cosa più economica
        // che esista per far sentire che i GIORNI PASSANO in un gioco senza
        // trama: costa un numero e mezza riga di shader, e si nota alla seconda
        // notte. Il terminatore è un'ellisse — x = k·√(1−y²) sul disco unitario
        // — e k = cos(2π·fase) la fa aprire e chiudere da sola.
        float k = cos(uFase * 6.28318);
        float yy = clamp(uv.y / 0.5, -1.0, 1.0);
        float term = k * sqrt(max(0.0, 1.0 - yy * yy)) * 0.5;
        float acceso = uFase <= 0.5 ? step(term, uv.x) : step(uv.x, -term);
        // la parte in ombra NON sparisce: resta un disco appena più chiaro del
        // cielo, come la luna vera illuminata di rimbalzo dalla Terra. Senza,
        // una falce sembra un ritaglio di carta invece di una sfera.
        tinta = mix(mix(uBasso * 0.75, tinta, 0.16), tinta, acceso);
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
        uTempo: { value: 0 },
        uFase: { value: 0.5 },
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
   * @param tempo secondi (scintillio delle stelle e stelle cadenti)
   * @param fase  fase lunare 0..1 (0 = nuova, 0.5 = piena)
   */
  aggiorna(basso, alto, astro, notte, tempo = 0, fase = 0.5) {
    const u = this.materiale.uniforms;
    u.uBasso.value.copy(basso);
    u.uAlto.value.copy(alto);
    u.uAstro.value.copy(astro).normalize();
    u.uNotte.value = notte;
    u.uAltezza.value = Math.max(0, u.uAstro.value.y);
    u.uTempo.value = tempo;
    u.uFase.value = fase;
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
