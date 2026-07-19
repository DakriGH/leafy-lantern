// Luci-sfera: fake pointlight che schiariscono SOLO le superfici compenetrate.
// Nessuna luce three.js reale in tutto il gioco: materiali unlit + shader iniettato.
// (SPEC-TECNICA.md §2)

import * as THREE from 'three';
import { LUCI_MAX } from '../config.js';
import { GRADINI, LUCE_MIN, QUOTA_MIN_NOTTE, GUADAGNO_LUME, MAX_LIVELLO } from '../world/luce.js';

// ---- heightmap del cielo: per colonna, la quota della superficie più alta.
// Serve alle OMBRE DELLE NUVOLE: scuriscono solo la cima della colonna
// (mai grotte o soffitti). Il mesher la aggiorna gratis a ogni rebuild di chunk.
const CIELO_DIM = 256;
const CIELO_ORIGINE = -128;
const _cieloDati = new Float32Array(CIELO_DIM * CIELO_DIM).fill(-1000);
const _cieloTex = new THREE.DataTexture(_cieloDati, CIELO_DIM, CIELO_DIM, THREE.RedFormat, THREE.FloatType);
_cieloTex.magFilter = THREE.NearestFilter;
_cieloTex.minFilter = THREE.NearestFilter;
_cieloTex.needsUpdate = true;

/** Scrive le quote di un chunk (mappa "x,z" → quota superficie). */
export function aggiornaCielo(colonne) {
  for (const [k, alt] of colonne) {
    const [x, z] = k;
    const ix = x - CIELO_ORIGINE, iz = z - CIELO_ORIGINE;
    if (ix < 0 || ix >= CIELO_DIM || iz < 0 || iz >= CIELO_DIM) continue;
    _cieloDati[iz * CIELO_DIM + ix] = alt;
  }
  _cieloTex.needsUpdate = true;
}

// ---- maschera d'ombra delle nuvole ----------------------------------------
// I rettangoli delle scatole vengono DISEGNATI su un piccolo canvas (CPU, poche
// volte al secondo) e lo shader fa UN campionamento a pixel. Prima c'era un
// ciclo fino a 40 rettangoli per OGNI fragment: su GPU mobile erano centinaia
// di operazioni a pixel, il singolo costo più alto di tutto il frame.
// Stesso dominio della heightmap (origine −128, 1 texel = 1 unità): lo shader
// riusa la stessa uv per entrambe le texture.
// 2 texel per unità (512² sul dominio da 256): a 1 texel il bordo NETTO delle
// ombre avanzava a scatti di una cella intera
const OMBRA_DIM = 512;
const _ombraCanvas = document.createElement('canvas');
_ombraCanvas.width = _ombraCanvas.height = OMBRA_DIM;
const _ombraCtx = _ombraCanvas.getContext('2d');
const _ombraTex = new THREE.CanvasTexture(_ombraCanvas);
_ombraTex.flipY = false;                       // riga 0 del canvas = v0, come la DataTexture
_ombraTex.magFilter = THREE.LinearFilter;      // il bilineare fa da bordo morbido (~1 unità)
_ombraTex.minFilter = THREE.LinearFilter;
_ombraTex.generateMipmaps = false;

// ---- IMPATTI DELLE CASCATE: anelli di schiuma, calcolati nello shader -------
// Erano cerchi disegnati su un canvas 512² (2 texel per unità) e campionati in
// XZ. Due guai in uno, ed erano il "lenzuolo bianco" segnalato:
//  · si disegnavano con fill(), cioè DISCHI PIENI. Il passaggio che li avrebbe
//    svuotati iterava su `celle` — le colonne dei furni dentro l'acqua — che
//    main.js passa SEMPRE vuota da quando la silhouette la fa uSchiumaRT:
//    l'anello non è mai esistito, era sempre stato un disco;
//  · la maschera non conosceva la QUOTA, quindi sbiancava ogni faccia d'acqua
//    nel raggio a QUALSIASI altezza: nella scena di collaudo il canale in cima
//    diventava bianco per colpa della pozza cinque blocchi più sotto.
// Come distanza analitica l'anello è esatto a qualsiasi zoom e la quota entra
// nel conto gratis, ma il ciclo ha un TETTO che la maschera non aveva (lei
// rasterizzava un numero qualsiasi di cerchi).
//
// QUANTO DEVE VALERE. A 8 il commento diceva "gli impatti a vista sono una
// manciata": falso già su una cascata a gradini modesta — la scalinata delle
// terrazze allagata ne produce 79 di distinti, quindi 71 anelli sparivano e
// l'insieme degli 8 superstiti cambiava con la CAMERA (spostando il bersaglio
// da cima a fondo si scambiavano 8 su 8): gli anelli nascevano ai piedi del
// giocatore e svanivano dietro di lui.
// 32 è scelto sul costo VERO per fragment, misurato — non a occhio. Il grosso
// del ciclo era la lanterna di rumore che sfrangia il bordo, e quella NON
// dipende dall'indice (vedi anelloImpatti): spostata fuori, ogni giro costa una
// manciata di operazioni. Misurato con la scalinata allagata a tutto schermo
// (975×625, readPixels come punto di sincronia vero — con gl.finish() da solo
// il numero esce falso di un ordine di grandezza): 0,644 ms/frame a 0 impatti,
// 0,646 a 8, 0,699 a 32. Alzare il tetto da 8 a 32 costa quindi 0,05 ms, cioè
// ~0,002 ms per slot; 96 ne costerebbero quasi 0,2 (dieci volte tanto sul
// Chromebook bersaglio) e occuperebbero 96 dei 224 vec4 garantiti in ES 3.0,
// dove LUCI_MAX ne prende già 48. 32 è dove le due curve si incontrano.
//
// RESTA UN TETTO, e va detto: sopra i 32 impatti a vista qualcuno non si vede.
// Il pannello debug lo stampa ("anelli d'impatto N/M ⚠ oltre il tetto") invece
// di lasciarlo scoprire a occhio. Quello che NON succede più è il tremolio:
// vedi IMPATTI_FASCIA.
const IMPATTI_MAX = 32;
// Raggio della FASCIA di vicinanza usata per ordinare gli impatti quando sono
// più del tetto. Non si ordina per distanza pura: quella cambia a ogni passo del
// giocatore e rimescola l'insieme di continuo — era metà del difetto ("gli
// anelli nascono ai piedi del giocatore e svaniscono dietro di lui"). Ordinando
// per FASCIA e, dentro la fascia, per posizione nel mondo, l'insieme resta
// IDENTICO finché il fuoco si muove dentro la stessa fascia: le sostituzioni
// avvengono solo attraversando un confine, e lì gli anelli in gioco sono quelli
// a 12+ unità di distanza, cioè piccoli sullo schermo.
const IMPATTI_FASCIA = 12;

const _statImpatti = { mostrati: 0, totali: 0 };
/** Quanti anelli sono a schermo e quanti ne esistono: il tetto va VISTO, non
 *  subìto in silenzio (lo stampa il pannello debug). */
export function statImpatti() { return _statImpatti; }

/** Anelli di schiuma degli impatti di cascata: `impatti` = [{x, y, z, r}] in
 *  coordinate mondo, dove y è la quota del PELO su cui la colonna sbatte (non
 *  quella da cui parte). `fuoco` sceglie i più vicini quando sono troppi. */
