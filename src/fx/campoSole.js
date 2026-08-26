// IL CAMPO DEL SOLE — l'ombra del cielo calcolata UNA volta, letta a costo uno.
//
// ⚠ PERCHÉ ESISTE: PRIMA L'OMBRA SI PAGAVA PER PIXEL, PER FRAME. Ogni frammento
// del mondo camminava fino a tredici letture di heightmap (l'ombra portata dal
// terreno) e provava fino a trentadue scatole (le sagome dei mobili) — e lo
// rifaceva identico al fotogramma dopo, perché fra due frame il sole si è mosso
// di niente. Su una GPU integrata le letture di texture dipendenti sono la cosa
// più cara che esista: era il singolo motivo per cui il cel shading su telefono
// restava spento.
//
// L'OSSERVAZIONE CHE RIBALTA IL CONTO: a sole fermo, l'ombra è una PROPRIETÀ DEL
// MONDO, non del fotogramma. Per ogni colonna (x,z) esiste UNA quota sotto la
// quale si sta in ombra — la chiamiamo il LIMITE. Questo modulo calcola il
// limite di tutte le colonne e lo scrive in una texture; lo shader fa UNA
// lettura:   in ombra ⇔ vPosMondo.y < limite(x, z).
//
// QUATTRO CANALI, E OGNUNO HA UNA STORIA:
//   R = limite del SOLO TERRENO        → lo leggono i MOBILI (un albero che
//       leggesse anche le sagome si annerirebbe sotto la PROPRIA chioma)
//   G = TETTO dell'ombra delle sagome  → il mondo è in ombra-di-mobile se
//   B = PAVIMENTO della stessa ombra      B < y < G: è un INTERVALLO, non un
//       limite. ⚠ È la correzione della «bolla sotto gli alberi»: una chioma
//       galleggia a cinque blocchi da terra, e con un limite solo («in ombra se
//       stai sotto») il terreno SOTTO la chioma risultava in ombra anche quando
//       il raggio verso il sole le passava comodamente SOTTO — l'ombra
//       abbracciava il tronco invece di stare spostata dove la manda l'astro,
//       e «non combaciava col modello alla base». Il pavimento dice dove
//       l'ombra FINISCE in basso, ed è quello che il vecchio test 3D sapeva e
//       la mia riduzione a raggio orizzontale aveva perso.
//   A = libero (riservato)
// Se più sagome coprono lo stesso texel si tiene l'INVILUPPO [min dei
// pavimenti, max dei tetti]: per le fette impilate dello stesso albero è
// esatto; per due alberi con bande separate in quota riempie il buco fra le
// due — un'aria di mezzo che non ombreggia niente di visibile, documentato.
// (Un mobile non riceve l'ombra di un ALTRO mobile: limite storico, mai
// notato da nessuno.)
//
// IL TERRENO SI CALCOLA IN TEMPO LINEARE, non quadratico: il limite obbedisce a
// una ricorrenza lungo la direzione del sole —
//
//     limite(p) = max( h(p + 1 blocco verso il sole) − salita·1 ,
//                      limite(p + un texel verso il sole) − salita·passo )
//
// o ti fa ombra il terreno lì accanto, o eredìti l'ombra che quel punto già
// aveva, abbassata di quanto il raggio sale nel tragitto. Ogni texel costa un
// pugno di letture di array. E siccome non c'è nessun tetto di passi, le ombre
// lunghe dell'alba arrivano fin dove devono — il vecchio cammino le tagliava a
// tredici blocchi proprio nelle ore in cui sono più belle.
//
// ⚠ IL CAMPIONE DELL'ALTEZZA STA A UN BLOCCO, NON A UN TEXEL: è la regola del
// vecchio cammino (partiva da k=1). Senza, il raggio leggerebbe la colonna del
// frammento stesso e le pareti rivolte al sole si farebbero ombra da sole.
//
// ⚠ E IL LAVORO SI SPALMA SUI FRAME. Un ricalcolo intero a fattore 2 sono
// mezzo milione di texel: farlo in un colpo solo costava 12–25 ms, cioè un
// singhiozzo visibile ogni volta che il sole scattava di un quanto. Il campo
// invece avanza a fette dentro un bilancio di ~3 ms a frame, scrivendo su array
// di lavoro; la TEXTURE si aggiorna solo alla fine, quindi mentre si ricalcola
// lo shader legge il campo vecchio — il sole arriva con qualche decimo di
// secondo di ritardo, che su un quanto di mezzo grado non vede nessuno.
//
// COSA NON PASSA DA QUI: i CORPI in movimento (coni uPg, non sanno nemmeno
// dov'è il sole), le NUVOLE (maschera loro, si ridisegna col vento), la
// VEGETAZIONE (otto scatole per-vertice, GLSL_SCATOLE_VERTICE).

