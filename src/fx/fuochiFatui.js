// FUOCHI FATUI — il banco di prova sul campo della LUCE LEGGERA.
//
// COSA SONO. Un blocco «nido» (blocks.js, def.fuochiFatui) genera N lucine che
// volano attorno a lui, si spengono e riappaiono altrove. Ogni fuoco fatuo e'
// DUE cose: una luce LEGGERA (creaLuceLeggera: ombra false, si sposta gratis e
// trapassa i muri) e un corpicino visibile, cioe' un punto additivo — senza il
// corpicino a schermo resta solo un alone che si muove da solo, che e' un
// fantasma, non una creatura.
//
// PERCHE' ESISTE, oltre che per bellezza: e' la dimostrazione che la classe
// leggera fa quello che promette. Cinquecento di questi si spostano ogni frame
// e il mesher non se ne accorge — nessuna mesh ricostruita, nessuna mappa
// d'ombra ricotta, nessuna piastrella dell'atlante toccata. Se un giorno
// qualcuno collegasse per sbaglio i fatui alla griglia della luce, il conteggio
// dei rimesh nel pannello debug schizzerebbe e si vedrebbe subito.
//
// IL MOTO NON E' UN CERCHIO, ed e' una richiesta esplicita del committente. Un
// giro a velocita' costante si legge subito come "meccanico". Qui ci sono
// quattro ingredienti, tutti a periodi INCOMMENSURABILI fra loro (rapporti
// irrazionali: niente si richiude mai sullo stesso disegno):
//   · l'angolo avanza, ma con una deriva che accelera e rallenta;
//   · il raggio respira, quindi la traiettoria non e' chiusa;
//   · la quota ondeggia su un periodo suo;
//   · il fuoco si SPEGNE e si RIACCENDE altrove.
//
// LA SPARIZIONE E' ANCHE IL TRUCCO DEL TELETRASPORTO. La posizione dipende dal
// numero di CICLO di vita: cambiando ciclo il fuoco riparte da un angolo
// diverso. Siccome l'inviluppo vale esattamente 0 alla fine e all'inizio del
// ciclo, il salto avviene mentre la luce e' spenta e a schermo non si vede: e'
// il modo di avere "ricomparse altrove" senza un solo stato mutabile e senza un
// solo scatto. Tutto il moto e' una FUNZIONE PURA del tempo — si prova in Node
// senza GPU (test/fuochi-fatui.test.mjs) e due macchine in rete calcolerebbero
// gli stessi fuochi dallo stesso seme.

import * as THREE from 'three';
import { creaLuceLeggera, rimuoviLuce, spostaLuce } from './materials.js?v=mrsbzwyi';

/** TETTO DICHIARATO dei fuochi vivi in tutto il mondo. Non e' prudenza
 *  generica: senza, bastano venti nidi vicini per avere trecento luci e
 *  trecento punti, e il degrado sarebbe un crollo di fps senza nessuno che lo
 *  dica. Con il tetto il numero si vede in `statistiche()` e il pannello debug
 *  lo stampa. MISURATO (vedi la relazione della sessione): 300 fatui in volo
 *  costano ~0.25 ms/frame di CPU, 500 ne costano ~0.42 — il tetto sta dove il
 *  costo e' ancora una briciola del frame. */
export const FATUI_MAX = 320;

/** Oltre questa distanza dal gatto un nido dorme: niente luci, niente punti.
 *  Un mondo pieno di nidi lontani deve costare ZERO, esattamente come i blocchi
 *  che emettono particelle. */
export const RAGGIO_VIVO = 34;
/** Isteresi: si spegne piu' lontano di quanto si accenda, altrimenti stando
 *  giusto sul confine il nido si accende e si spegne a ogni passo. */
const ISTERESI = 6;

const TAU = Math.PI * 2;

/** Hash deterministico → [0,1). Serve a dare a ogni fuoco fatui parametri suoi
 *  senza tenere stato: stesso (seme, indice) = stesso fuoco, sempre. */