export function impostaSchiumaAcqua(impatti, fuoco = null) {
  let lista = impatti;
  if (lista.length > IMPATTI_MAX) {
    // SI ORDINA SEMPRE. Il taglio era condizionato a `fuoco`: senza, restavano
    // i primi otto NELL'ORDINE DI ITERAZIONE DEI CHUNK — un sottoinsieme
    // arbitrario che cambiava da solo appena una Map veniva ricostruita.
    lista = lista.slice();
    // La posizione nel mondo è la chiave di riserva ED È IL PUNTO: non si muove,
    // quindi due frame consecutivi scelgono lo stesso insieme. Senza fuoco è
    // l'unico criterio; col fuoco decide dentro la fascia.
    const fascia = fuoco
      ? (i) => Math.floor(Math.hypot(i.x - fuoco.x, i.z - fuoco.z) / IMPATTI_FASCIA)
      : () => 0;
    lista.sort((a, b) => fascia(a) - fascia(b) || a.x - b.x || a.z - b.z || a.y - b.y);
  }
  const n = Math.min(lista.length, IMPATTI_MAX);
  for (let i = 0; i < n; i++) {
    const im = lista[i];
    uniformi.uImpatti.value[i].set(im.x, im.y, im.z, im.r);
  }
  uniformi.uImpattiNum.value = n;
  _statImpatti.mostrati = n;
  _statImpatti.totali = impatti.length;
}