import * as THREE from 'three';

/** «Nessuna ombra»: più in basso di qualunque mondo possibile. */
export const CAMPO_FONDO = -1000;

/** «Nessun pavimento»: più in alto di qualunque mondo. È il valore di riposo
 *  del canale B — un intervallo [CIELO, FONDO] è vuoto e non ombreggia. */
export const CAMPO_CIELO = 1000;

/** Quanto lontano arriva l'ombra di un MOBILE, in blocchi. È il vecchio
 *  DIN_LUNG dello shader: si conserva il numero per conservare l'aspetto. */
export const LUNGHEZZA_OMBRA = 12;

/** Sotto questa pendenza l'astro è allo zenit (o sotto l'orizzonte). */
const ZENIT = 0.02;

/** Quanti millisecondi al massimo può prendersi UNA chiamata ad aggiorna().
 *  È un bilancio di OROLOGIO, non di lavoro: su un dispositivo lento le fette
 *  fanno meno strada e il ricalcolo prende più frame — mai più di così a frame.
 *  A 144 Hz il frame è 6,9 ms: due sono un terzo, non la metà. */
const BILANCIO_MS = 2;

// (QUI VIVEVA UNA COPIA RICAMPIONATA della heightmap alla grana del campo.
// Sembrava un'ottimizzazione ed era un difetto: ricampionare E POI campionare
// sono DUE tende bilineari in cascata, e una torre larga un blocco perdeva metà
// altezza prima ancora che il raggio la guardasse — l'ha scoperto la prova a
// panino. La tappa dopo — leggere la SORGENTE ma bilineare — è caduta pure
// lei: vedi il ⚠ dentro raggioSweep, la fase bloccata dei 45 gradi.)

/**
 * Prepara la spazzata A RAGGI: un raggio parallelo alla direzione del sole per
 * ogni texel del bordo a monte, ognuno col SUO massimo corrente.
 *
 * ⚠ PERCHÉ RAGGI E NON L'EREDITÀ FRA TEXEL. La prima versione propagava il
 * massimo da texel a texel interpolando fra i due vicini a monte: elegante, ma
 * l'interpolazione MESCOLA — un picco largo un blocco (la torre che il
 * giocatore si costruisce) si diluiva a ogni passo e la sua ombra spariva in
 * quattro blocchi. L'ha trovato la prova contro la forza bruta: campo 4.7,
 * bruto 8.9. Un raggio invece porta il suo massimo senza chiedere niente ai
 * vicini: stesso costo (ogni raggio scrive una colonna di texel), zero
 * diffusione. E la LETTURA delle altezze è NETTA, non bilineare — il perché
 * sta nel ⚠ dentro raggioSweep.
 */