export function casuale(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * I PARAMETRI DI UN FUOCO FATUO, dedotti dal nido e dall'indice. Niente stato:
 * e' una tabella calcolata una volta e riletta.
 *
 * I periodi sono scelti attorno a valori diversi fra loro e moltiplicati per un
 * caso: due fuochi dello stesso nido non battono mai insieme, che e' quello che
 * fa sembrare vivo uno sciame.
 */
export function parametriFuoco(seme, i, opz = {}) {
  const r = (k) => casuale(seme + i * 7.13, k);
  const raggio = opz.raggio ?? 3.2;
  const quota = opz.quota ?? 1.9;
  return {
    // orbita
    r0: raggio * (0.45 + 0.55 * r(1)),        // ognuno gira largo quanto vuole
    ampR: raggio * (0.12 + 0.22 * r(2)),      // quanto respira il raggio
    wR: 0.31 + 0.44 * r(3),                   // e con che periodo
    fase: r(4) * TAU,
    wA: (0.22 + 0.30 * r(5)) * (r(6) < 0.5 ? -1 : 1),   // giro, anche al contrario
    ampD: 0.55 + 0.85 * r(7),                 // quanto la deriva sporca il giro
    wD: 0.17 + 0.29 * r(8),
    // quota
    y0: quota * (0.7 + 0.6 * r(9)),
    ampY: 0.28 + 0.55 * r(10),
    wY: 0.37 + 0.51 * r(11),
    faseY: r(12) * TAU,
    // vita: quanto dura un ciclo di comparsa/sparizione, e da che punto parte
    vita: 7 + 9 * r(13),
    faseVita: r(14),
  };
}

/**
 * INVILUPPO DI UNA VITA — quanto brilla il fuoco a `u` ∈ [0,1) del suo ciclo.
 *
 * Vale ESATTAMENTE 0 all'inizio e alla fine: e' quella la condizione che rende
 * invisibile il salto di posizione fra un ciclo e l'altro. Le rampe sono
 * lisciate (smoothstep) perche' una rampa lineare, moltiplicata per le bande
 * NETTE della luce-sfera, si legge come uno scatto di luminosita' su tutta la
 * pozza — e le bande sono l'unica cosa che deve andare a gradini.
 *
 * L'intensita' scala TUTTO il contributo (colore × intensita' × banda), non il
 * raggio: quindi mentre il fuoco si spegne la sua pozza non si restringe a
 * scatti, si smorza. E' la ragione per cui questo e' un fade e non un
 * cambio di raggio.
 */
export function respiroFuoco(u) {
  if (u <= 0 || u >= 1) return 0;
  const liscia = (t) => t * t * (3 - 2 * t);
  if (u < 0.14) return liscia(u / 0.14);
  if (u < 0.76) return 1;
  if (u < 0.94) return liscia((0.94 - u) / 0.18);
  return 0;                                   // spento: la finestra buia e' [0.94, 1)
}

/**
 * DOVE, DENTRO LA FINESTRA BUIA, AVVIENE IL SALTO DI POSIZIONE. Non e' una
 * costante di comodo: e' la correzione di un difetto che i test hanno trovato e
 * che a mano non si sarebbe visto.
 *
 * Prima il salto cadeva sul CONFINE del ciclo (u = 0), cioe' sul bordo esatto
 * della finestra buia — e il bordo e' anche il punto in cui l'inviluppo ricomincia
 * a salire. Il fotogramma subito dopo il salto trovava quindi il fuoco gia'
 * riacceso di un filo: misurato, 0.0004 di intensita' su 1, con uno spostamento
 * di 5.34 celle nello stesso fotogramma. Invisibile, quasi certamente — ma
 * "quasi certamente invisibile" e' una cosa che si scopre a schermo un anno
 * dopo, su un altro dispositivo, con un altro raggio.
 *
 * Spostando il salto a meta' della finestra buia il fuoco e' spento ESATTAMENTE
 * zero da entrambe le parti, con 0.03 di ciclo di margine per lato: su una vita
 * di 7 secondi sono 0.21 s, cioe' una dozzina di fotogrammi. Non e' piu' una
 * questione di quanto e' piccolo un numero, e' una questione di zero.
 */
const SALTO = 0.03;                           // 1 − 0.97: il salto cade a u = 0.97

/**
 * DOVE STA E QUANTO BRILLA un fuoco fatuo al tempo `t` (secondi), rispetto al
 * centro del nido. Scrive in `out` = {x, y, z, k} e lo ritorna (niente
 * allocazioni: gira per ogni fuoco e per ogni frame).
 *
 * `k` e' il fattore di intensita' in [0,1]: 0 = spento.
 */
export function posaFuoco(p, t, out) {
  const uGrezzo = t / p.vita + p.faseVita;
  const k = respiroFuoco(uGrezzo - Math.floor(uGrezzo));
  // IL SALTO STA QUI: l'angolo di partenza dipende dal numero di ciclo, quindi
  // cambia solo quando k e' gia' 0. Nessuno stato, nessuno scatto visibile.
  // Il +SALTO sposta il confine del "ciclo di posizione" a META' della finestra
  // buia invece che sul suo bordo — vedi il commento della costante.
  const ciclo = Math.floor(uGrezzo + SALTO);
  const partenza = casuale(p.fase + ciclo * 3.77, ciclo) * TAU;
  const ang = partenza + p.fase + p.wA * TAU * t + p.ampD * Math.sin(p.wD * TAU * t + p.fase);
  const r = p.r0 + p.ampR * Math.sin(p.wR * TAU * t + p.fase * 1.7);
  out.x = Math.cos(ang) * r;
  out.z = Math.sin(ang) * r;
  out.y = p.y0 + p.ampY * Math.sin(p.wY * TAU * t + p.faseY);
  out.k = k;
  return out;
}

// ---- il gestore (questa parte tocca THREE) ---------------------------------

const _p = { x: 0, y: 0, z: 0, k: 0 };

/**
 * Tiene in vita i fuochi fatui di tutti i nidi.
 *
 * DUE GEOMETRIE DI PUNTI PER TUTTO IL MONDO, non una mesh per fuoco: un nucleo
 * piccolo e netto piu' un alone piu' grande e tenue, entrambi additivi. Sono due
 * draw call in croce anche con trecento fuochi, ed e' il motivo per cui il costo
 * dei fatui e' tutto nella CPU (qualche seno a testa) e niente nel disegno.
 * Il colore per-punto porta anche la LUMINOSITA': in additivo moltiplicare il
 * colore e' esattamente come abbassare l'opacita', e PointsMaterial l'opacita'
 * per-punto non ce l'ha.
 */
export class FuochiFatui {
  constructor(scena, max = FATUI_MAX) {
    this.max = max;
    this.scena = scena;
    this.nidi = new Map();          // "x,y,z" → { cx, cy, cz, def, fuochi[], viva }
    this.t = 0;
    this._vivi = 0;
    this._chiesti = 0;

    this._pos = new Float32Array(max * 3);
    this._col = new Float32Array(max * 3);
    // UNA SOLA GEOMETRIA per nucleo e alone: i due Points condividono gli stessi
    // buffer, quindi le posizioni salgono in GPU UNA volta per frame invece di
    // due. Cambia solo il materiale (dimensione del punto e forza).
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this._pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this._col, 3));
    this.geo.setDrawRange(0, 0);
    // niente frustum culling e sfera enorme: i punti si muovono ogni frame e
    // ricalcolare il bounding costerebbe piu' del disegno
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    // NUCLEO + ALONE, e le misure vengono da una prova a schermo, non a occhio:
    // a 0.17/0.52 i corpicini erano puntini bianchi da due pixel che a schermo si
    // confondevano con la pioggia — restava l'alone di luce e il fuoco fatuo
    // sembrava un fantasma senza corpo, che e' precisamente cio' che il
    // committente NON ha chiesto. Il nucleo va tenuto piccolo (e' il "punto"
    // acceso) e l'alone largo il triplo e tenue: e' lui a dare il corpo.
    this.nucleo = this._punti(0.26, 1.0);
    this.alone = this._punti(0.86, 0.42);
    scena.add(this.alone, this.nucleo);
  }

  _punti(dim, forza) {
    const m = new THREE.PointsMaterial({
      size: dim, vertexColors: true, transparent: true, opacity: forza,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const p = new THREE.Points(this.geo, m);
    p.frustumCulled = false;
    p.visible = false;
    p.renderOrder = 3;
    return p;
  }

  /** Rinfresca l'elenco dei nidi. `celle` = Map "x,y,z" → def.fuochiFatui.
   *  I nidi che restano NON perdono i loro fuochi: rifare l'elenco a ogni
   *  blocco posato non deve far ricominciare lo sciame da capo. */
  imposta(celle) {
    for (const k of [...this.nidi.keys()]) if (!celle.has(k)) this._spegniNido(k);
    for (const [k, def] of celle) {
      if (this.nidi.has(k)) { this.nidi.get(k).def = def; continue; }
      const [x, y, z] = k.split(',').map(Number);
      this.nidi.set(k, {
        cx: x + 0.5, cy: y + 0.5, cz: z + 0.5, def,
        seme: (x * 73856093) ^ (y * 19349663) ^ (z * 83492791),
        fuochi: [], viva: false,
      });
    }
  }

  _spegniNido(k) {
    const n = this.nidi.get(k);
    if (!n) return;
    this._spegni(n);
    this.nidi.delete(k);
  }

  /**
   * Spegne tutto: nessuna luce accesa, nessun punto disegnato.
   *
   * I NIDI RESTANO IN ELENCO, e non e' una svista. La prima versione cancellava
   * anche quelli, ed era un guasto silenzioso: main la chiama entrando in AR (li'
   * il mondo trasloca in un pivot scalato e le luci in volo vanno spente), ma
   * imposta() lo richiama solo a un cambio di mondo o alla posa di un blocco —
   * quindi USCENDO dall'AR i fuochi fatui non tornavano PIU', per tutta la
   * sessione, senza che niente lo dicesse. Trovato misurando: sette minuti di
   * prova con "vivi: 0" costanti dove dovevano essercene 21.
   * E' la stessa scelta di Creature.svuota(), che pure si ripopola da sola.
   */
  svuota() {
    for (const n of this.nidi.values()) this._spegni(n);
    this.nucleo.visible = this.alone.visible = false;
    this._vivi = 0; this._chiesti = 0;
  }

  /** Quanti fuochi vivono davvero e quanti ne vorrebbero i nidi: il tetto va
   *  VISTO, non subito in silenzio (lo stampa il pannello debug). */
  statistiche() {
    return { vivi: this._vivi, chiesti: this._chiesti, nidi: this.nidi.size, tetto: this.max };
  }

  _accendi(n) {
    const d = n.def || {};
    const quanti = Math.max(0, Math.min(64, d.numero ?? 6));
    const lu = d.luce || {};
    for (let i = 0; i < quanti; i++) {
      n.fuochi.push({
        p: parametriFuoco(n.seme, i, d),
        luce: creaLuceLeggera({
          pos: new THREE.Vector3(n.cx, n.cy, n.cz),
          raggio: lu.raggio ?? 4.2, colore: lu.colore ?? 0x9fe0ff, intensita: 0,
        }),
        base: lu.intensita ?? 1.0,
        colore: new THREE.Color(lu.colore ?? 0x9fe0ff),
      });
    }
    n.viva = true;
  }

  _spegni(n) {
    for (const f of n.fuochi) if (f.luce) rimuoviLuce(f.luce);
    n.fuochi.length = 0;
    n.viva = false;
  }

  /**
   * Un frame di vita. `fuoco` e' il gatto: i nidi lontani dormono.
   *
   * QUI NON SI TOCCA NIENTE DI PESANTE, ed e' il punto di tutto il file: si
   * scrivono tre float per luce (spostaLuce) e sei per punto. Nessuna chiamata
   * al mesher, nessuna cottura, nessun evento sul mondo.
   */
  aggiorna(dt, fuoco) {
    this.t += dt;
    const t = this.t;
    let n0 = 0, chiesti = 0;
    const pos = this._pos, col = this._col, max = this.max;

    for (const n of this.nidi.values()) {
      const dx = n.cx - fuoco.x, dz = n.cz - fuoco.z;
      const d2 = dx * dx + dz * dz;
      const soglia = n.viva ? (RAGGIO_VIVO + ISTERESI) : RAGGIO_VIVO;
      if (d2 > soglia * soglia) { if (n.viva) this._spegni(n); continue; }
      chiesti += Math.max(0, Math.min(64, (n.def && n.def.numero) ?? 6));
      // IL TETTO SI APPLICA AI NIDI INTERI, non ai singoli fuochi: mozzare uno
      // sciame a meta' si vede (uno sciame di 7 che diventa di 3 e torna 7),
      // mentre un nido intero che non si accende e' un nido lontano in piu'.
      if (!n.viva) {
        if (n0 + ((n.def && n.def.numero) ?? 6) > max) continue;
        this._accendi(n);
      }
      for (const f of n.fuochi) {
        if (n0 >= max) break;
        posaFuoco(f.p, t, _p);
        const x = n.cx + _p.x, y = n.cy + _p.y, z = n.cz + _p.z;
        spostaLuce(f.luce, x, y, z);
        f.luce.intensita = f.base * _p.k;
        // spenta del tutto: aggiornaLuci la salta gia' (intensita <= 0), quindi
        // un fuoco nel suo intervallo buio non occupa nemmeno uno slot delle
        // LUCI_MAX — e' cosi' che uno sciame numeroso resta sostenibile
        const o = n0 * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        col[o] = f.colore.r * _p.k; col[o + 1] = f.colore.g * _p.k; col[o + 2] = f.colore.b * _p.k;
        n0++;
      }
    }

    this._vivi = n0;
    this._chiesti = chiesti;
    const acceso = n0 > 0;
    this.nucleo.visible = this.alone.visible = acceso;
    if (!acceso) return;
    this.geo.setDrawRange(0, n0);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}