// Uniform condivisi da OGNI materiale patchato: un solo aggiornamento per frame.
const uniformi = {
  uLuciPosRaggio: { value: Array.from({ length: LUCI_MAX }, () => new THREE.Vector4(0, 0, 0, 1)) },
  uLuciColore: { value: Array.from({ length: LUCI_MAX }, () => new THREE.Vector4(1, 1, 1, 0)) },
  uLuciNum: { value: 0 },
  uAmbiente: { value: new THREE.Color(1, 1, 1) },
  uOmbraNum: { value: 0 },        // 0 = nessuna nuvola: lo shader esce subito
  uOmbraForza: { value: 0.28 },
  uOmbraMask: { value: _ombraTex },
  uCielo: { value: _cieloTex },
  uCieloInfo: { value: new THREE.Vector4(CIELO_ORIGINE, CIELO_ORIGINE, 1 / CIELO_DIM, CIELO_DIM) },
  uTempo: { value: 0 },
  // ---- luce cotta a voxel (world/luce.js) ----
  uLuceCotta: { value: 1 },                      // 0 = spenta (interruttore Impostazioni)
  uOraLuce: { value: 1 },                        // 0 notte fonda … 1 pieno giorno
  uLuceGradini: { value: GRADINI },              // scalini del cel shading
  uLuceMin: { value: LUCE_MIN },                 // pavimento di luminosità a mezzogiorno
  uLuceMinNotte: { value: QUOTA_MIN_NOTTE },     // …e quota che ne resta a notte fonda
  uLumeGuadagno: { value: GUADAGNO_LUME },
  uLumeColore: { value: new THREE.Color(1.0, 0.86, 0.62) },   // caldo di lanterna:
                                                 // RIPIEGO, quando nessuna sfera
                                                 // arriva qui a dire la sua tinta
  // Quanto la tinta della lampada si allontana dal bianco. I colori delle
  // sorgenti sono scelti per l'ASPETTO DEL PUNTINO (una lucciola menta accesa),
  // e in spazio LINEARE #7dffa0 vale (0.21, 1.00, 0.35): usato dritto come
  // colore di LUCE tinge la grotta di verde fluo. A 0.55 la lucciola resta
  // verdina e il lampione #ffd889 esce (1.00, 0.83, 0.66) — cioè esattamente
  // l'ambra dichiarata in uLumeColore, che prima non compariva mai.
  uLumeSatura: { value: 0.55 },
  // La sfera additiva adesso è il NUCLEO, non il piatto forte: il canale cotto
  // porta finalmente la sua parte di colore (prima veniva moltiplicato per
  // l'ambiente blu e si annullava). A piena intensità i due si sommavano e il
  // verde della lucciola sfondava il bianco.
  uLumeSfera: { value: 0.5 },
  uColoreCielo: { value: new THREE.Color(1, 1, 1) },          // cielo dell'ora corrente
  uTintaCielo: { value: 0 },                     // quanto il cielo TINGE il terreno
  uPioggia: { value: 0 },                        // 0..1: increspature di pioggia
  uRiflesso: { value: null },                    // RT del mirror (riflesso.js)
  uRiflessoMat: { value: new THREE.Matrix4() },
  uRiflessoOn: { value: 0 },                     // 0/1 per-frame
  uRiflessoForza: { value: 1 },                  // slider Impostazioni (0..1.5)
  uPgPos: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uPgNum: { value: 0 },                          // ombre-cono dei personaggi
  // impatti delle cascate: (x, quota del pelo colpito, z, raggio dell'anello)
  uImpatti: { value: Array.from({ length: IMPATTI_MAX }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uImpattiNum: { value: 0 },
  uSchiumaRT: { value: null },                   // silhouette dall'alto (schiumaTop.js)
  uSchiumaRTInfo: { value: new THREE.Vector4(0, 0, 0, 0) },   // minX, minZ, 1/est, attivo
  // in AR il mondo vive dentro un pivot ruoto-scalato: questa è la sua INVERSA,
  // così vPosMondo resta in coordinate MONDO e luci/ombre/schiuma funzionano
  // anche sul diorama in AR (identità quando l'AR è spenta)
  uMondoInv: { value: new THREE.Matrix4() },
};

/** Matrice mondo→pivot inversa (AR). Passare null per tornare all'identità. */
export function impostaMondoInv(matrice) {
  if (matrice) uniformi.uMondoInv.value.copy(matrice);
  else uniformi.uMondoInv.value.identity();
}

/** Collega la silhouette dall'alto (schiuma a forma esatta) al frame. */
export function impostaSchiumaTop(texture, info) {
  uniformi.uSchiumaRT.value = texture;
  uniformi.uSchiumaRTInfo.value.copy(info);
}

/** Ombre-cono dei personaggi (player, gatto remoto, palle): {x,y,z,r} dai piedi. */
export function impostaOmbrePg(lista) {
  const n = Math.min(lista.length, 6);
  for (let i = 0; i < n; i++) {
    const e = lista[i];
    uniformi.uPgPos.value[i].set(e.x, e.y, e.z, e.r);
  }
  uniformi.uPgNum.value = n;
}

/** Orologio degli shader animati (acqua): da chiamare una volta per frame. */
export function aggiornaTempo(secondi) { uniformi.uTempo.value = secondi; }

/** Intensità della pioggia (0..1): accende le increspature sull'acqua. */
export function impostaPioggia(v) { uniformi.uPioggia.value = v; }
export function intensitaPioggia() { return uniformi.uPioggia.value; }

/** Collega il riflesso planare del frame (o lo spegne se ok=false). */
export function impostaRiflesso(ok, texture, matrice) {
  uniformi.uRiflessoOn.value = ok ? 1 : 0;
  if (ok) {
    uniformi.uRiflesso.value = texture;
    uniformi.uRiflessoMat.value.copy(matrice);
  }
}
export function impostaForzaRiflesso(f) { uniformi.uRiflessoForza.value = f; }

/** Le nuvole pubblicano qui i rettangoli (XZ) delle loro scatole = ombra reale.
 *  box = Vector4(minX, minZ, maxX, maxZ) in coordinate mondo. */
export function impostaOmbreNuvole(box, forza) {
  const ctx = _ombraCtx;
  const S = OMBRA_DIM / CIELO_DIM;               // texel per unità di mondo
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, OMBRA_DIM, OMBRA_DIM);
  ctx.fillStyle = '#fff';
  for (const b of box) {
    ctx.fillRect((b.x - CIELO_ORIGINE) * S, (b.y - CIELO_ORIGINE) * S, (b.z - b.x) * S, (b.w - b.y) * S);
  }
  _ombraTex.needsUpdate = true;
  uniformi.uOmbraNum.value = box.length ? 1 : 0;
  if (forza !== undefined) uniformi.uOmbraForza.value = forza;
}

const GLSL_VERTEX = /* glsl */`
  varying vec3 vPosMondo;
  uniform mat4 uMondoInv;
  // LUCE COTTA A VOXEL, per FACCIA: (quanto cielo MANCA, quanto lume c'è).
  //
  // DUE BYTE, non tre float. L'informazione è COSTANTE sui tre vertici di ogni
  // triangolo e i livelli sono interi 0..15: otto bit avanzano, e 255 = 15×17
  // fa tornare ogni livello esatto dopo la normalizzazione. Il terzo canale
  // ("è cotta?") era un flag globale per mesh e ora è la uniform uLuceDati.
  // Prima erano 12 B/vertice: 2,8 MB su un open world r48 per un attributo per
  // metà a zero. Su un Braswell a memoria condivisa la banda per vertice è
  // proprio il costo che conta.
  //
  // La polarità è scelta per il default WebGL di un attributo che la geometria
  // NON ha, (0,0,0,1): chi non lo porta legge "cielo pieno, nessun lume", cioè
  // resta esattamente com'era. Memorizzare il cielo dritto (invece di "quanto
  // manca") avrebbe annerito quelle mesh.
  attribute vec2 aLuce;
  varying vec2 vLuce;
`;
const GLSL_FRAGMENT = /* glsl */`
  varying vec3 vPosMondo;
  varying vec2 vLuce;

  uniform vec3 uAmbiente;
  uniform float uLuceDati;       // PER MATERIALE: 1 = questa mesh porta aLuce
  uniform float uLuceCotta;      // interruttore globale (Impostazioni)
  uniform float uOraLuce;        // 0 = notte fonda, 1 = pieno giorno
  uniform float uLuceGradini;    // scalini del cel shading: UNO SOLO per tutto
  uniform float uLuceMin;        // pavimento di luminosità a mezzogiorno
  uniform float uLuceMinNotte;   // …e quota che ne resta a notte fonda
  uniform float uLumeGuadagno;   // i raggi delle lampade qui sono piccoli
  uniform vec3 uLumeColore;      // caldo di lanterna: RIPIEGO quando nessuna
                                 // sfera arriva qui a dire la sua tinta
  uniform float uLumeSatura;     // quanto la tinta si stacca dal bianco
  uniform float uLumeSfera;      // peso del nucleo additivo
  uniform vec3 uColoreCielo;     // colore del cielo all'ora corrente
  uniform float uTintaCielo;     // quanto il cielo TINGE il terreno
  uniform vec4 uLuciPosRaggio[${LUCI_MAX}];
  uniform vec4 uLuciColore[${LUCI_MAX}];
  uniform int uLuciNum;

  // UNA SOLA REGOLA DI ARROTONDAMENTO PER TUTTO. Prima il canale cotto usava
  // floor(v*4+0.5) sui livelli voxel e le luci-sfera ceil(v*3) sulla distanza
  // radiale: numero di bande DIVERSO e regola DIVERSA sulla stessa lampada,
  // quindi i due insiemi di anelli non potevano coincidere e attorno alle luci
  // si vedevano le transizioni sporche.
  float lanternaGradino(float v) {
    return floor(clamp(v, 0.0, 1.0) * uLuceGradini + 0.5) / uLuceGradini;
  }
  // livelli residui (0..15, normalizzati) → 0..1. Il guadagno esiste perché qui
  // i raggi sono piccoli: senza, una lucciola (raggio 5) varrebbe un terzo di
  // luce e non illuminerebbe nemmeno la propria cella.
  float lanternaDaLivello(float liv) { return min(1.0, liv * uLumeGuadagno); }

  // stato del fragment: lo prepara lanternaPrepara() una volta sola
  vec3 _lumeSomma; float _lumePeso;      // tinta media delle lampade che arrivano qui
  float _cieloVista, _cieloQ, _lumeQ;

  void lanternaPrepara() {
    _cieloVista = lanternaGradino(1.0 - vLuce.x);   // quanto questa faccia VEDE il cielo
    _cieloQ = _cieloVista * uOraLuce;               // …e quanto gliene arriva ADESSO
    _lumeQ = lanternaGradino(lanternaDaLivello(vLuce.y));
    _lumeSomma = vec3(0.0); _lumePeso = 0.0;
  }

  // MASCHERA DELLE LUCI-SFERA. Una sfera è solo una distanza: non sa niente dei
  // muri, e infatti i lampioni li attraversavano. Il canale cotto invece i muri
  // li conosce — dove il lume non è mai arrivato la sfera si spegne.
  // uLuceDati (per MATERIALE, non più un canale dell'attributo) tiene fuori chi
  // non ha dati cotti: senza, quelle mesh perderebbero del tutto i lampioni.
  float lanternaMascheraLume() {
    if (uLuceCotta < 0.5) return 1.0;
    return mix(1.0, _lumeQ, uLuceDati);
  }

  vec3 lanternaAccumulo() {
    vec3 acc = vec3(0.0);
    if (uLuciNum == 0) return acc;                    // giorno senza lampade: costo zero
    for (int i = 0; i < ${LUCI_MAX}; i++) {
      if (i >= uLuciNum) break;
      vec4 pr = uLuciPosRaggio[i];
      vec3 dv = vPosMondo - pr.xyz;
      float d2 = dot(dv, dv);
      if (d2 < pr.w * pr.w) {                         // sqrt e divisione solo dentro la sfera
        // STESSA SCALA del canale cotto: livelli residui in CELLE (raggio meno
        // distanza), non frazione del raggio, e stesso arrotondamento. Così una
        // lampada ha UNA sola rampa e gli anelli della sfera cadono dove cadono
        // quelli cotti, invece di intrecciarsi.
        float banda = lanternaGradino(lanternaDaLivello((pr.w - sqrt(d2)) / ${MAX_LIVELLO}.0));
        vec3 c = uLuciColore[i].rgb;
        acc += c * uLuciColore[i].a * banda;
        _lumeSomma += c * banda; _lumePeso += banda;
      }
    }
    // la maschera è ciò che impedisce alla sfera di passare oltre i muri
    return acc * (lanternaMascheraLume() * uLumeSfera);
  }

  // UNA LAMPADA, UNA TINTA. Il canale cotto non sa da QUALE lampada viene il
  // lume: tingerlo sempre d'ambra dava TRE colori diversi per la stessa
  // sorgente — nucleo verde menta (la sfera della lucciola), alone ambra (il
  // cotto) e campo blu (l'ambiente notturno). Qui la tinta la dettano le sfere
  // che arrivano davvero in questo punto; dove non ne arriva nessuna (lampada
  // fuori dalle LUCI_MAX più vicine) resta il caldo di lanterna.
  vec3 lanternaTinta() {
    if (_lumePeso < 0.0001) return uLumeColore;
    vec3 m = _lumeSomma / _lumePeso;
    m = m / max(max(m.r, m.g), max(m.b, 0.0001));      // conta la TINTA, non l'intensità
    return mix(vec3(1.0), m, uLumeSatura);             // …e non fino in fondo, vedi uLumeSatura
  }

  // IL CIELO TINGE, NON SOLO MOLTIPLICA. Alle 18:00 il cielo era arancione
  // saturo e l'erba restava dello stesso verde freddo di mezzogiorno: sembrava
  // un render diurno incollato su un cielo arancione. Il motivo è aritmetico —
  // l'ambiente al tramonto ha un rapporto R/G di appena 1.29, e una tinta
  // puramente MOLTIPLICATIVA non può spostare la tonalità di un albedo verde
  // saturo. Qui il colore vira VERSO il cielo, in proporzione a quanto la
  // faccia il cielo lo vede davvero: le grotte restano fuori.
  vec3 lanternaAlbedo(vec3 col) {
    return mix(col, uColoreCielo, uTintaCielo * _cieloVista);
  }

  // IL CEL SHADING NASCE QUI. I due canali si combinano prendendo il MASSIMO:
  // una stanza chiusa e illuminata resta illuminata anche a mezzogiorno, e di
  // notte — quando uOraLuce scende — sopravvive solo ciò che le lanterne
  // raggiungono. Le fasce nette sono la luce stessa arrotondata, non un
  // effetto disegnato sopra.
  //
  // Si quantizzano i LIVELLI e poi si moltiplica per l'ora, non il contrario:
  // arrotondando il prodotto, al tramonto il mondo intero salterebbe di
  // luminosità ogni volta che l'ora scavalca un gradino. Le fasce vanno nette
  // nello SPAZIO, continue nel TEMPO.
  vec3 lanternaLuce() {
    if (uLuceCotta < 0.5) return uAmbiente;
    // il PAVIMENTO scala col sole: di giorno protegge dalle macchie nere, di
    // notte deve poter essere davvero buio. Fisso a 0.38 il contrasto
    // cielo-aperto/buio-sigillato crollava a 1,6:1 proprio a mezzanotte —
    // "il giorno con la luminosità abbassata", nessuna pozza di luce.
    float minimo = uLuceMin * max(uLuceMinNotte, uOraLuce);
    float f = minimo + (1.0 - minimo) * max(_cieloQ, _lumeQ);
    // QUANTA luce la decide il massimo; DI CHE COLORE la decide chi vince.
    // Il termine della lampada NON passa per l'ambiente del cielo: moltiplicato
    // per il blu notturno (0.32, 0.36, 0.55) il caldo si annullava e una
    // superficie a distanza ZERO da una lanterna usciva ancora con B/R = 1.26,
    // cioè BLU. La lanterna non scaldava mai: passava da gelido a meno gelido.
    // basta che la lampada vinca di un gradino perché il colore sia il suo:
    // con una rampa più dolce le zone illuminate SOLO dalla lanterna restavano
    // a metà strada nel blu dell'ambiente
    float peso = clamp((_lumeQ - _cieloQ) * 4.0, 0.0, 1.0);
    return f * mix(uAmbiente, lanternaTinta(), peso);
  }

  uniform int uOmbraNum;
  uniform float uOmbraForza;
  uniform sampler2D uOmbraMask;
  uniform sampler2D uCielo;
  uniform vec4 uCieloInfo;

  // Ombra delle nuvole: la sagoma (unione dei rettangoli-scatola) è pre-disegnata
  // in una maschera → UN campionamento a pixel, forma esatta della nuvola.
  // Scurisce SOLO la superficie più alta della colonna (heightmap: niente grotte).
  float lanternaOmbra() {
    if (uOmbraNum == 0 || uOmbraForza <= 0.0) return 1.0;
    vec2 uvC = (vPosMondo.xz - uCieloInfo.xy) * uCieloInfo.z;
    if (uvC.x <= 0.0 || uvC.x >= 1.0 || uvC.y <= 0.0 || uvC.y >= 1.0) return 1.0;
    float quota = texture2D(uCielo, uvC).r;
    if (vPosMondo.y < quota - 0.35) return 1.0;      // al coperto: niente ombra
    // bordo NETTO (stile toon, come la luce dei lampioni): niente sfumatura
    float dentro = step(0.5, texture2D(uOmbraMask, uvC).r);
    return 1.0 - uOmbraForza * dentro;
  }

  uniform vec4 uPgPos[6];
  uniform int uPgNum;

  // Ombra-cono dei personaggi (stile Minecraft Bedrock): un cono proiettato
  // in giù dai piedi che SCURISCE LE MESH che attraversa — si adagia sui bordi
  // dei blocchi invece di saltare al piano sotto, e si stringe con la profondità.
  float ombraPg() {
    float f = 1.0;
    for (int i = 0; i < 6; i++) {
      if (i >= uPgNum) break;
      vec4 o = uPgPos[i];
      float prof = o.y - vPosMondo.y;
      if (prof < -0.06 || prof > 6.0) continue;
      float raggio = o.w * (1.0 - prof * 0.10);
      if (raggio <= 0.02) continue;
      float d = distance(vPosMondo.xz, o.xz);
      if (d >= raggio) continue;
      // UN solo disco netto (le due bande concentriche non piacevano);
      // il fade con la profondità va a scatti (niente gradienti morbidi)
      float fade = lanternaGradino(1.0 - prof / 6.0);
      f = min(f, 1.0 - 0.45 * fade);
    }
    return f;
  }
`;

// L'ORDINE CONTA, e in GLSL non è garantito dentro un'espressione: la tinta
// delle lampade la calcola lanternaAccumulo(), quindi va chiamata PRIMA di
// lanternaLuce(). Scrivendo `lanternaLuce() + lanternaAccumulo()` il compilatore
// sarebbe libero di valutarle al contrario e la tinta sarebbe quella di default.
const GLSL_COMPOSIZIONE = /* glsl */`
lanternaPrepara();
vec3 _accLume = lanternaAccumulo();
outgoingLight = lanternaAlbedo(outgoingLight) * (lanternaLuce() + _accLume) * lanternaOmbra() * ombraPg();
`;

function iniettaLanterna(shader, uDati) {
  Object.assign(shader.uniforms, uniformi);
  // NON condivisa: dice se QUESTA mesh porta davvero l'attributo aLuce. Era il
  // terzo canale dell'attributo (12 B/vertice per un flag costante su tutta la
  // mesh); come uniform per materiale costa zero byte di banda.
  shader.uniforms.uLuceDati = uDati;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + GLSL_VERTEX)
    .replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvPosMondo = (uMondoInv * modelMatrix * vec4(transformed, 1.0)).xyz;\nvLuce = aLuce;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLSL_FRAGMENT)
    // la luce cotta modula l'AMBIENTE, non le luci-sfera: quelle hanno già la
    // loro maschera dentro lanternaAccumulo(). Moltiplicando tutto insieme, una
    // lanterna dentro una grotta buia si sarebbe spenta da sola.
    .replace('#include <opaque_fragment>', GLSL_COMPOSIZIONE + '#include <opaque_fragment>');
}