function preparaSweep(dimF, fattore, dir) {
  const l = Math.hypot(dir.x, dir.z);
  if (dir.y <= ZENIT || l < ZENIT) return null;        // zenit/notte: campo piatto
  const salita = dir.y / l;
  const passo = 1 / fattore;
  const dxn = dir.x / l, dzn = dir.z / l;
  const magX = Math.abs(dxn) >= Math.abs(dzn);
  // il raggio avanza di UN texel sull'asse maggiore, e scivola sul minore
  const pend = magX ? dzn / Math.abs(dxn) : dxn / Math.abs(dzn);
  const segno = (magX ? dxn : dzn) > 0 ? 1 : -1;       // da che parte sta il sole
  const calo = salita * passo * Math.hypot(1, pend);   // quanto scende il massimo per passo
  // il campione d'altezza sta a UN BLOCCO verso il sole dal punto corrente
  // (regola del vecchio cammino, k=1: mai la propria colonna) — in texel:
  const offA = (magX ? dxn : dzn) * fattore;
  const offB = (magX ? dzn : dxn) * fattore;
  // Scendendo a valle il minore scivola di −pend per passo (il conto: la
  // pendenza vale pend/segno per +1 di maggiore, e a valle il maggiore fa
  // −segno — il segno si semplifica ed esce sempre −pend).
  // I semi: MEZZO texel di spaziatura sul bordo a monte, più quelli «fuori»
  // sul minore da cui un raggio obliquo rientra nella griglia.
  // ⚠ MEZZO, NON UNO: il raggio che scrive un texel può correre fino a mezzo
  // texel di fianco alla verticale vera del suo centro. Ai tempi della lettura
  // bilineare quel fianco DILUIVA il picco stretto (la guglia del giocatore
  // perdeva l'ombra: campo 6.1 contro un minimo lecito di 8.9) e i semi a
  // mezzo passo dimezzavano il danno; con la lettura netta la diluizione non
  // esiste più, ma i semi fitti restano — tengono PIENA la banda insieme alla
  // doppia scrittura sul minore, e i raggi doppi che cadono sullo stesso texel
  // li assorbe il max in scrittura.
  const drift = Math.ceil(Math.abs(pend) * dimF) + 1;
  const semi0 = pend > 0 ? 0 : -drift;
  const semiN = 2 * ((pend > 0 ? dimF + drift : dimF) - semi0);
  return { dimF, fattore, magX, segno, salita, calo, pend, offA, offB, semi0, semiN, cnt: 0 };
}

/** Un RAGGIO intero, dal bordo a monte fin fuori dalla griglia. Riprendibile.
 *  Le altezze si leggono dalla SORGENTE (grana blocco), NETTE — la colonna
 *  più vicina, senza tenda: il perché sta nel ⚠ qui sotto.
 *
 *  ⚠ IL CAMPIONE D'ALTEZZA SI PRENDE UNA VOLTA PER BLOCCO, non per texel: la
 *  sorgente HA un texel per blocco, e a fattore 2 leggerla a ogni mezzo passo
 *  significava pagare due volte lo stesso dato — era metà del costo della
 *  spazzata sul mondo gigante (misurato: 14 ms → la sola lettura raddoppiata).
 *  Fra un campione e l'altro il massimo corrente decade e basta, che è
 *  esattamente ciò che faceva il vecchio cammino con il suo passo da un blocco. */
