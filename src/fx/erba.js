// L'ERBA — ciuffi piazzati sopra i blocchi d'erba, in UN draw call.
//
// LA PRIMA VERSIONE ERA SBAGLIATA, e il committente l'ha bocciata su cinque
// punti. Vale la pena scriverli, perché ognuno è una regola:
//
//   1. «FUORISTILE»: erano fili sottili e affusolati, da erba realistica. Qui
//      tutto è fatto di scatole e colori piatti — l'erba dev'essere RETTANGOLI
//      SPESSI, non lame.
//   2. «IL COLORE DELL'ERBA SOTTO, al variare delle altezze»: il verde era una
//      coppia di costanti. Ora ogni ciuffo prende il colore dalla PALETTE della
//      cella su cui sta (`paletteBlocco`), quindi segue la rampa per quota e le
//      stagioni senza saperne niente.
//   3. «UN OGGETTO PIAZZATO SOPRA IL BLOCCO, non sempre lo stesso»: un ciuffo è
//      un oggettino con la sua forma, e ce ne sono quattro tipi diversi scelti
//      per cella — non un tappeto di cloni.
//   4. «SPARISCE A DISTANZA»: prima il campo era un cerchio di 26 blocchi e
//      finiva lì, con un bordo visibile. Ora arriva a 80+ blocchi diradando a
//      ANELLI: vicino un ciuffo per cella, più in là uno ogni due, poi uno ogni
//      quattro. Il prato continua fino all'orizzonte senza costare di più.
//   5. «CALI DI FPS»: ed erano veri, ma non della GPU. La semina scandiva
//      migliaia di colonne IN UN FRAME SOLO ogni volta che si usciva dal
//      riquadro — una raffica di lavoro che si vedeva. Adesso si semina un
//      CHUNK PER FRAME in un buffer di scorta, e si scambia quando è pronto:
//      il vecchio prato resta visibile intanto, e nessun frame paga più di 256
//      colonne. La quota di una colonna si legge da una passata sola sui
//      blocchi del chunk, non frugando in giù cella per cella (era l'altra metà
//      del costo: `appoggioInColonna` scava fino a sessanta blocchi).
//
// L'ANIMAZIONE RESTA TUTTA NEL VERTEX SHADER: la CPU per frame scrive quattro
// uniform. Muovere ventimila ciuffi costa quanto muoverne uno.

import * as THREE from 'three';
import { paletteBlocco, coloreRampaChiaro } from '../world/stagioni.js?v=mtbytwog';
import { CHUNK } from '../world/world.js?v=mtbytwog';
import { uniformiOmbraSole, uniformiScatole, uniformiLuci, uniformiControluce, GLSL_SCATOLE_VERTICE, GLSL_LUCI_VERTICE, GBANDE } from './materials.js?v=mtbytwog';
import { glslControluce } from './controluce.js?v=mtbytwog';

// I QUATTRO TIPI DI CIUFFO: (quante lamelle, larghezza, altezza, apertura).
// Non è varietà per la varietà — un prato di cloni si legge come una texture
// ripetuta, e in un gioco di cubi si nota subito.
const TIPI = [
  { n: 5, largo: 0.15, alto: 0.32, apri: 0.42 },   // ciuffo basso e largo
  { n: 4, largo: 0.12, alto: 0.50, apri: 0.34 },   // lamelle alte
  { n: 7, largo: 0.10, alto: 0.38, apri: 0.46 },   // cespuglio fitto
  { n: 3, largo: 0.18, alto: 0.28, apri: 0.30 },   // poche lamelle larghe
];
const LAMELLE_MAX = 8;

// LE CHIAZZE. Un prato con l'erba su OGNI cella si legge come una moquette
// stesa: nell'erba vera ci sono radure, zone rade e ciuffi fitti. Due rumori
// per hash — uno largo (macchie da otto celle) e uno fine (cella per cella) —
// bastano a rompere la regolarità senza inventare una simulazione.
const CHIAZZA_LARGA = 8;

// QUANTI CHUNK GIÀ SEMINATI SI TENGONO DA PARTE. Il ring più largo è 11×11 =
// 121 chunk, e lo stesso chunk può stare in cache a due passi di diradamento
// diversi mentre lo si attraversa: 320 lascia margine senza far crescere la
// memoria (una voce media sono poche decine di KB).
const CACHE_CHUNK = 320;

/** Colonna senza niente sopra, nell'array piatto delle quote. */
const SENZA_CIMA = -32768;

// QUANTO PUÒ DURARE LA SEMINA IN UN FRAME. Mezzo millisecondo: su un telefono
// che ne ha undici per fotogramma è il 5%, e la coda si svuota comunque in poche
// decine di frame perché la maggior parte dei chunk arriva dalla cache.
// SU MOBILE META': mezzo millisecondo e' il 5% di un frame a 90 Hz, e la coda si
// svuota comunque in qualche decina di fotogrammi perche' quasi tutti i chunk
// arrivano dalla cache. Meglio seminare piu' piano che rubare tempo al frame.
const BUDGET_MS = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 0.25 : 0.5;

/** Il tipo di ciuffo di una cella. Deterministico come tutto il resto.
 *  Esportato per le prove: senza, la continuità del manto si può solo guardare. */
export function tipoDi(x, z) { return TIPI[(hash(x, z, 3) * TIPI.length) | 0]; }

/**
 * IL MANTO È UN CAMPO CONTINUO, NON UNA COSTANTE PER CELLA.
 *
 * Committente: «ok che sono zolle, ma non si deve notare troppo lo stacco tra
 * una cella di erba e l'altra, deve essere smooth la transizione». Aveva
 * ragione, e la causa era una riga sola: l'altezza della lamella veniva da
 * «tipo.alto», cioè dal tipo di ciuffo scelto PER CELLA. I quattro tipi vanno da
 * 0,28 a 0,50 — quasi il doppio — quindi due celle vicine potevano stare una a
 * mezzo blocco e l'altra a un quarto, con il salto ESATTAMENTE sul confine.
 * A prato rado non si vedeva: i ciuffi erano isolati e il confine non c'era. A
 * prato chiuso il confine c'è dappertutto, e si legge come una GRIGLIA.
 *
 * Qui il valore si interpola fra i CENTRI delle quattro celle che circondano la
 * lamella, con la curva liscia di smoothstep. I quattro tipi restano — sono
 * ancora loro a decidere quali altezze esistono — ma fra un centro e l'altro il
 * manto sale e scende invece di gradinare. Costa quattro hash PER CELLA (non
 * per lamella: i quattro vicini sono gli stessi per tutto il ciuffo) e due
 * interpolazioni per lamella.
 */
const VICINI = new Array(9);   // il 3×3 attorno alla cella, riusato: la semina è sincrona

/** Riempie VICINI col 3×3 di tipi attorno a (x,z). Indice: (dx+1)*3 + (dz+1). */
function scriviVicini(x, z) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) VICINI[(dx + 1) * 3 + (dz + 1)] = tipoDi(x + dx, z + dz);
  }
}