/** `conDati` = questa mesh porta l'attributo aLuce (chunk del mondo, oppure
 *  entità sondate da scriviLuceEnte). Chi non lo porta NON deve dichiararlo, o
 *  la maschera lo lascerebbe al buio: senza attributo il lume legge 0. */
export function patchLuci(materiale, conDati = false) {
  const uDati = { value: conDati ? 1 : 0 };
  materiale.userData.uLuceDati = uDati;
  materiale.onBeforeCompile = (shader) => iniettaLanterna(shader, uDati);
  // marca per il cache-key: materiali con patch diversa non condividono programma
  materiale.customProgramCacheKey = () => 'lanterna-luci';
  return materiale;
}

// ---- sonda per le mesh SENZA facce ------------------------------------------
// Gatto, mano, palle e mobili non passano dal mesher: non hanno una faccia da
// cui leggere la luce cotta, quindi leggevano l'attributo mancante — "cielo
// pieno" OVUNQUE. Nella grotta di collaudo il gatto appoggiato alla parete
// rendeva 1.000 contro lo 0.690 della parete che toccava (45% più chiaro), e la
// maschera che tiene le luci-sfera dietro i muri per lui valeva 1: il lampione
// lo illuminava ATTRAVERSO il muro. Qui la luce gliela si SONDA nel punto in cui
// sta e la si scrive nell'attributo, costante su tutti i vertici.