function raggioSweep(st, cielo, dim, campo) {
  const { dimF, fattore, segno, salita, calo, pend } = st;
  const ultimo = dimF - 1;
  const ultimoS = dim - 1.001;
  const m0 = st.semi0 + st.cnt * 0.5;                  // seme sul minore (passo mezzo texel)
  const invF = 1 / fattore;
  // coordinate TEXEL-SORGENTE del campione: src = (i+0.5)/fattore − 0.5 + un
  // blocco verso il sole. Avanzano di un DELTA COSTANTE per passo: si portano
  // avanti con due somme invece di ricalcolarle.
  const capoA = 0.5 * invF - 0.5 + st.offA * invF;
  const capoB = 0.5 * invF - 0.5 + st.offB * invF;
  const magX = st.magX;
  const iaParte = segno > 0 ? ultimo : 0;
  const dSa = -segno * invF;                           // Δ sorgente-a per passo
  const dSb = -pend * invF;                            // Δ sorgente-b per passo
  let sa = iaParte * invF + capoA;
  let sb = m0 * invF + capoB;
  let bf = m0;
  let corrente = CAMPO_FONDO;
  for (let k = 0; k < dimF; k++) {
    if (bf >= -1 && bf <= ultimo + 1) {
      if (k % fattore === 0) {
        // ⚠ L'ALTEZZA SI LEGGE NETTA: la colonna più vicina, non la tenda
        // bilineare. La tenda pareva «la stessa fedeltà del vecchio cammino
        // per-pixel», ma il vecchio cammino partiva dal FRAMMENTO — fase
        // continua, e qualche pixel il centro del picco lo beccava comunque.
        // I raggi no: a 45 gradi esatti la frazione del campione resta
        // INCHIODATA (0.71 su tutti i raggi, per tutta la spazzata), nessuno
        // legge mai il centro di una colonna 1×1, e la pila del giocatore alta
        // otto si leggeva sei e mezzo — l'ombra moriva a metà strada e a
        // pezzetti: i «punti sempre più grandi». Il mondo è fatto di BLOCCHI:
        // o la colonna c'è o non c'è. Netta è anche UNA lettura invece di
        // quattro, e l'ombra combacia col reticolo dei modelli.
        const ca = sa < 0 ? 0 : (sa > ultimoS ? ultimoS : sa);
        const cb = sb < 0 ? 0 : (sb > ultimoS ? ultimoS : sb);
        const a0 = (ca + 0.5) | 0, b0 = (cb + 0.5) | 0;
        const h = magX ? cielo[b0 * dim + a0] : cielo[a0 * dim + b0];   // z·dim + x, a = x sul maggiore-x
        const nuovo = h - salita;                      // candidato: il vicino a un blocco
        if (nuovo > corrente) corrente = nuovo;
      }
      if (corrente > CAMPO_FONDO) {
        // ⚠ SI SCRIVONO I DUE TEXEL DEL MINORE, non il più vicino. Con uno solo,
        // un'ombra stretta che corre in DIAGONALE occupava una catena di texel
        // che si toccano agli angoli: il bilineare della GPU crolla a metà fra
        // l'uno e l'altro, la banda netta taglia il crollo, e la pila di
        // blocchi del giocatore proiettava «punti sempre più grandi» invece di
        // una striscia. Due texel per passo rendono la catena spessa e il
        // bilineare regge. (È la stessa rasterizzazione conservativa delle
        // scatole, applicata alla spazzata.)
        const ia = segno > 0 ? ultimo - k : k;
        const b0 = Math.floor(bf), b1 = b0 + 1;
        if (magX) {
          if (b0 >= 0 && b0 <= ultimo) { const i = b0 * dimF + ia; if (corrente > campo[i]) campo[i] = corrente; }
          if (b1 >= 0 && b1 <= ultimo) { const i = b1 * dimF + ia; if (corrente > campo[i]) campo[i] = corrente; }
        } else {
          const rA = ia * dimF;
          if (b0 >= 0 && b0 <= ultimo) { const i = rA + b0; if (corrente > campo[i]) campo[i] = corrente; }
          if (b1 >= 0 && b1 <= ultimo) { const i = rA + b1; if (corrente > campo[i]) campo[i] = corrente; }
        }
      }
    } else if ((pend > 0 && bf < -1) || (pend < 0 && bf > ultimo + 1)) {
      break;                                           // uscito dal lato: non rientra più
    }
    corrente -= calo;                                  // il raggio sale: il massimo scende
    bf -= pend; sa += dSa; sb += dSb;
  }
  st.cnt++;
  return st.cnt >= st.semiN;                           // vero = spazzata finita
}

/**
 * IL TERRENO in un colpo solo (per le prove e per chi non ha fretta): stessa
 * identica spazzata del percorso a fette, senza il bilancio di tempo.
 */
export function calcolaCampoTerreno(cielo, dim, origine, dir, campo, fattore) {
  const dimF = dim * fattore;
  campo.fill(CAMPO_FONDO);                 // i raggi scrivono col max: si parte dal fondo
  const st = preparaSweep(dimF, fattore, dir);
  if (!st) return;
  while (!raggioSweep(st, cielo, dim, campo)) { /* tutti i raggi */ }
}