function fraCelle(px, pz, campo, cx, cz) {
  const gx = px - 0.5, gz = pz - 0.5;          // i centri delle celle stanno a +0.5
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const fx = gx - x0, fz = gz - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  // la lamella può sbordare dalla sua cella, quindi il quadrato dei centri che
  // la contiene è uno dei quattro del 3×3 — mai fuori.
  const i = (x0 - cx + 1) * 3 + (z0 - cz + 1);
  const a = VICINI[i][campo], b = VICINI[i + 3][campo];
  const c = VICINI[i + 1][campo], d = VICINI[i + 4][campo];
  const su = a + (b - a) * sx;
  return su + ((c + (d - c) * sx) - su) * sz;
}

/** Chiave numerica di cella, con offset per le coordinate NEGATIVE. */
function chiaveCella(x, z) { return (x + 2048) * 4096 + (z + 2048); }

/** Hash deterministico: stessa cella, stesso ciuffo, per sempre. */
function hash(x, z, s) {
  let h = (x * 374761393 + z * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const GLSL_VERTEX = /* glsl */`
  attribute vec4 iPos;      // base della lamella (xyz) e LIVELLO di diradamento (w: 0/1/2)
  attribute vec4 iDati;     // (rotazione, altezza, larghezza, fase personale)
  attribute vec3 iCol;      // colore preso dalla palette della cella sotto
  attribute vec3 iColCima;  // e quello della PUNTA: la stessa rampa, due gradini più chiara
  uniform float uTempo;
  uniform vec4 uVento;      // (dir.x, dir.z, forza di fondo, raffica)
  uniform vec4 uMobili[4];  // chi si muove: (x, y, z, raggio). w=0 = slot spento
  varying float vAlt;
  varying vec3 vCol;
  varying vec3 vColCima;
  varying float vLontano;
  varying float vSole;
  varying vec3 vLuce;
  varying float vTinta;     // sfumatura personale del ciuffo (0..1)
  uniform vec3 uCamera;
  uniform vec2 uSfuma;      // (dove comincia a spegnersi, dove è spenta)
  uniform vec3 uCentro;     // centro del campo seminato: il GIOCATORE
  uniform vec2 uBordo;      // (dove comincia il bordo del campo, dove finisce)
  uniform float uApparso;   // 0 = prato appena seminato, 1 = a regime (vedi _scambia)
  // le due fasce di congedo per LIVELLO di diradamento: (liv2 da, liv2 a, liv1 da, liv1 a)
  uniform vec4 uLiv;
  // l'ombra del sole, LE STESSE uniform del mondo (fx/materials.js)
  uniform sampler2D uCielo;
  uniform vec4 uCieloInfo;
  uniform vec3 uSoleDir;
  uniform int uSolePassi;
  uniform float uSoleForza;
  uniform float uVoxCima;
  uniform float uErbaCampo;   // 1 = somma anche l'ombra dalla heightmap

  // le sagome dei mobili (alberi in testa): dichiara uDinPos/uDinMez/uDinDiag e
  // la funzione sagomeAlSole. Vuole uSoleDir già dichiarata — è qui sopra.
${GLSL_SCATOLE_VERTICE}
  // ⚠ E LA LEGGE D'OMBRA CONDIVISA, che è la cura al «pixelloso» sotto gli
  // alberi. Fino al 27/08 l'erba prendeva l'ombra dei MOBILI da otto scatole
  // analitiche (GLSL_SCATOLE_VERTICE qui sopra): un albero diventava un CUBO, e
  // per FILO — quindi sotto una chioma il prato si riempiva di quadrati scuri.
  // Il terreno sotto intanto usava la mappa e aveva la silhouette vera: due
  // sorgenti diverse per la stessa ombra, ed è il difetto che il committente
  // vede come «per le furniture è pixellosa».
  // Adesso i mobili li chiede alla STESSA mappa del mondo: una lettura, la
  // forma vera. Le scatole restano dichiarate perché le usano le particelle.
${glslControluce()}
  // le lampade: dichiara uLuciPosRaggio/uLuciColore/uLuciNum e la funzione luciIn
${GLSL_LUCI_VERTICE}

  // L'ERBA RICEVE L'OMBRA DEL SOLE, e la chiede alla stessa heightmap che usa il
  // mondo. Ma la chiede UNA VOLTA PER LAMELLA, nel vertex shader, non per pixel:
  // un ciuffo è alto mezzo blocco e largo un dito, l'ombra al suo piede e quella
  // alla sua punta sono la stessa. Ventimila letture invece di qualche milione.
  //
  // Passi pochi (sei) e per la stessa ragione: quello che conta è che il prato
  // dentro l'ombra di una collina sia scuro come la collina, non che l'orlo sia
  // al centimetro — al centimetro non si vede, un prato illuminato dentro
  // un'ombra si vede da lontano.
  float erbaAlSole(vec3 p) {
    if (uSoleForza <= 0.0 || uSolePassi == 0 || uSoleDir.y <= 0.02) return 1.0;
    vec2 dirXZ = uSoleDir.xz;
    float lenXZ = length(dirXZ);
    if (lenXZ < 0.02) return 1.0;
    vec2 dxz = dirXZ / lenXZ;
    float salita = uSoleDir.y / lenXZ;
    // la rampa invece del salto secco: stessa cura del mondo (fx/materials.js,
    // ombraCielo), se no il prato ha il bordo d'ombra a scaletta mentre il
    // terreno sotto ce l'ha morbido, e si vede il disaccordo
    float occ = 0.0;
    for (int k = 1; k <= 6; k++) {
      // passo che cresce, come nel mondo (fx/materials.js): sei letture coprono
      // molto più terreno e il campo è continuo, quindi non si saltano colonne
      float fk = float(k) * 1.4 + 0.16 * float(k) * float(k - 1);
      if (fk > float(uSolePassi)) break;
      float y = p.y + salita * fk;
      if (y >= uVoxCima) break;
      vec2 uv = (p.xz + dxz * fk - uCieloInfo.xy) * uCieloInfo.z;
      if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) break;
      occ = max(occ, smoothstep(0.0, 0.55, texture2D(uCielo, uv).r - y));
      if (occ > 0.995) break;
    }
    return 1.0 - occ;
  }

  void main() {
    float alt = position.y;
    vAlt = alt;
    vCol = iCol;
    vColCima = iColCima;
    vTinta = fract(iDati.w * 0.2749);

    // ⚠ QUI C'ERA LA CRESCITA: la lamella nasceva a scala zero e si allungava in
    // mezzo secondo. Era una cura peggiore del male — «l'erba appare dal terreno
    // in maniera molto brutta, dovrebbe solo fadare in trasparenza smooth senza
    // animazioni strane» — perché un filo che CRESCE davanti agli occhi attira
    // l'attenzione molto più di uno che c'è e basta. Il congedo con la distanza
    // (qui sotto) è l'unico meccanismo rimasto, e non anima niente.

    // ---- IL CONGEDO CON LA DISTANZA ----------------------------------------
    // «L'erba compare di botto quando ti avvicini»: era vero, e la crescita da
    // scala zero non bastava perché il ciuffo NUOVO nasce già a colori pieni in
    // mezzo a un prato che non ne aveva nessuno.
    //
    // Qui l'ultimo tratto fa DUE cose insieme, e servono tutt'e due: la lamella
    // si accorcia fino a sparire nel manto, E il suo colore converge a quello
    // esatto del blocco sotto. Quando arriva al bordo del campo seminato è alta
    // quasi zero e indistinguibile dal terreno: che ci sia o non ci sia non lo
    // si può vedere, quindi non si vede nemmeno il momento in cui appare.
    //
    // Costa due sottrazioni per vertice. Farlo con la trasparenza costerebbe
    // l'ordinamento di ventimila quad; farlo con cartelli 2D che guardano la
    // camera costerebbe una seconda geometria e un secondo materiale — e a quel
    // punto si vedrebbe il passaggio FRA i due, che è lo stesso difetto spostato
    // di dieci metri più in là.
    // L'OMBRA È DUE COSE, e per un giro ne ho collegata una sola: il TERRENO
    // (heightmap, la collina che ti sta davanti) e le SAGOME (l'albero che ti
    // sta sopra). Gli alberi nella heightmap non ci sono — sono mobili, non
    // blocchi — quindi il prato sotto una chioma restava in pieno sole mentre il
    // terreno lì accanto era in ombra. Si prende la più scura delle due.
    // ⚠ E POI SI TAGLIA A BANDE, con la stessa costante del mondo. Fino al
    // 27/08/2026 questa riga finiva qui e vSole restava CONTINUO: l'erba aveva
    // una rampa d'ombra morbida mentre il terreno sotto aveva tre gradini
    // netti. Era la cura bocciata due volte (ammorbidire il bordo) viva e
    // pubblicata dentro il sistema che si affaccia sopra tutto — ed è metà del
    // «non corrispondenti»: sul confine dell'ombra il filo e il blocco sotto
    // stavano su due leggi diverse. Si taglia QUI, nel vertice, perché una
    // lamella è alta mezzo blocco: l'ombra al piede e quella alla punta sono la
    // stessa, e per pixel si pagherebbe la stessa cosa mille volte.
    // il TERRENO dalla heightmap come prima, i MOBILI dalla mappa condivisa.
    vec3 _p = iPos.xyz + vec3(0.0, 0.12, 0.0);
    vec3 _pl = (uControluceM * vec4(_p, 1.0)).xyz;
    // ⚠ E LA HEIGHTMAP SI USA SOLO SE SERVE. Col sistema «controluce» il
    // terreno sta già nella mappa, e sommarci la heightmap vorrebbe dire due
    // ombre dello stesso terreno con due bordi diversi — il prato più scuro del
    // blocco che ha sotto. È il «non corrispondenti» in una forma nuova.
    // Il ramo salta un ciclo di SEI letture di texture per lamella, quindi
    // spegnerlo non è solo correttezza: è anche il conto che non si paga.
    float _s = ombraDelSole(_pl, vec3(0.0, 1.0, 0.0), uSoleDir);
    if (uErbaCampo > 0.5) _s = min(_s, erbaAlSole(iPos.xyz));
    vSole = floor(_s * ${GBANDE} + 0.5) / ${GBANDE};
    // LE LAMPADE ILLUMINANO ANCHE L'ERBA. Si misura a mezza altezza del ciuffo:
    // una volta per filo, non per pixel, e la pozza di un lampione è larga metri
    // — la differenza fra la base e la punta non la vede nessuno.
    vLuce = luciIn(iPos.xyz + vec3(0.0, iDati.y * 0.5, 0.0));
    // DUE CONGEDI, E SI PRENDE IL PIU' FORTE. Servono tutti e due, e per un giro
    // ne ho messo uno solo — ecco perche' i pop-in erano ancora li'.
    //
    //  · dalla CAMERA: una lamella lontana dall'occhio e' piu' piccola di un
    //    pixel e non deve costare ne' brillare;
    //  · dal CENTRO DEL CAMPO, cioe' dal giocatore: il prato esiste solo dentro
    //    il ring seminato attorno a LUI. In vista a diorama la camera sta a
    //    sessanta blocchi e guarda terreno lontano dal giocatore: li' l'erba o
    //    c'e' o non c'e', e il confine si vedeva come un muro che si sposta
    //    mentre cammini. Adesso quel confine e' gia' a zero prima di arrivarci.
    float viaCam = clamp((distance(iPos.xz, uCamera.xz) - uSfuma.x)
                     / max(uSfuma.y - uSfuma.x, 0.001), 0.0, 1.0);
    float dalPg = distance(iPos.xz, uCentro.xz);
    float viaBordo = clamp((dalPg - uBordo.x)
                     / max(uBordo.y - uBordo.x, 0.001), 0.0, 1.0);
    // ---- IL DIRADAMENTO, CHE ERA IL POP-IN VERO ------------------------------
    //
    // Il prato si dirada a CLASSI DI CHUNK: passo 1 fino a un chunk di distanza,
    // 2 fino a tre, 4 oltre. Attraversando un confine un chunk cambia classe e
    // viene riseminato con un quarto (o un sedicesimo) delle lamelle: sedici per
    // sedici blocchi che perdono tre quarti dell'erba IN UN FOTOGRAMMA. E succede
    // a una ventina di blocchi dal giocatore, cioè dove il prato è ancora a
    // colore pieno: nessuna delle dissolvenze che avevo messo lo copriva, perché
    // tutte e due misurano la LONTANANZA e lì siamo vicini. Era questo che si
    // vedeva camminando, e avevo guardato dappertutto tranne che qui.
    //
    // Adesso ogni lamella sa a quale livello di diradamento appartiene (iPos.w,
    // lo slot dell'istante di nascita, libero da quando la nascita non si anima
    // più) e si congeda DA SOLA prima che tocchi al chunk. Le soglie non sono a
    // occhio: un chunk può cambiare classe solo quando dista almeno un chunk
    // pieno, quindi una lamella che sparirà al passaggio 1→2 sta comunque a
    // TRENTADUE blocchi o più — spegnerla entro trentadue la rende invisibile PRIMA
    // che il diradamento la tolga. Stesso conto per 2→4 a sessantaquattro.
    float v2 = clamp((dalPg - uLiv.x) / max(uLiv.y - uLiv.x, 0.001), 0.0, 1.0);
    float v1 = clamp((dalPg - uLiv.z) / max(uLiv.w - uLiv.z, 0.001), 0.0, 1.0);
    float viaLiv = step(0.5, iPos.w) * mix(v1, v2, step(1.5, iPos.w));
    // ⚠ E LA COMPARSA DEL CAMPO ENTRA DA QUI, non da una dissolvenza sua. Il
    // prato nasce TUTTO INSIEME — la semina riempie un buffer di scorta e lo
    // scambia in un fotogramma — e a mondo nuovo si vedeva duecentomila fili
    // materializzarsi in un frame («si notano troppo durante la generazione»).
    // Riusare «vLontano» vuol dire riusare l'unica cura già approvata: il filo
    // sta al colore ESATTO del blocco sotto e ci si stacca in mezzo secondo.
    // Niente scale che crescono, niente trasparenza da ordinare.
    vLontano = max(max(max(viaCam, viaBordo), viaLiv), 1.0 - uApparso);
    // ---- IL CONGEDO, STOCASTICO ---------------------------------------------
    // La lamella si accorcia (per fondersi nel manto) E, oltre la sua soglia
    // personale, sparisce del tutto. La soglia viene da iDati.w, che è la fase
    // casuale del ciuffo: due fili vicini se ne vanno in momenti diversi, quindi
    // il prato si dirada invece di finire contro un muro. Un filo solo che
    // scompare in mezzo a ventimila non lo vede nessuno; una fila intera sì.
    // ⚠ E L'ACCORCIAMENTO NON C'È PIÙ. Era «1 − vLontano²·0.82», cioè la lamella
    // rientrava nel terreno mentre ti allontanavi: la stessa «animazione strana»
    // che il committente ha bocciato quando nasceva, vista al contrario. Adesso
    // il filo resta ALTO finché esiste, e a occuparsi del congedo è solo il
    // colore — che nel fragment arriva al colore esatto del blocco PRIMA della
    // morte più vicina (0.55). Quando la lamella sparisce è già indistinguibile
    // dal terreno su cui sta: togliere qualcosa che non si vede non si vede.
    float soglia = fract(iDati.w * 0.1591549);
    float vivo = step(vLontano, 0.55 + soglia * 0.45);
    float eta = vivo;

    // RETTANGOLO, non lama: la larghezza si stringe appena in cima (0.82), non
    // fino a una punta. È la differenza fra un filo d'erba e una scheggia, ed è
    // la correzione di stile che serviva.
    float largo = iDati.z * (1.0 - alt * 0.18);
    float c = cos(iDati.x), s = sin(iDati.x);
    vec3 p = vec3(position.x * largo * c, alt * iDati.y * eta, position.x * largo * s);

    // ---- IL VENTO ------------------------------------------------------------
    // (1) la RAFFICA: un'onda che attraversa il campo. La fase dipende dalla
    // POSIZIONE oltre che dal tempo, quindi il prato si piega a ondate invece
    // che tutto insieme — è la cosa che si nota di più, e costa un seno.
    float onda = sin(uTempo * 1.15 + dot(iPos.xz, uVento.xy) * 0.30 + iDati.w);
    // (2) una seconda onda più corta e sfasata: due sole, e la raffica smette
    // di avere un ritmo riconoscibile
    float onda2 = sin(uTempo * 2.3 - dot(iPos.xz, uVento.xy) * 0.11 + iDati.w * 1.7);
    // (3) il TREMOLIO: piccolo, veloce, diverso per ciuffo
    float tremo = sin(uTempo * 4.1 + iDati.w * 6.3) * 0.18;
    float piega = (uVento.z + uVento.w * (onda * 0.75 + onda2 * 0.35) + tremo) * 0.22;

    // ---- IL GIOCATORE CHE PASSA ---------------------------------------------
    // I ciuffi si aprono al suo passaggio e si richiudono da soli: niente stato
    // da tenere, è tutta geometria.
    // CHIUNQUE SI MUOVA, non solo il giocatore: gatti in rete, palle, creature.
    // La spinta è PICCOLA e cresce piano — la prima versione spostava la lamella
    // di un blocco e mezzo, cioè tre volte la sua altezza, e il ciuffo si
    // strappava di lato invece di piegarsi. Era «tutta distorta», ed era vero.
    // ⚠ DUE CENTIMETRI SOTTO IL PELO DEL BLOCCO, e non è pignoleria: con la base
    // ESATTAMENTE a quota iPos.y il quad della lamella e la faccia superiore del
    // blocco sono COMPLANARI, e due superfici complanari in z-buffer litigano —
    // è la «lineetta nera/bianca» che compare e sparisce alla base dei ciuffi
    // muovendo la camera. L'affondamento sta qui e non nel dato perché iPos.y è
    // la quota VERA del ciuffo: la usano l'ombra, le lampade e i test.
    vec3 base = iPos.xyz - vec3(0.0, 0.02, 0.0);
    vec2 spostaMob = vec2(0.0);
    for (int i = 0; i < 4; i++) {
      float r = uMobili[i].w;
      if (r <= 0.0) continue;
      vec2 d = base.xz - uMobili[i].xz;
      float dd = dot(d, d);
      if (dd >= r * r || abs(base.y - uMobili[i].y) > 1.6) continue;
      float t = 1.0 - sqrt(dd) / r;               // lineare: il bordo non salta
      spostaMob += normalize(d + vec2(1e-4)) * t * t * 0.45;
    }

    // LA PIEGA CRESCE COL QUADRATO DELL'ALTEZZA: la base resta piantata e la
    // cima fa tutto il movimento, che è come si piega un ciuffo vero.
    float k = alt * alt;
    vec2 dir = uVento.xy * piega + spostaMob;
    p.x += dir.x * k;
    p.z += dir.y * k;
    p.y -= dot(dir, dir) * k * 0.30;      // piegandosi si accorcia

    gl_Position = projectionMatrix * modelViewMatrix * vec4(base + p, 1.0);
  }
`;

const GLSL_FRAGMENT = /* glsl */`
  varying float vAlt;
  varying vec3 vCol;
  varying vec3 vColCima;
  varying float vLontano;
  varying float vSole;
  varying vec3 vLuce;          // quanto ci arriva dalle lampade (per filo)
  varying float vTinta;
  uniform vec3 uAmbienteErba;
  uniform vec3 uOmbraFatt;     // di che colore scurisce l'ombra del cielo

  void main() {
    // LA BASE È ESATTAMENTE IL COLORE DEL BLOCCO SOTTO, e da lì si SCHIARISCE
    // salendo. Prima la base era più scura del blocco (0.82) e l'attacco fra
    // erba e terreno si vedeva come una riga d'ombra: il ciuffo sembrava
    // appoggiato sopra invece che cresciuto lì. A quota zero adesso i due colori
    // coincidono al bit, e il passaggio non esiste proprio.
    //
    // LA SCHIARITA STA IN CIMA, non su tutta la lamella, e questo è il rilievo
    // del committente («a risoluzioni basse la sfumatura deve funzionare, se no
    // esce molto brutto»). Con una rampa quadratica metà della lamella era già
    // più chiara del blocco: a schermo pieno si legge come sfumatura, ma quando
    // la lamella è larga due pixel di quella sfumatura si vede solo la parte
    // chiara — e il prato diventa una macchia pallida sopra un terreno scuro.
    // Con la cubica la schiarita vive nell'ultimo terzo: il colore MEDIO della
    // lamella resta quello del blocco a qualsiasi risoluzione.
    // ⚠ LA PUNTA È UN COLORE DELLA RAMPA, NON UN VERDE MOLTIPLICATO. Per mesi
    // qui c'era «vCol · 1.70 + 0.06»: un colore inventato, quasi il doppio del
    // terreno e con un fondo additivo. Da vicino passava per sfumatura; da
    // lontano no, e il committente l'ha detto esatto — «a distanza sembra quasi
    // emissiva e non va bene, si nota troppo durante la generazione». Aveva
    // ragione: un prato più chiaro del 70% del terreno su cui sta È una luce.
    //
    // Adesso la punta è «coloreRampaChiaro(tipo, y, 2)», cioè il verde che la
    // rampa stagionale userebbe DUE GRADINI più in alto — la stessa scala di
    // tonalità con cui le terrazze si distinguono fra loro («gli strati di erba
    // cambiano leggermente tonalità a seconda dell'altezza»). Quindi la
    // sfumatura è LEGGERA per costruzione, e in inverno o in autunno si sposta
    // da sola invece di restare un verde schiarito a caso.
    //
    // La base resta il colore ESATTO del blocco, e questo non si tocca: «voglio
    // che l'erba abbia alla base il colore del blocco sotto, è voluto che si
    // confonda un pochino, tanto c'è la sfumatura che dopo aiuta a distinguere».
    //
    // L'esponente sta a 1.4 e non più a 1.6: con due gradini di rampa la
    // differenza è piccola, e tenerla tutta nell'ultimo quinto la rendeva
    // invisibile. Il colore MEDIO della lamella resta comunque dalla parte del
    // blocco, che era il motivo per cui l'esponente esiste (a due pixel di
    // larghezza si vede solo la media).
    vec3 col = mix(vCol, vColCima, pow(vAlt, 1.4));
    // e ogni ciuffo ha la SUA sfumatura: un prato di fili identici si legge come
    // una texture ripetuta, che è il difetto numero uno di questo effetto.
    // ⚠ PIÙ STRETTA DI PRIMA (±6% → ±4%): con il prato fitto le lamelle per
    // pixel sono tante, e una variazione larga si legge come RUMORE che
    // brulica invece che come varietà. È l'altra metà del «sembra emissiva».
    col *= 0.96 + vTinta * 0.085;
    // e in lontananza si torna al colore esatto del blocco: vedi il vertex.
    // ⚠ LA CURVA È FINITA A 0.50, non a 1.0, e il numero non è arbitrario: la
    // lamella che muore prima se ne va a 0.55 (vedi il vertex), quindi a quel
    // punto DEVE già essere il colore del blocco. Con la curva stesa fino a 1.0
    // i fili morivano mentre erano ancora più chiari del terreno — ed è quello
    // che si vedeva come pop-in: non «l'erba che cresce», l'erba che sparisce
    // essendo ancora visibile.
    col = mix(col, vCol, smoothstep(0.0, 0.50, vLontano));
    // l'ombra del sole, con LO STESSO colore con cui scurisce il mondo: se qui
    // si usasse un grigio qualunque, l'erba dentro l'ombra sarebbe di una tinta
    // e il blocco sotto di un'altra — e il difetto si vede proprio sul confine
    // e le LAMPADE si sommano all'ambiente, esattamente come nel mondo: senza,
    // di notte dentro la pozza di un lampione il terreno era arancione e l'erba
    // che ci cresce sopra restava blu notte
    vec3 amb = uAmbienteErba * mix(uOmbraFatt, vec3(1.0), vSole) + vLuce;
    gl_FragColor = vec4(col * amb, 1.0);
    // ⚠ LA CURVA sRGB LA FA IL MATERIALE, non una passata in fondo. three
    // definisce linearToOutputTexel nel prologo di OGNI programma, anche dei
    // ShaderMaterial scritti a mano, e la fa diventare l'identita' quando si
    // disegna dentro un render target lineare: cioe' questa riga fa la cosa
    // giusta in tutt'e due i casi, da sola.
    //
    // E' la correzione di una correzione. Il bug era vero — erba, foglie,
    // nuvole, pioggia e cielo cambiavano colore a seconda che il frame passasse
    // o no dal composer — ma la cura era sproporzionata: avevo messo una
    // passata a schermo intero OBBLIGATORIA per tutti, e su una GPU a tile
    // (telefoni) quella e' una scrittura e una rilettura dell'intero schermo in
    // piu' a ogni fotogramma. Una riga per materiale costa zero e risolve
    // uguale.
    #include <colorspace_fragment>
  }
`;

// ANELLI DI DIRADAMENTO, in chunk di distanza: quanto spesso si semina una
// cella. Vicino tutte, poi una ogni due, poi una ogni quattro. È così che il
// prato arriva all'orizzonte senza che il conto delle lamelle esploda.
// ⚠ ERANO 1 / 3, e il congedo per livello cadeva TROPPO VICINO — a sedici
// blocchi il prato perdeva quindici lamelle su sedici, e siccome il congedo le
// porta al colore piatto del blocco prima di toglierle, attorno al giocatore si
// vedeva sia il diradamento sia la perdita della sfumatura. Le soglie non le
// posso spostare da sole: sono legate al punto in cui un chunk cambia classe,
// che è il minimo a cui il diradamento può togliere qualcosa. Quindi si allarga
// la classe: passo pieno fino a DUE chunk (confine a 32 blocchi) e passo 2 fino
// a QUATTRO (confine a 64). Costa più lamelle nell'anello vicino — che è quello
// che si guarda — e il tetto di `max` taglia comunque le più lontane, che sono
// già in dissolvenza.
function passoPerDistanza(dc) {
  if (dc <= 2) return 1;
  if (dc <= 4) return 2;
  return 4;
}

export class Erba {
  /**
   * @param opzioni.raggioChunk quanti chunk attorno al giocatore (5 ≈ 80 blocchi)
   * @param opzioni.densita moltiplicatore di lamelle (la scala di qualità lo muove)
   */
  constructor(scena, { raggioChunk = 5, densita = 1, max = 30000 } = {}) {
    this.raggioChunk = raggioChunk;
    this.densita = densita;
    this.max = max;
    this.attiva = true;
    this._t = 0;
    this._ccx = 1e9; this._ccz = 1e9;
    this._coda = [];          // chunk da seminare, in ordine di distanza
    this._n = 0;              // lamelle scritte nel buffer di scorta
    this._quote = new Map();  // riuso fra i chunk della stessa passata
    this._cache = new Map();  // chunk già seminati: vedi _seminaChunk
    // ---- I CIUFFI MESSI A MANO ----------------------------------------------
    // ⚠ IL FURNI «Ciuffo d'erba» NON HA UN MODELLO SUO. La prima versione era un
    // ventaglio di scatoline costruito a parte, e il committente l'ha bocciata
    // subito: due sistemi che disegnano la stessa cosa non restano d'accordo, e
    // quello fatto a mano era il peggiore dei due. Adesso il furni registra la
    // sua cella qui e a disegnarla e' questo sistema — stesse lamelle, stesso
    // vento, stessa ombra del sole, stesse luci, stesso congedo con la distanza.
    this._posati = new Map();  // chiave(x,z) → { y }
    this._verPosati = 0;

    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    // DUE BUFFER: si semina in quello di SCORTA e si scambia a lavoro finito.
    // Senza, durante la semina progressiva si vedrebbe il prato costruirsi
    // pezzo per pezzo — che è peggio del salto che si voleva togliere.
    this.iPos = new Float32Array(max * 4);
    this.iDati = new Float32Array(max * 4);
    this.iCol = new Float32Array(max * 3);
    this.iColCima = new Float32Array(max * 3);
    this.sPos = new Float32Array(max * 4);
    this.sDati = new Float32Array(max * 4);
    this.sCol = new Float32Array(max * 3);
    this.sColCima = new Float32Array(max * 3);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.iPos, 4));
    g.setAttribute('iDati', new THREE.InstancedBufferAttribute(this.iDati, 4));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.iCol, 3));
    g.setAttribute('iColCima', new THREE.InstancedBufferAttribute(this.iColCima, 3));
    g.instanceCount = 0;
    // i ciuffi si spostano nel vertex shader: il culling automatico li farebbe
    // sparire a blocchi guardando di lato
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

    this.materiale = new THREE.ShaderMaterial({
      vertexShader: GLSL_VERTEX,
      fragmentShader: GLSL_FRAGMENT,
      side: THREE.DoubleSide,
      uniforms: {
        uTempo: { value: 0 },
        uVento: { value: new THREE.Vector4(1, 0, 0.22, 0.35) },
        uMobili: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
        uAmbienteErba: { value: new THREE.Color(1, 1, 1) },
        uCamera: { value: new THREE.Vector3() },
        uSfuma: { value: new THREE.Vector2(30, 52) },
        uCentro: { value: new THREE.Vector3() },
        uBordo: { value: new THREE.Vector2(40, 64) },
        uLiv: { value: new THREE.Vector4(22, 32, 48, 64) },
        uApparso: { value: 1 },
        // per RIFERIMENTO: restano agganciate al ciclo del giorno da sole
        ...uniformiOmbraSole(),
        ...uniformiScatole(),
        ...uniformiControluce(),
        ...uniformiLuci(),
      },
    });
    this.mesh = new THREE.Mesh(g, this.materiale);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scena.add(this.mesh);

    this._apparso = 1;        // vedi _scambia: 0 = campo appena nato, si stacca dal terreno
    this.forzaMeteo = 0;      // 0 sereno, 1 rovescio: la muove main
    this._forza = 0;
    this.fili = 0;
  }

  /**
   * LE QUOTE DI UN CHUNK IN UNA PASSATA SOLA. `appoggioInColonna` frugherebbe
   * in giù fino a sessanta celle PER COLONNA: su 256 colonne sono quindicimila
   * ricerche, ed era metà del calo di frame. Qui si scorrono i blocchi che il
   * chunk ha davvero — che sono quelli e basta — tenendo il più alto di ognuna.
   */
  _quoteChunk(mondo, kc) {
    // UN ARRAY PIATTO, NON UNA MAPPA. Un chunk ha 256 colonne e basta: indicizzarle
    // per posizione locale costa un moltiplicatore, mentre la Map costava una
    // chiave impacchettata + un hash + un oggetto {y,tipo} PER BLOCCO — e i
    // blocchi di un chunk sono migliaia. Sparisce anche l'offset +2048 con cui
    // si impacchettavano le coordinate negative: era il posto dove i ciuffi
    // finivano a mezz'aria dall'altra parte del mondo, e ora non esiste più.
    const N = CHUNK * CHUNK;
    if (!this._qy) { this._qy = new Int16Array(N); this._qt = new Array(N); }
    const qy = this._qy, qt = this._qt;
    qy.fill(SENZA_CIMA);
    const virgola = kc.indexOf(',');
    const ox = +kc.slice(0, virgola) * CHUNK, oz = +kc.slice(virgola + 1) * CHUNK;
    for (const b of mondo.blocchiDelChunk(kc)) {
      const i = (b.x - ox) * CHUNK + (b.z - oz);
      if (i < 0 || i >= N) continue;
      if (b.y > qy[i]) { qy[i] = b.y; qt[i] = b.tipo; }
    }
    return { qy, qt, ox, oz };
  }

  /**
   * IL CHUNK GIÀ SEMINATO NON SI RISEMINA. È la cura del difetto peggiore di
   * questo sistema, ed era invisibile finché non si è misurato: attraversando un
   * confine di chunk — cioè ogni sedici passi — `_apriCoda` buttava via TUTTO e
   * rifaceva da capo tutti gli 81 chunk del ring. Misurato camminando sul mondo
   * aperto: picchi da 3,5 ms sull'erba e 2,1 sulle foglie, con mediana ZERO. Su
   * un telefono cinque volte più lento sono i trenta millisecondi che il
   * committente vedeva come scatto.
   *
   * Dei 81 chunk, attraversando un confine ne cambiano una ventina: gli altri
   * sessanta hanno lo stesso contenuto di un attimo prima. Qui si tengono le
   * lamelle già calcolate e si ricopiano — una memcpy invece di rifare hash,
   * palette e quote.
   *
   * LA CHIAVE PORTA DENTRO LA REVISIONE DEL CHUNK (mondo.revisione), quindi
   * scavare una cella rende irraggiungibile la voce vecchia: la cache non ha
   * bisogno di essere svuotata da nessuno, si invalida da sola. E porta dentro
   * anche il PASSO di diradamento, perché lo stesso chunk visto da lontano ha
   * meno ciuffi di quando lo si ha addosso.
   *
   * EFFETTO COLLATERALE CHE VALE DA SOLO: l'istante di nascita viaggia con la
   * lamella. Prima ogni riseminata rimetteva `nascita = adesso` su TUTTO il
   * prato, cioè ogni sedici passi l'intero campo ricresceva da scala zero sotto
   * gli occhi. Adesso ricresce solo l'erba davvero nuova.
   *
   * @returns quante lamelle ha scritto nel buffer di scorta
   */
  _seminaChunk(mondo, kc, dc) {
    const passo = passoPerDistanza(dc);
    // ⚠ LA DENSITÀ STA NELLA CHIAVE. Decide quante lamelle per ciuffo E quante
    // celle restano scoperte: un chunk seminato a densità 1 non vale a densità 8,
    // e senza questo pezzo la scala di qualità lasciava in giro il prato vecchio.
    const ck = kc + '|' + passo + '|' + this.densita + '|' + this._verPosati + '|' + (mondo.revisione ? mondo.revisione(kc) : 0);
    const pronto = this._cache.get(ck);
    if (pronto) {
      if (this._n + pronto.n > this.max) return 0;
      this.sPos.set(pronto.pos, this._n * 4);
      this.sDati.set(pronto.dati, this._n * 4);
      this.sCol.set(pronto.col, this._n * 3);
      this.sColCima.set(pronto.colCima, this._n * 3);
      this._n += pronto.n;
      return pronto.n;
    }
    const i0 = this._n;
    const scritte = this._seminaVero(mondo, kc, passo);
    this._ricorda(ck, i0, scritte);
    return scritte;
  }

  /** Mette da parte le lamelle appena seminate. La cache è a coda: le voci più
   *  vecchie sono quelle dei chunk che ci si è lasciati alle spalle. */
  _ricorda(ck, i0, n) {
    if (n <= 0) return;
    this._cache.set(ck, {
      n,
      pos: this.sPos.slice(i0 * 4, (i0 + n) * 4),
      dati: this.sDati.slice(i0 * 4, (i0 + n) * 4),
      col: this.sCol.slice(i0 * 3, (i0 + n) * 3),
      colCima: this.sColCima.slice(i0 * 3, (i0 + n) * 3),
    });
    while (this._cache.size > CACHE_CHUNK) {
      this._cache.delete(this._cache.keys().next().value);
    }
  }

  _seminaVero(mondo, kc, passo) {
    const { qy, qt, ox, oz } = this._quoteChunk(mondo, kc);
    const { sPos, sDati, sCol, sColCima } = this;
    let n = this._n;
    const col = new THREE.Color(), colCima = new THREE.Color();
    // QUANTO SI CHIUDE IL PRATO. Vedi le chiazze più sotto: a densità 1 vale 0 e
    // il prato è quello di sempre, da 4 in su vale 1 e nessuna cella d'erba
    // resta scoperta. Sta qui e non nel ciclo perché dipende solo dalla densità.
    const copertura = Math.min(1, Math.max(0, (this.densita - 1) / 3));
    for (let i = 0; i < qy.length; i++) {
      if (n >= this.max - LAMELLE_MAX) break;
      const x = ox + ((i / CHUNK) | 0), z = oz + (i % CHUNK);
      const posato = this._posati.get(chiaveCella(x, z));
      let cima;
      if (posato) {
        // MESSO A MANO: sta dove l'hanno messo, su qualunque blocco e senza
        // passare per radure e diradamento — chi lo posa vuole vederlo lì.
        cima = { y: posato.y - 1, tipo: 'erba' };
      } else {
        if (qy[i] === SENZA_CIMA || qt[i] !== 'erba') continue;
        cima = { y: qy[i], tipo: qt[i] };
        // il diradamento è per POSIZIONE, non a caso: allontanandosi il prato si
        // dirada sempre negli stessi punti e non «brulica» mentre cammini
        if (passo > 1 && ((x % passo) + passo) % passo !== 0) continue;
        if (passo > 1 && ((z % passo) + passo) % passo !== 0) continue;

        // LE CHIAZZE: una macchia larga decide le radure, un rumore fine dirada
        // dentro la macchia. Senza, il prato è una moquette stesa uguale ovunque.
        //
        // ⚠ SALENDO DI DENSITÀ SI CHIUDONO, non si infittiscono i ciuffi che
        // sopravvivono. È il punto che avevo sbagliato: «più erba» non vuol dire
        // ciuffi più fitti dentro le stesse radure, vuol dire che le radure
        // spariscono e il verde copre il blocco. `copertura` è quanto si è
        // chiuso il prato: 0 a densità 1 (prato di sempre, non cambia un pixel),
        // 1 da densità 4 in su (nessuna cella d'erba resta scoperta).
        const macchia = hash(Math.floor(x / CHIAZZA_LARGA), Math.floor(z / CHIAZZA_LARGA), 91);
        if (macchia < 0.16 * (1 - copertura)) continue;   // radura
        const fitto = 0.55 + 0.45 * macchia;              // quanto è fitta QUESTA macchia
        if (hash(x, z, 57) > fitto + (1 - fitto) * copertura) continue;
      }
      const tipo = tipoDi(x, z);
      scriviVicini(x, z);       // il 3×3 che serve al campo continuo, una volta per cella
      // ⚠ E ANCHE IL NUMERO DI LAMELLE SI AMMORBIDISCE. I tipi vanno da 3 a 7
      // lamelle: a densità 8 sono 24 contro 56 nella cella accanto, cioè più del
      // doppio di roba a un blocco di distanza — l'altra metà della griglia che
      // si vedeva. La media coi quattro vicini in croce (la cella pesa doppio, se
      // no il tipo non conta più niente) dimezza il salto senza appiattire il
      // prato.
      const nMedio = (tipo.n * 2 + VICINI[1].n + VICINI[3].n + VICINI[5].n + VICINI[7].n) / 6;
      const quante = Math.max(1, Math.round(nMedio * this.densita));
      // IL COLORE DEL BLOCCO SOTTO: paletteBlocco conosce la rampa per quota e
      // la stagione, quindi il ciuffo è intonato senza saperne niente
      const p = paletteBlocco(cima.tipo, cima.y);
      col.setHex(p.cima);
      // LA PUNTA: la stessa rampa stagionale, due gradini più chiara. Non un
      // verde moltiplicato — vedi il fragment shader, era quello che si vedeva
      // «quasi emissivo» a distanza.
      colCima.setHex(coloreRampaChiaro(cima.tipo, cima.y, 2));
      const y = cima.y + 1;
      // 0 = c'e' a qualunque passo, 1 = sparisce a passo 4, 2 = solo a passo 1.
      // I ciuffi POSATI a mano sono sempre 0: chi li mette vuole vederli sempre.
      const mx4 = ((x % 4) + 4) % 4, mz4 = ((z % 4) + 4) % 4;
      const mx2 = ((x % 2) + 2) % 2, mz2 = ((z % 2) + 2) % 2;
      const liv = posato ? 0 : ((mx4 === 0 && mz4 === 0) ? 0 : ((mx2 === 0 && mz2 === 0) ? 1 : 2));
      for (let i = 0; i < quante; i++) {
        const h1 = hash(x, z, i * 17 + 5), h2 = hash(x, z, i * 17 + 11), h3 = hash(x, z, i * 17 + 23);
        const j = n * 4, d = n * 4;
        // IL JITTER RIEMPIE LA CELLA. Con i ciuffi al centro si vedeva la
        // GRIGLIA — file regolari a un blocco di passo, che in un mondo di cubi
        // è la cosa che si nota per prima. Qui la lamella può stare ovunque
        // nella cella, e il reticolo sparisce.
        // ⚠ E LA DISPERSIONE ARRIVA AL BORDO. Era 0,42+apri, cioè mezza
        // larghezza fra 0,36 e 0,44: le lamelle si fermavano PRIMA del confine
        // della cella, e restava una riga più rada ogni blocco — cioè un
        // reticolo di righe rade, che è metà dello «stacco fra una cella e
        // l'altra». Adesso arrivano a 0,49 dal centro, cioè al confine.
        //
        // ⚠ MA NON OLTRE. Sbordare sembrava più naturale (l'erba vera pende dal
        // ciglio) e invece è un bug: la lamella nasce alla quota della SUA cella,
        // quindi una che sborda su una cella più bassa, sull'acqua o sul vuoto
        // resta appesa in aria. `test/sagome-ombra.test.mjs` lo ha beccato in
        // -9,21 al primo giro. Il tetto a 0,98 tiene il centro dentro la cella.
        const disp = Math.min(0.98, 0.66 + tipo.apri);
        const px = x + 0.5 + (h1 - 0.5) * disp;
        const pz = z + 0.5 + (h2 - 0.5) * disp;
        sPos[j] = px;
sPos[j + 1] = y;
        sPos[j + 2] = pz;
        // IL LIVELLO DI DIRADAMENTO, e non l'istante di nascita: la nascita non
        // si anima piu' (il committente l'aveva bocciata) e quello slot serviva
        // a questo. E' posizionale come il diradamento stesso — una cella che
        // sopravvive a passo 4 sopravvive anche a 2 e a 1 — quindi la cache dei
        // chunk resta valida senza toccarla.
        sPos[j + 3] = liv;
        sDati[d] = h3 * Math.PI;
        sDati[d + 1] = fraCelle(px, pz, 'alto', x, z) * (0.8 + 0.45 * h1);
        sDati[d + 2] = fraCelle(px, pz, 'largo', x, z) * (0.85 + 0.3 * h2);
        sDati[d + 3] = (h1 + h3) * 6.283;
        // ogni lamella un filo più chiara o più scura: senza, un ciuffo è una
        // macchia piatta
        const v = 0.94 + 0.12 * h2;
        const jc = n * 3;
        sCol[jc] = col.r * v; sCol[jc + 1] = col.g * v; sCol[jc + 2] = col.b * v;
        sColCima[jc] = colCima.r * v; sColCima[jc + 1] = colCima.g * v; sColCima[jc + 2] = colCima.b * v;
        n++;
      }
    }
    const scritte = n - this._n;
    this._n = n;
    return scritte;
  }

  /** Prepara la coda dei chunk attorno al giocatore, dal più vicino. */
  _apriCoda(ccx, ccz) {
    const r = this.raggioChunk;
    this._coda.length = 0;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dc = Math.max(Math.abs(dx), Math.abs(dz));
        if (dc > r) continue;
        this._coda.push({ kc: (ccx + dx) + ',' + (ccz + dz), dc });
      }
    }
    this._coda.sort((a, b) => a.dc - b.dc);
    this._n = 0;
  }

  /**
   * IL BUFFER DI SCORTA DIVENTA QUELLO VIVO.
   *
   * ⚠ E SI CARICA SOLO LA PARTE USATA. Senza `addUpdateRange` three fa un
   * `bufferSubData` dell'INTERO array — cioè del tetto, non delle lamelle
   * scritte. Col tetto a 900 000 volevano dire 14,4 MB per iPos, altrettanti
   * per iDati e 10,8 per ciascun colore: una cinquantina di megabyte spediti
   * alla GPU ogni volta che si attraversa il confine di un chunk, per duecento
   * mila lamelle che ne occupano un quinto. Era una parte grossa del «si
   * notano durante la generazione»: non l'erba che appare, il fotogramma che
   * si ferma mentre appare.
   *
   * Le liste di intervalli si azzerano PRIMA di aggiungere: si accumulano, e
   * un intervallo vecchio più largo rimetterebbe in piedi il carico intero.
   */
  _scambia() {
    const n = this._n;
    this.iPos.set(this.sPos.subarray(0, n * 4));
    this.iDati.set(this.sDati.subarray(0, n * 4));
    this.iCol.set(this.sCol.subarray(0, n * 3));
    this.iColCima.set(this.sColCima.subarray(0, n * 3));
    const g = this.mesh.geometry;
    g.instanceCount = n;
    for (const [nome, comp] of [['iPos', 4], ['iDati', 4], ['iCol', 3], ['iColCima', 3]]) {
      const a = g.getAttribute(nome);
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * comp);
      a.needsUpdate = true;
    }
    // LA COMPARSA. Il campo che nasce da zero (mondo nuovo, erba riaccesa, primo
    // avvio) si stacca dal terreno in mezzo secondo invece di apparire in un
    // fotogramma; una riseminata normale — quella di quando cammini — non la
    // fa partire, perché lì il prato c'era già e i fili vicini sono identici.
    if (this.fili === 0 && n > 0) this._apparso = 0;
    this.fili = n;
  }

  /**
   * Da chiamare nel loop. La CPU qui fa cinque cose: avanza l'orologio, muove
   * il vento, copia la posizione del giocatore, e — se serve — semina AL PIÙ
   * due chunk. Tutto il resto lo fa la GPU.
   */
  aggiorna(dt, mondo, pos, ambiente, occhio) {
    if (!this.attiva) return;
    this._t += dt;
    const u = this.materiale.uniforms;
    u.uTempo.value = this._t;
    // la comparsa del campo: mezzo secondo dal colore del blocco a quello pieno
    if (this._apparso < 1) this._apparso = Math.min(1, this._apparso + dt * 2);
    u.uApparso.value = this._apparso;

    // IL VENTO SEGUE IL METEO, ed è la richiesta: con il rovescio si devono
    // VEDERE le raffiche. La forza insegue invece di saltare (il temporale
    // arriva, non scatta) e la direzione gira piano.
    this._forza += (this.forzaMeteo - this._forza) * Math.min(1, dt * 0.5);
    const a = this._t * 0.045;
    const fondo = 0.18 + 0.55 * this._forza;
    const raffica = 0.30 + 0.75 * this._forza;
    u.uVento.value.set(Math.cos(a), Math.sin(a), fondo, raffica);
    // il giocatore è sempre il primo; gli altri li mette main (gatti, palle)
    // ⚠ IL RAGGIO ERA TROPPO LARGO, e il committente l'ha descritto esatto: «è
    // strano passare a un blocco di distanza e vedere le foglie muoversi». Il
    // gatto è largo poco più di mezzo blocco: un raggio di 1.1 blocchi voleva dire
    // spostare la vegetazione che sta a mezzo blocco di distanza dal suo fianco, cioè
    // toccarla senza toccarla. Adesso il bordo dell'influenza sta appena fuori
    // dal corpo: si muove quello che il gatto sfiora davvero.
    u.uMobili.value[0].set(pos.x, pos.y, pos.z, 0.60);
    if (ambiente) u.uAmbienteErba.value.copy(ambiente);
    // IL CONGEDO SI MISURA DALLA CAMERA, non dal giocatore. L'avevo scritto al
    // contrario e a schermo il prato spariva del tutto: in vista a diorama la
    // camera sta a sessanta blocchi e guarda terreno lontano DAL GIOCATORE, che
    // con la misura sbagliata risultava tutto oltre la soglia. Quello che conta
    // e' quanto e' lontano dall'OCCHIO, perche' e' li' che una lamella diventa
    // piu' piccola di un pixel.
    u.uCamera.value.copy(occhio || pos);
    u.uCentro.value.copy(pos);
    // IL BORDO DEL CAMPO. Il ring seminato e' un QUADRATO di chunk attorno al
    // giocatore: il cerchio inscritto ha raggio raggioChunk·CHUNK, ed e' li' che
    // il prato finisce di sicuro in tutte le direzioni. Si spegne prima di
    // arrivarci, se no si vede il muro.
    const bordo = this.raggioChunk * CHUNK;
    u.uBordo.value.set(bordo * 0.55, bordo * 0.92);
    // e dalla camera: piu' corto, perche' qui il motivo e' la dimensione a
    // schermo e non l'esistenza
    u.uSfuma.value.set(bordo * 0.62, bordo * 0.98);

    const ccx = Math.floor(pos.x / CHUNK), ccz = Math.floor(pos.z / CHUNK);
    if (ccx !== this._ccx || ccz !== this._ccz) {
      this._ccx = ccx; this._ccz = ccz;
      this._apriCoda(ccx, ccz);
    }
    // UN BUDGET DI TEMPO, NON UN NUMERO DI CHUNK. È la differenza fra sperare e
    // sapere: «due chunk per frame» è un tetto sul CONTEGGIO, e i chunk non
    // costano uguale — uno pieno d'erba costa dieci volte uno di roccia, e uno
    // già in cache costa una memcpy. Il tetto sul conteggio lasciava passare
    // picchi da tre millisecondi e mezzo (misurati camminando sul mondo aperto);
    // il tetto sul TEMPO li taglia dove sono, e nelle passate fatte di sole
    // copie fa scorrere la coda molto più in fretta di prima.
    //
    // SEMPRE ALMENO UNO, altrimenti su un dispositivo lentissimo il budget
    // sarebbe già finito prima di cominciare e la coda non scorrerebbe mai.
    const t0 = performance.now();
    let fatti = 0;
    while (this._coda.length && (fatti === 0 || performance.now() - t0 < BUDGET_MS)) {
      const c = this._coda.shift();
      this._seminaChunk(mondo, c.kc, c.dc);
      fatti++;
    }
    if (!this._coda.length && this._n !== this.fili) this._scambia();
  }

  /** Il mondo è cambiato sotto i piedi (blocco posato, mondo nuovo). */
  /** Un ciuffo MESSO A MANO in questa cella (il furni «Ciuffo d'erba»). */
  posa(x, y, z) {
    this._posati.set(chiaveCella(x, z), { y });
    this._verPosati++;
    this.risemina();
  }

  /** Via il ciuffo messo a mano. */
  togliPosa(x, z) {
    if (!this._posati.delete(chiaveCella(x, z))) return;
    this._verPosati++;
    this.risemina();
  }

  risemina() { this._ccx = 1e9; this._ccz = 1e9; }

  imposta(on) {
    this.attiva = !!on;
    this.mesh.visible = this.attiva;
    if (this.attiva) this.risemina();
  }
}