// UNA GEOMETRIA, UN PADRONE — e questa è metà del lavoro di scriviLuceEnte.
// `Object3D.clone()` passa da `Mesh.copy`, che assegna geometria e materiale PER
// RIFERIMENTO: due lampioni piazzati dallo stesso def condividono lo STESSO
// BufferGeometry, e il gatto locale e uno remoto condividono il mini-cubo che
// tengono in mano (GEO_CUBO in mano.js). aLuce sta lì dentro, quindi scrivendoci
// sopra tutte le istanze finivano coi valori dell'ULTIMA sondata.
// PROVATO: due lampioni, uno in grotta (atteso [68,51]) e uno in campo aperto
// (atteso [0,0]), uscivano identici, e quale dei due vincesse dipendeva
// dall'ordine di `arredo.istanze` — cioè esattamente il difetto che questa sonda
// esiste per risolvere, sul secondo oggetto più guardato dello schermo.
// Alla prima collisione la geometria si SGANCIA. Quella nuova RIUSA gli stessi
// BufferAttribute — stessi buffer in GPU, non si copia un solo vertice — e si
// tiene per sé soltanto aLuce: due byte per vertice.
// NB: proprio perché i buffer sono condivisi, una geometria sganciata non va
// mai dispose()-ata (three cancellerebbe gli attributi anche all'originale).
// Nessuno lo fa: furni e mano si tolgono dalla scena, non si distruggono.
function sganciaGeometria(g) {
  const n = new THREE.BufferGeometry();
  // TUTTI gli attributi per riferimento TRANNE aLuce: quello è l'unica cosa che
  // deve diventare privata, e riportarselo dietro avrebbe rimesso in mano alla
  // copia lo stesso identico buffer da cui si sta scappando.
  for (const nome in g.attributes) if (nome !== 'aLuce') n.setAttribute(nome, g.attributes[nome]);
  if (g.index) n.setIndex(g.index);
  for (const gr of g.groups) n.addGroup(gr.start, gr.count, gr.materialIndex);
  n.setDrawRange(g.drawRange.start, g.drawRange.count);
  n.boundingBox = g.boundingBox;
  n.boundingSphere = g.boundingSphere;
  return n;
}

/**
 * Scrive la luce cotta di un punto su tutte le mesh di un oggetto.
 * `cieloManca` e `lume` sono 0..1 (la polarità dell'attributo, vedi GLSL_VERTEX).
 * Costa un fill SOLO quando il valore cambia: è quantizzato a 1/255, quindi per
 * un gatto fermo o un mobile non cambia mai.
 */
export function scriviLuceEnte(oggetto, cieloManca, lume) {
  const cm = Math.round(Math.max(0, Math.min(1, cieloManca)) * 255);
  const lu = Math.round(Math.max(0, Math.min(1, lume)) * 255);
  const firma = cm * 256 + lu + 1;               // +1: 0 = "mai scritto"
  const padrone = oggetto.id;                    // id three, unico per oggetto
  oggetto.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
    let g = o.geometry;
    // la stessa geometria su più mesh DELLO STESSO ente va benissimo (il gatto
    // ha 9 mesh e 6 geometrie): si sgancia solo quando il padrone è un altro
    if (g.userData.lucePadrone === undefined) g.userData.lucePadrone = padrone;
    else if (g.userData.lucePadrone !== padrone) {
      g = sganciaGeometria(g);
      g.userData.lucePadrone = padrone;
      o.geometry = g;
    }
    if (g.userData.luceFirma !== firma) {
      g.userData.luceFirma = firma;
      const n = g.attributes.position.count;
      let a = g.getAttribute('aLuce');
      if (!a || a.count !== n) {
        a = new THREE.Uint8BufferAttribute(new Uint8Array(n * 2), 2, true);
        a.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aLuce', a);
      }
      const arr = a.array;
      for (let i = 0; i < arr.length; i += 2) { arr[i] = cm; arr[i + 1] = lu; }
      a.needsUpdate = true;
    }
    // il flag va acceso QUI e non alla creazione del materiale: dichiarare
    // "ho i dati" su una mesh che l'attributo non ce l'ha la spegnerebbe
    const m = o.material;
    if (m && m.userData && m.userData.uLuceDati) m.userData.uLuceDati.value = 1;
  });
}

// ---- acqua (riflessi + cascate + pioggia) -----------------------------------
// Il pelo è PULITO: niente texture disegnata sopra. Il wobble del riflesso e i
// filamenti delle cascate sono PROCEDURALI (somme di seni): nessuna forma
// riconoscibile, niente "cerchi". I cerchi restano solo dove hanno senso:
// gli anelli di pioggia che nascono e si allargano.