/**
 * LE SCATOLE: stampa l'ombra di ogni sagoma come INTERVALLO [pavimento, tetto].
 * Ogni scatola è una fetta d'ottagono come esce da furniture.scatoleOmbra:
 * { x0,x1, y0,y1, z0,z1, s0,s1, d0,d1 } con s = x+z e d = x−z.
 *
 * IL TETTO è la cima della scatola meno la salita per RAGGIUNGERLA (t d'entrata);
 * IL PAVIMENTO è il fondo della scatola meno la salita per USCIRNE (t d'uscita):
 * un frammento sta in ombra solo se il suo raggio verso il sole incrocia la
 * scatola DAVVERO — né sopra (esce oltre la cima) né sotto (le passa sotto).
 * ⚠ Senza il pavimento c'era la BOLLA: la chioma galleggia a cinque blocchi da
 * terra e il terreno sotto di lei risultava in ombra anche quando il raggio le
 * passava comodamente sotto — l'ombra abbracciava il tronco, «non combaciava
 * col modello alla base». Il vecchio test 3D per-pixel lo sapeva (slab anche
 * in y); la riduzione a raggio orizzontale l'aveva perso.
 *
 * ⚠ LA RASTERIZZAZIONE È CONSERVATIVA: gli slab si gonfiano di mezzo texel, o
 * l'ombra del palo sottile (un quinto di blocco) passa fra i centri dei texel
 * e diventa una fila di trattini. L'ombra minima esce larga un texel — più
 * cicciotta del vero, che su questo stile è un pregio.
 *
 * @param tetti     Float32Array dimF² — esce col max dei tetti (canale G)
 * @param pavimenti Float32Array dimF² — esce col min dei pavimenti (canale B)
 * @returns quante scatole hanno stampato davvero (per il rapporto)
 */
export function stampaScatole(scatole, dim, origine, dir, tetti, pavimenti, fattore, da = 0, fino = Infinity) {
  const dimF = dim * fattore;
  const l = Math.hypot(dir.x, dir.z);
  if (dir.y <= ZENIT) return 0;
  const zenit = l < ZENIT;
  const salita = zenit ? 0 : dir.y / l;
  const dxn = zenit ? 0 : dir.x / l, dzn = zenit ? 0 : dir.z / l;
  const passo = 1 / fattore;
  const mezzo = 0.5 * passo;
  const mezzoDiag = mezzo * 1.42;      // gli slab diagonali corrono a √2
  // la portata di stavolta: mai oltre LUNGHEZZA_OMBRA (parità col vecchio)
  const portata = zenit ? 0.2 : Math.min(LUNGHEZZA_OMBRA, 80 / Math.max(salita, 0.1));

  // intervallo di t (blocchi lungo il raggio) in cui «v0 ≤ p + vel·t ≤ v1»
  const int = [0, 0];
  const slab = (p, vel, v0, v1, gonfio) => {
    const g0 = v0 - gonfio, g1 = v1 + gonfio;
    if (Math.abs(vel) < 1e-6) {
      if (p < g0 || p > g1) { int[0] = 1; int[1] = 0; }   // fuori: taglia tutto
      return;
    }
    const a = (g0 - p) / vel, b = (g1 - p) / vel;
    const lo = a < b ? a : b, hi = a < b ? b : a;
    if (lo > int[0]) int[0] = lo;
    if (hi < int[1]) int[1] = hi;
  };

  let stampate = 0;
  const fine = Math.min(fino, scatole.length);
  for (let si = da; si < fine; si++) {
    const s = scatole[si];
    if (!s || !(s.y1 > CAMPO_FONDO)) continue;
    // L'OMBRA DI CONTATTO — la gonnellina alla base — serve con l'astro ALTO,
    // quando l'ombra vera sta tutta sotto l'oggetto; all'alba è solo una toppa
    // che si nota. Regola di prima (nasce sopra i trenta gradi), qui a sì/no:
    // scatta fra due ricalcoli, dentro un salto di sole già quantizzato.
    if (s.contatto && dir.y < 0.55) continue;
    const ex = dxn > 0 ? dxn * portata : 0, ex1 = dxn < 0 ? -dxn * portata : 0;
    const ez = dzn > 0 ? dzn * portata : 0, ez1 = dzn < 0 ? -dzn * portata : 0;
    const tx0 = Math.max(0, Math.floor((s.x0 - ex - origine - mezzo) * fattore));
    const tx1 = Math.min(dimF - 1, Math.ceil((s.x1 + ex1 - origine + mezzo) * fattore));
    const tz0 = Math.max(0, Math.floor((s.z0 - ez - origine - mezzo) * fattore));
    const tz1 = Math.min(dimF - 1, Math.ceil((s.z1 + ez1 - origine + mezzo) * fattore));
    if (tx1 < tx0 || tz1 < tz0) continue;
    // il MEGLIO che questa scatola possa scrivere: se il texel ha già un tetto
    // più alto E un pavimento più basso di quanto questa possa dare, gli slab
    // non hanno niente da aggiungere — una lettura al posto di quattro
    // intersezioni, e sui boschi fitti è la maggioranza dei texel
    const meglio = s.y1 - salita * 0.05;
    const peggio = s.y0 - salita * portata;
    let toccati = 0;
    for (let iz = tz0; iz <= tz1; iz++) {
      const pz = origine + (iz + 0.5) * passo;
      const riga = iz * dimF;
      for (let ix = tx0; ix <= tx1; ix++) {
        const i = riga + ix;
        if (tetti[i] >= meglio && pavimenti[i] <= peggio) continue;
        const px = origine + (ix + 0.5) * passo;
        // il raggio orizzontale p + d·t deve attraversare TUTTI gli slab:
        // i due assi e le due diagonali — è l'ottagono, non il rettangolo
        int[0] = 0.05; int[1] = portata;
        slab(px, dxn, s.x0, s.x1, mezzo);
        if (int[0] >= int[1]) continue;
        slab(pz, dzn, s.z0, s.z1, mezzo);
        if (int[0] >= int[1]) continue;
        slab(px + pz, dxn + dzn, s.s0, s.s1, mezzoDiag);
        if (int[0] >= int[1]) continue;
        slab(px - pz, dxn - dzn, s.d0, s.d1, mezzoDiag);
        if (int[0] >= int[1]) continue;
        // dentro: tetto = cima all'ENTRATA del raggio, pavimento = fondo
        // all'USCITA (allo zenit: l'impronta, tetto y1 e pavimento y0)
        const tetto = s.y1 - salita * int[0];
        const pav = s.y0 - salita * int[1];
        let scritto = false;
        if (tetto > tetti[i]) { tetti[i] = tetto; scritto = true; }
        if (pav < pavimenti[i]) { pavimenti[i] = pav; scritto = true; }
        if (scritto) toccati++;
      }
    }
    if (toccati) stampate++;
  }
  return stampate;
}