const GLSL_ACQUA_VERTEX = /* glsl */`
  attribute vec3 aAcqua;
  attribute vec2 aRiva;          // (distanza dalla sponda, apertura) — vedi mesher
  varying vec3 vAcqua;
  varying vec2 vRiva;
  varying vec4 vRiflessoUv;
  uniform mat4 uRiflessoMat;
  uniform float uTempo;
`;
const GLSL_ACQUA_FRAGMENT = /* glsl */`
  varying vec3 vAcqua;
  varying vec2 vRiva;
  varying vec4 vRiflessoUv;
  uniform sampler2D uRiflesso;
  uniform vec4 uImpatti[${IMPATTI_MAX}];
  uniform int uImpattiNum;
  uniform sampler2D uSchiumaRT;
  uniform vec4 uSchiumaRTInfo;
  uniform float uTempo;
  uniform float uPioggia;
  uniform float uRiflessoOn;
  uniform float uRiflessoForza;
  float _schiumaAcqua;   // quanta schiuma qui: usata come EMISSIVA (brilla anche di notte)

  float lanternaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // value-noise morbido: la base di schiuma, wobble e scie (MAI ripetitivo)
  float lanternaRumore(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(lanternaHash(i), lanternaHash(i + vec2(1.0, 0.0)), f.x),
      mix(lanternaHash(i + vec2(0.0, 1.0)), lanternaHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // increspature di pioggia: anelli che nascono e si allargano su una griglia
  // pseudo-casuale (solo pixel d'acqua, solo quando piove)
  float anelliPioggia(vec2 p) {
    float somma = 0.0;
    for (int k = 0; k < 2; k++) {
      vec2 pk = p * 0.9 + float(k) * 17.31;
      vec2 cella = floor(pk);
      float h = fract(sin(dot(cella + float(k) * 3.7, vec2(127.1, 311.7))) * 43758.5453);
      float fase = fract(uTempo * (0.8 + 0.4 * h) + h * 7.0);
      vec2 centro = cella + 0.5 + (vec2(h, fract(h * 7.13)) - 0.5) * 0.7;
      float d = length(pk - centro);
      somma += smoothstep(0.05, 0.0, abs(d - fase * 0.45)) * (1.0 - fase);
    }
    return min(somma, 1.0);
  }

  // ANELLO d'impatto, non disco: dove la colonna sbatte l'acqua si apre e la
  // schiuma corre in fuori — il centro, che è poi la colonna stessa, resta
  // acqua. Il raggio RESPIRA e il bordo è sfrangiato dal rumore: un cerchio
  // geometrico perfetto si riconosce subito come disegnato.
  // La QUOTA è la metà del lavoro: senza, ogni pelo d'acqua nel raggio
  // sbiancava a qualsiasi altezza (il canale in cima alla cascata per colpa
  // della pozza in fondo). La tolleranza sta SOTTO il blocco intero, e non è un
  // dettaglio: su una scalinata ogni gradino ha il suo impatto, e con una
  // tolleranza più larga del gradino ognuno tingeva anche i vicini — otto anelli
  // che si saldavano nella chiazza bianca vista sulle terrazze.
  //
  // I DUE ESTREMI DELLA RAMPA HANNO DUE PADRONI DIVERSI, e vanno letti così:
  //  · 1.0 (dove l'anello è ormai spento) è il GRADINO: più largo di così ogni
  //    salto di una scalinata tingerebbe anche il vicino;
  //  · 0.55 (dove è pieno) deve stare sopra il massimo dislivello POSSIBILE fra
  //    il pelo e il centro della sua cella, che è peloDi(0) = 7/16 = 0.4375 —
  //    il valore più alto che la formula del pelo sappia produrre. Era 0.45,
  //    cioè 0.0125 di margine: funzionava, ma bastava ritoccare di un pixel la
  //    quota del pelo per far sbiadire TUTTI gli anelli senza un segnale.
  //    A 0.55 il margine è il 25% e la rampa resta comunque dentro il gradino.
  //
  // Il rumore che sfrangia il bordo si campiona UNA VOLTA fuori dal ciclo: non
  // dipende dall'indice, e dentro era l'unica cosa cara — è ciò che rende
  // sostenibile alzare IMPATTI_MAX da 8 a 32.
  float anelloImpatti(vec2 pXZ, float y) {
    float s = 0.0;
    if (uImpattiNum == 0) return s;
    float sfr = (lanternaRumore(pXZ * 3.2 + uTempo * vec2(0.45, 0.3)) - 0.5) * 0.3;
    for (int i = 0; i < ${IMPATTI_MAX}; i++) {
      if (i >= uImpattiNum) break;
      vec4 im = uImpatti[i];
      float dy = abs(y - im.y);
      if (dy < 1.0) {
        float rr = im.w * (1.0 + 0.10 * sin(uTempo * 2.6 + float(i) * 1.7));
        float d = abs(distance(pXZ, im.xz) - rr + sfr);      // distanza DALL'ANELLO
        // SOTTILE: a spessore 0.34·r l'anello copriva più area del disco che
        // sostituiva (una corona 0.69→1.41 batte un cerchio di raggio 1.05) e
        // restava un lenzuolo, solo con un buco in mezzo.
        s = max(s, step(d, im.w * 0.18) * smoothstep(1.0, 0.55, dy));
      }
    }
    return s;
  }
`;
// tipo faccia: 0 sorgente calma · 1 scorre · 2 lato cascata · 3 pelo in
// pendenza (scivolo) · 5 piatto
// Il pelo è PULITO: niente pattern disegnato sopra — solo riflessi (con wobble
// organico), anelli di pioggia e strisce tenui sulle cascate. Lo scorrimento
// lo raccontano i particellari (fx/particelle.js), non la texture.
//
// IL PELO È UNO SOLO, e questo è il punto della struttura qui sotto. I tipi 0
// (calmo), 1 (scorre) e 3 (in pendenza) sono tutti la SUPERFICIE dell'acqua
// vista da sopra: riflesso, schiuma di riva, silhouette di ciò che sta a mollo,
// anelli d'impatto e increspature di pioggia valgono per tutti e tre. Cambia
// solo il DISEGNO che ci corre sopra.
// Era il difetto: il ramo del tipo 3 — nato per rompere la lastra bianca sugli
// scivoli — conteneva SOLO le sue strisce, e tutto il resto viveva nel ramo del
// pelo piatto, che il tipo 3 non attraversava mai. Misurato sullo STESSO frame,
// scambiando solo il tipo nel buffer aAcqua della pozza: con tipo 0 accendere e
// spegnere il riflesso cambiava il 79.8% delle sonde (delta medio 17.67), con
// tipo 3 lo 0.0% (delta ESATTAMENTE 0); stessa storia per la pioggia. Il colore
// medio crollava da (167, 212, 232) a (135, 199, 220): a schermo una toppa
// opaca e senza schiuma in mezzo a una superficie riflettente.
const GLSL_ACQUA_COLORE = /* glsl */`
{
  float tipoA = vAcqua.z;
  float band = 0.0;
  _schiumaAcqua = 0.0;
  bool pelo = tipoA < 1.5 || (tipoA > 2.5 && tipoA < 3.5);
  if (pelo) {
    float lontano = clamp(distance(cameraPosition, vPosMondo) / 32.0, 0.0, 1.0);

    // RIFLESSO: wobble a VALUE-NOISE (mai ripetitivo) che sfuma con la
    // distanza — da lontano lo specchio resta fermo, niente pattern
    if (uRiflessoOn > 0.5) {
      vec2 pw = vPosMondo.xz * 0.6 + vAcqua.xy * uTempo * 0.4;
      vec2 w = vec2(lanternaRumore(pw + uTempo * 0.16), lanternaRumore(pw.yx - uTempo * 0.13)) - 0.5;
      vec4 ruv = vRiflessoUv;
      ruv.xy += w * 0.035 * (1.0 - lontano * 0.85) * ruv.w;
      vec3 rifl = texture2DProj(uRiflesso, ruv).rgb;
      vec3 vistaDir = normalize(cameraPosition - vPosMondo);
      float fres = pow(1.0 - clamp(vistaDir.y, 0.0, 1.0), 1.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, rifl, (0.28 + 0.42 * fres) * uRiflessoForza);
    }

    // SCHIUMA = CARATTERISTICA DELLO SHADER, per tutto ciò che tocca l'acqua:
    //  · RIVE e blocchi: dal gradiente aRiva (0 al bordo coi solidi);
    //  · TUTTO IL RESTO (furni di qualsiasi forma, gatti, palle, NPC futuri):
    //    silhouette dall'alto della sola geometria che BUCA il pelo — la
    //    schiuma segue la forma vera, niente footprint quadrati.
    float frasta = lanternaRumore(vPosMondo.xz * 3.4 + uTempo * vec2(0.4, 0.3));
    // silhouette VIVA: il punto di campionamento ONDEGGIA col tempo (il
    // contorno non sta mai fermo) e l'anello di dilatazione "respira"
    float sagoma = 0.0;
    if (uSchiumaRTInfo.w > 0.5) {
      vec2 wob = (vec2(
        lanternaRumore(vPosMondo.xz * 1.9 + uTempo * vec2(0.55, 0.4)),
        lanternaRumore(vPosMondo.zx * 1.9 - uTempo * vec2(0.5, 0.35))) - 0.5) * 0.3;
      vec2 uvT = (vPosMondo.xz + wob - uSchiumaRTInfo.xy) * uSchiumaRTInfo.z;
      if (uvT.x > 0.001 && uvT.x < 0.999 && uvT.y > 0.001 && uvT.y < 0.999) {
        float o = (0.32 + 0.08 * sin(uTempo * 2.3)) * uSchiumaRTInfo.z;
        sagoma = texture2D(uSchiumaRT, uvT).r;
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT + vec2(o, 0.0)).r);
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT - vec2(o, 0.0)).r);
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT + vec2(0.0, o)).r);
        sagoma = max(sagoma, texture2D(uSchiumaRT, uvT - vec2(0.0, o)).r);
      }
    }
    float maschera = anelloImpatti(vPosMondo.xz, vPosMondo.y);   // impatti cascate
    float vivo = lanternaRumore(vPosMondo.xz * 4.6 + uTempo * vec2(1.2, 0.9));
    // RIVA: UNA SOLA SOGLIA MORBIDA sulla distanza dalla sponda, e il rumore
    // entra DENTRO la distanza invece di moltiplicare il risultato. È il punto
    // che fa la differenza: la formula "a cresta" con due smoothstep disegnava
    // zigzag bianchi netti, perché le sue soglie cadevano sugli spigoli dei
    // triangoli su cui aRiva è interpolato e si leggeva la trama della mesh.
    // Sfrangiando la distanza il bordo non ha più una forma geometrica da
    // seguire, e con una soglia sola non ci sono due bordi che si rincorrono.
    // La banda ora è larga ~1 cella e mezza (prima esattamente una, e per
    // forza: aRiva era 0/1) — la schiuma di riva che mancava.
    // L'APERTURA è il guardiano dei canali stretti: lì la distanza è ~0 su tutta
    // la cella e da sola dipingerebbe tutto di bianco.
    // Le soglie sono tarate sui valori VERI prodotti dal mesher, non a occhio.
    // Distanza: le uniche tre distinte sono 0.104 (angolo sulla sponda), 0.541
    // (angolo una cella dentro) e 1 — coerenti col calcolo geometrico, perché
    // sqrt(0.5)−0.5 = 0.2071 e sqrt(2.5)−0.5 = 1.0811, entrambe diviso 2.
    // Apertura: adesso è una LARGHEZZA in celle diviso 5 (vedi rivaCella), e i
    // valori possibili sono pochi e noti — canale largo 1 = 0.20, largo 2 =
    // 0.40, largo 3 = 0.60, e uno specchio d'acqua non scende MAI sotto 0.60
    // (la sua cella d'angolo ha 3 celle libere per verso). La rampa 0.34÷0.58 ci
    // si appoggia sopra: il canale da 1 resta a zero com'era, quello da 2 tiene
    // un accenno (0.16) invece della lastra bianca misurata prima, e da 3 celle
    // in su la schiuma è PIENA. Prima la rampa finiva a 0.44 e tagliava al 64%
    // la schiuma delle celle di bordo della pozza, che valevano 0.36.
    float dRiva = vRiva.x + (frasta - 0.5) * 0.30;
    float schiumaRiva = smoothstep(0.52, 0.08, dRiva) * smoothstep(0.34, 0.58, vRiva.y);
    // silhouette e SCIA (il RT sfuma la storia): chiazze che vivono col tempo
    float schiumaSag = step(0.62, sagoma * (0.55 + 0.55 * vivo));
    float schiuma = max(max(schiumaRiva, maschera), schiumaSag);
    band = max(band, schiuma);
    diffuseColor.a = min(1.0, diffuseColor.a + schiuma * 0.55);

    // ---- DISEGNO DELLA SUPERFICIE: l'unica cosa che cambia fra i tre peli ----
    if (tipoA > 2.5) {
      // SCIVOLO: il pelo IN PENDENZA, e serve un disegno suo perché non somiglia
      // a nessuno degli altri due. Non è un lago: il rumore campionato in sola XZ
      // si stira lungo la linea di massima pendenza e diventa una lastra bianca
      // che non si spezza mai (era il difetto). Ma non è nemmeno la parete di una
      // cascata: quelle righe stanno a quota COSTANTE, e su un piano inclinato le
      // linee di livello sono rette — gradino dopo gradino esce lo stesso gallone,
      // un motivo riconoscibile che è esattamente ciò che questo shader evita.
      // Qui le strisce corrono LUNGO LA CORRENTE (la direzione è già in vAcqua.xy)
      // e la quota entra nel dominio del rumore: è la Y che rompe la ripetizione.
      vec2 dir = vAcqua.xy;
      if (dot(dir, dir) < 0.01) dir = vec2(0.7071, 0.7071);   // pendenza senza corrente
      vec2 pf = vPosMondo.xz - dir * uTempo * 1.5;
      float lungo = dot(pf, dir) + vPosMondo.y * 1.15;
      float trasv = dot(pf, vec2(-dir.y, dir.x));
      float strisce = smoothstep(0.60, 0.90, lanternaRumore(vec2(lungo * 1.05, trasv * 3.0))) * 0.7;
      band = max(band, strisce);
      diffuseColor.a = min(1.0, diffuseColor.a + strisce * 0.25);
    } else if (tipoA >= 0.5) {
      // CORRENTE: scie allungate lungo il flusso, trascinate dalla corrente
      vec2 pf = vPosMondo.xz - vAcqua.xy * uTempo * 1.2;
      float lungoF = dot(pf, vAcqua.xy);
      float traverso = dot(pf, vec2(-vAcqua.y, vAcqua.x));
      float scia = lanternaRumore(vec2(lungoF * 0.9, traverso * 3.5));
      band = max(band, smoothstep(0.68, 0.86, scia) * 0.3);
    }

    // pioggia: anelli bianchi sul pelo (solo quando piove)
    if (uPioggia > 0.01) band = max(band, anelliPioggia(vPosMondo.xz) * uPioggia);
  } else if (tipoA < 2.5) {
    // CASCATA / acqua CHE SCORRE in diagonale: NON una lastra bianca — resta
    // azzurra, con filamenti bianchi SOTTILI che corrono in giù (soglia alta:
    // prima step(0.35) copriva i 2/3 della faccia → tutta bianca)
    float colonna = lanternaRumore(vec2((vPosMondo.x + vPosMondo.z) * 1.9, floor(vPosMondo.y * 0.6)));
    float scorri = sin(vPosMondo.y * 4.8 + uTempo * 5.4 + colonna * 9.0);
    float filo = smoothstep(0.72, 0.96, scorri) * 0.7;
    // sottile frangia al ciglio (dove trabocca), non su tutta l'altezza
    float frangia = smoothstep(0.82, 0.98, lanternaRumore(vPosMondo.xz * 3.1) * 0.4 + fract(-vPosMondo.y) * 0.6) * 0.6;
    band = max(filo, frangia);
    diffuseColor.a = min(1.0, diffuseColor.a + band * 0.25);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), band);
  _schiumaAcqua = band;         // la schiuma brillerà (emissiva) anche al buio
}
`;