/**
 * Il campo vero e proprio: possiede la texture RG float e decide QUANDO e
 * QUANTO ricalcolare. La risposta a «quando» è quasi mai (direzione quantizzata
 * del sole + versioni di mondo e arredo); la risposta a «quanto» è mai più di
 * BILANCIO_MS per frame.
 */
export class CampoSole {
  /** @param fattore 2 = mezza cella di grana (desktop), 1 = grana cella (mobile) */
  constructor(dim, origine, fattore = 2) {
    this.dim = dim;
    this.origine = origine;
    this.fattore = fattore;
    const dimF = this.dimF = dim * fattore;
    this._r = new Float32Array(dimF * dimF).fill(CAMPO_FONDO);   // terreno: limite
    this._g = new Float32Array(dimF * dimF).fill(CAMPO_FONDO);   // sagome: TETTO
    this._b = new Float32Array(dimF * dimF).fill(CAMPO_CIELO);   // sagome: PAVIMENTO
    this._dati = new Float32Array(dimF * dimF * 4);
    for (let j = 0; j < this._dati.length; j += 4) { this._dati[j] = CAMPO_FONDO; this._dati[j + 1] = CAMPO_FONDO; this._dati[j + 2] = CAMPO_CIELO; }
    this.texture = new THREE.DataTexture(this._dati, dimF, dimF, THREE.RGBAFormat, THREE.FloatType);
    this.texture.magFilter = THREE.NearestFilter;   // lineare quando la scheda lo consente
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this._chiave = '';
    this._lavoro = null;              // ricalcolo in corso, a fette
    this.ms = 0;                      // CPU dell'ultimo ricalcolo, sommata sulle fette
    this.ricalcoli = 0;
  }

  /** Stessa politica della heightmap: bilineare solo con OES_texture_float_linear. */
  filtroLineare(si) {
    const f = si ? THREE.LinearFilter : THREE.NearestFilter;
    if (this.texture.magFilter === f) return;
    this.texture.magFilter = f; this.texture.minFilter = f;
    this.texture.needsUpdate = true;
  }

  /**
   * Da chiamare una volta per frame. Quasi sempre è un confronto di stringhe;
   * quando la chiave cambia AVVIA un ricalcolo, e le chiamate successive lo
   * portano avanti dentro il bilancio finché la texture non è pronta.
   * @returns true se il ricalcolo è stato COMPLETATO in questa chiamata
   */
  aggiorna({ cielo, dir, scatole, versioneCielo, versioneScatole, attivo = true }) {
    if (!attivo) { this._chiave = ''; this._lavoro = null; return false; }
    // ⚠ IL QUANTO DELLA DIREZIONE decide ogni quanto si paga il ricalcolo: a 96
    // scatti per unità il sole «salta» di circa mezzo grado — in fondo a
    // un'ombra di tredici blocchi è un decimo di blocco, sotto il texel.
    const k = Math.round(dir.x * 96) + ',' + Math.round(dir.y * 96) + ',' + Math.round(dir.z * 96)
      + '|' + versioneCielo + '|' + versioneScatole;
    if (k !== this._chiave) {
      this._chiave = k;
      const st = preparaSweep(this.dimF, this.fattore, dir);
      this.ms = 0;
      this._r.fill(CAMPO_FONDO);           // i raggi scrivono col max: si parte dal fondo
      this._g.fill(CAMPO_FONDO);           // tetti delle sagome, da zero
      this._b.fill(CAMPO_CIELO);           // pavimenti: intervallo vuoto
      this._lavoro = {
        fase: st ? 'terreno' : 'scatole',  // zenit/notte: niente terreno, solo impronte
        st, cielo, dir: { x: dir.x, y: dir.y, z: dir.z }, scatole, prossima: 0,
      };
    }
    if (!this._lavoro) return false;
    return this._lavora();
  }

  /** Una fetta di lavoro dentro il bilancio. Rende true quando ha FINITO. */
  _lavora() {
    const t0 = performance.now();
    const L = this._lavoro;
    while (performance.now() - t0 < BILANCIO_MS) {
      if (L.fase === 'terreno') {
        // un mazzetto di raggi per giro: uno solo è troppo poco per il bilancio
        let fatto = false;
        for (let n = 0; n < 16 && !fatto; n++) fatto = raggioSweep(L.st, L.cielo, this.dim, this._r);
        if (fatto) L.fase = 'scatole';
      } else if (L.fase === 'scatole') {
        // poche scatole alla volta: ognuna tocca centinaia di texel
        if (L.prossima >= L.scatole.length) { L.fase = 'impacchetta'; continue; }
        stampaScatole(L.scatole, this.dim, this.origine, L.dir, this._g, this._b, this.fattore, L.prossima, L.prossima + 8);
        L.prossima += 8;
      } else {
        // l'ultimo passo: i canali nella texture — A FETTE ANCHE QUESTO.
        // Mezzo milione di scritture in un colpo solo era l'unico passo capace
        // di sfondare il bilancio da solo; la GPU vede la texture SOLO quando
        // l'ultima fetta è scritta, quindi non c'è mai un campo a metà.
        const r = this._r, g = this._g, b = this._b, d = this._dati;
        if (L.imp === undefined) L.imp = 0;
        const fine2 = Math.min(r.length, L.imp + 49152);
        for (let i = L.imp, j = L.imp * 4; i < fine2; i++, j += 4) { d[j] = r[i]; d[j + 1] = g[i]; d[j + 2] = b[i]; }
        L.imp = fine2;
        if (fine2 >= r.length) {
          this.texture.needsUpdate = true;
          this._lavoro = null;
          this.ricalcoli++;
          this.ms += performance.now() - t0;
          return true;
        }
      }
    }
    this.ms += performance.now() - t0;
    return false;
  }

  /** Tutto e subito, senza bilancio: per le prove e per il primo avvio. */
  aggiornaSubito(parametri) {
    this.aggiorna(parametri);
    while (this._lavoro) this._lavora();
    return true;
  }
}