export function patchAcqua(materiale) {
  const uDati = { value: 1 };            // l'acqua passa dal mesher: aLuce ce l'ha
  materiale.userData.uLuceDati = uDati;
  materiale.onBeforeCompile = (shader) => {
    iniettaLanterna(shader, uDati);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_ACQUA_VERTEX)
      .replace('#include <begin_vertex>',
        `#include <begin_vertex>
vAcqua = aAcqua;
vRiva = aRiva;   // (distanza dalla sponda, apertura)
// ONDE: il pelo respira (3 seni mischiati a frequenze scollegate — niente
// pattern) e le facce piatte smettono di leggersi come lastre rettangolari.
//
// NESSUNA ECCEZIONE, e la ragione è che lo scarto dipende SOLO da x e z: due
// vertici nello stesso punto ricevono per forza lo stesso spostamento, quindi
// finché lo prendono TUTTI non può aprirsi una cucitura da nessuna parte. È un
// taglio verticale dell'intero corpo d'acqua, non un'increspatura di una faccia
// sola. Escluderne una classe è invece precisamente ciò che le apre: gli angoli
// delle facce vicine COINCIDONO per costruzione (vedi quotaAngolo nel mesher),
// e uno che si alza mentre l'altro resta giù è una fessura, per giunta ANIMATA.
// MISURATO sulla stessa scalinata allagata (493 celle d'acqua, 888 posizioni di
// vertice distinte), contando le posizioni condivise fra una faccia che si muove
// e una che sta ferma:
//   · escludendo tipo 2 e 3 (com'era) ......... 301 cuciture
//   · escludendo solo il tipo 2 ................ 189
//   · senza esclusioni (questa versione) ......... 0
// Il tipo 3 era la regressione segnalata (fino a 0.0531 unità di scarto, circa
// un pixel di blocco, che pulsava nel tempo); il tipo 2 portava le altre.
transformed.y += (sin(transformed.x * 0.9 + uTempo * 1.25)
                + sin(transformed.z * 1.15 - uTempo * 1.05)
                + sin((transformed.x + transformed.z) * 0.55 + uTempo * 0.8)) * 0.022;
vRiflessoUv = uRiflessoMat * vec4((modelMatrix * vec4(transformed, 1.0)).xyz, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_ACQUA_FRAGMENT)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_ACQUA_COLORE)
      // la schiuma è EMISSIVA: si aggiunge DOPO l'illuminazione lanterna, così
      // resta bianca e visibile anche di notte (prima veniva moltiplicata per
      // l'ambiente scuro → schiuma "nera")
      .replace('#include <opaque_fragment>',
        'outgoingLight += _schiumaAcqua * vec3(0.85);\n#include <opaque_fragment>');
  };
  materiale.customProgramCacheKey = () => 'lanterna-acqua';
  return materiale;
}

export function impostaAmbiente(colore) {
  uniformi.uAmbiente.value.copy(colore);
  // IL CICLO GIORNO/NOTTE DELLA LUCE COTTA NASCE QUI, e non serve altro: il
  // ciclo chiama questa funzione a ogni frame col colore d'ambiente, e la sua
  // LUMINANZA diventa uOraLuce, cioè quanto pesa il canale CIELO. Al calare
  // della sera il cielo si spegne, le zone che vedevano solo il sole scivolano
  // in ombra e resta acceso solo ciò che le lanterne raggiungono — che dall'ora
  // non dipende. LA MESH NON SI RICOSTRUISCE MAI: cambia un solo numero.
  const l = colore.r * 0.299 + colore.g * 0.587 + colore.b * 0.114;
  uniformi.uOraLuce.value = Math.max(0, Math.min(1, l));
}

/** Il cielo dell'ora corrente e quanto TINGE il terreno (vedi lanternaAlbedo).
 *  Lo chiama il ciclo giorno/notte insieme a impostaAmbiente. */
export function impostaTintaCielo(colore, forza) {
  uniformi.uColoreCielo.value.copy(colore);
  uniformi.uTintaCielo.value = Math.max(0, Math.min(1, forza));
}

/** Interruttore della luce cotta (Impostazioni). Spenta = tutto com'era prima. */
export function impostaLuceCotta(attiva) {
  uniformi.uLuceCotta.value = attiva ? 1 : 0;
}

/** Le uniform condivise: per ispezionarle e tararle dal vivo (debug/console). */
export function uniformiCondivise() { return uniformi; }

/** Il colore ambiente corrente (per chi si tinge a mano, es. le nuvole). */
export function ambienteAttuale() { return uniformi.uAmbiente.value; }

// ---- registro delle sorgenti ----------------------------------------------

const sorgenti = new Set();

/** Registra una sfera di luce. Ritorna l'handle {pos, raggio, colore, intensita, attiva}. */
export function creaLuce({ pos = new THREE.Vector3(), raggio = 4, colore = 0xffd889, intensita = 1, attiva = true } = {}) {
  const luce = { pos: pos.clone(), raggio, colore: new THREE.Color(colore), intensita, attiva };
  sorgenti.add(luce);
  return luce;
}

export function rimuoviLuce(luce) { sorgenti.delete(luce); }

/** Per il menu di debug: elenco sorgenti e contatori. */
export function elencoLuci() { return [...sorgenti]; }
export function statLuci() {
  let attive = 0;
  for (const l of sorgenti) if (l.attiva && l.intensita > 0) attive++;
  return { totali: sorgenti.size, attive, inviate: uniformi.uLuciNum.value };
}

const _ordinabili = [];

/** Da chiamare una volta per frame: sceglie le LUCI_MAX più vicine al fuoco (player). */
export function aggiornaLuci(fuoco) {
  _ordinabili.length = 0;
  for (const l of sorgenti) {
    if (!l.attiva || l.intensita <= 0) continue;
    _ordinabili.push(l);
  }
  if (_ordinabili.length > LUCI_MAX) {
    _ordinabili.sort((a, b) => a.pos.distanceToSquared(fuoco) - b.pos.distanceToSquared(fuoco));
    _ordinabili.length = LUCI_MAX;
  }
  for (let i = 0; i < _ordinabili.length; i++) {
    const l = _ordinabili[i];
    uniformi.uLuciPosRaggio.value[i].set(l.pos.x, l.pos.y, l.pos.z, l.raggio);
    uniformi.uLuciColore.value[i].set(l.colore.r, l.colore.g, l.colore.b, l.intensita);
  }
  uniformi.uLuciNum.value = _ordinabili.length;
}

// ---- fabbriche di materiali -----------------------------------------------
// Condivisi: tutti i chunk usano le STESSE due istanze (un solo programma GPU).

let _matMondo = null;
export function materialeMondo() {
  // conDati: i chunk arrivano dal mesher, l'attributo aLuce ce l'hanno sempre
  // (tranne a interruttore spento — e lì la maschera è già disattivata a monte)
  if (!_matMondo) _matMondo = patchLuci(new THREE.MeshBasicMaterial({ vertexColors: true }), true);
  return _matMondo;
}

let _matAcqua = null;
export function materialeAcqua() {
  if (!_matAcqua) {
    _matAcqua = patchAcqua(new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false,
    }));
  }
  return _matAcqua;
}

/** Materiali dei furni con texture: le stagioni li ritingono (vedi stagioni.js). */
export const materialiConMappa = new Set();

/** Converte un materiale qualsiasi (es. dai FBX) in unlit patchato, preservando mappa e colore. */
export function convertiUnlit(sorgente, geometria) {
  const mappa = sorgente && sorgente.map ? sorgente.map : null;
  if (mappa) {
    mappa.magFilter = THREE.NearestFilter;
    mappa.minFilter = THREE.NearestFilter;
    mappa.generateMipmaps = false;
    mappa.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshBasicMaterial({
    map: mappa,
    color: sorgente && sorgente.color ? sorgente.color.clone() : new THREE.Color(0xffffff),
    vertexColors: !!(geometria && geometria.attributes && geometria.attributes.color),
  });
  if (mappa) {
    m.userData.mapOriginale = mappa;
    materialiConMappa.add(m);
  }
  return patchLuci(m);
}
