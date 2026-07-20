// LA TAVOLOZZA — gli otto posti di ciò che hai "fuori" mentre costruisci.
//
// LA METAFORA È IL PUNTO, non un vezzo. Un pittore tiene tutti i colori nella
// scatola e ne mette otto sulla tavolozza: quelli che sta usando adesso. La
// scatola è lo ZAINO (tutto ciò che possiedi, sempre lì), la tavolozza è questo
// file. Da qui discende la regola che risolve il difetto peggiore del sistema
// vecchio: **dalla tavolozza non si perde niente**, perché la tavolozza non è
// un magazzino — è una scelta di comodo. Spiazzare un colore non lo butta via.
//
// COS'ERA PRIMA, e perché faceva impazzire. C'era un array `hotbarIds` di nove
// posti, INVISIBILE (il #hotbar stava sotto un display:none dal giorno in cui è
// arrivata la ruota). Prendere un oggetto dallo zaino chiamava una ricerca del
// primo posto libero e, se non ce n'erano, scriveva SOPRA quello che avevi in
// mano — senza dirlo. Risultato: la ruota cambiava contenuto da sola, roba che
// avevi messo lì spariva, e non esisteva modo di vedere né di riordinare quei
// nove posti perché l'unica interfaccia che lo faceva (il trascina-e-lascia in
// ui/hud.js) era codice morto da mesi. Il giocatore doveva tenere a mente una
// cosa che non poteva guardare: ecco l'unico vero "difficile".
//
// LE TRE REGOLE che tengono in piedi tutto:
//  1. NIENTE SPARISCE IN SILENZIO. `prendi()` rende SEMPRE chi ha spiazzato,
//     così chi chiama può dirlo ad alta voce. Non è un dettaglio di cortesia:
//     è la differenza fra "il gioco mi ha rubato una cosa" e "ho capito dove
//     è finita".
//  2. SI PUÒ FISSARE (📌). Un posto fissato non viene mai spiazzato. Chi non
//     configura niente non se ne accorge; chi ci tiene ha il controllo pieno.
//  3. LA ZAMPA È UN OGGETTO COME GLI ALTRI. "Esplora" non è una modalità a
//     parte con un pulsante suo: è ciò che hai in mano quando non hai in mano
//     niente. Sta in un posto, si sposta dove vuoi, e la ruota non ha bisogno
//     di nessun caso speciale — otto spicchi tutti uguali.
//
// PERCHÉ OTTO E NON NOVE. Otto spicchi cadono a 45°, cioè sulle quattro
// direzioni cardinali più le quattro diagonali: le uniche otto direzioni che un
// pollice sa indicare senza guardare. Con nove nessuno spicchio è allineato a
// un asse e il gesto a memoria (ui/ruota.js, la "scelta al volo") diventa un
// tiro a indovinare. Il posto perso non costa niente, perché lo zaino è a un
// tocco: la tavolozza è volutamente stretta, come una tavolozza vera.

/** Quanti posti. Vale anche per gli spicchi della ruota: sono la stessa cosa
 *  vista in due modi, e disallinearli vorrebbe dire due verità diverse. */
export const POSTI = 8;

/**
 * I QUATTRO POSTI BUONI: su, destra, giù, sinistra.
 *
 * Sembrerebbe che con otto spicchi le otto direzioni valgano uguale. Non è
 * così, ed è la cosa più utile emersa studiando la faccenda: nei rilievi sui
 * marking menu i bersagli sugli ASSI si sbagliano nel 2-4% dei casi, quelli
 * sulle DIAGONALI nel 14-18%. Quattro-cinque volte tanto. Una ruota da otto non
 * è "otto voci equivalenti": sono quattro voci ottime e quattro discrete.
 *
 * Da qui una regola piccola con un effetto grande: quando `prendi()` deve
 * trovare posto a una cosa nuova, prima riempie gli assi. Chi gioca senza mai
 * sistemare niente si ritrova le cose che usa di più proprio dove il pollice le
 * azzecca. Non deve saperlo, e non deve fare niente per ottenerlo.
 */
export const CARDINALI = [0, 2, 4, 6];

/** Le mani libere. Un id come gli altri: sta in un posto, si sposta, si
 *  seleziona. Non si può togliere (senza non torneresti mai in esplorazione)
 *  e non si può spiazzare, quindi è fissata per natura. */
export const ZAMPA = 'zampa';

/** Con cosa nasce una tavolozza mai toccata: la zampa e i mattoni del mestiere. */
const INIZIALE = [ZAMPA, 'erba', 'terra', 'roccia', 'legno', 'acqua', 'albero', 'lampione'];

export class Tavolozza {
  constructor(posti = INIZIALE) {
    this.posti = new Array(POSTI).fill(null);
    this.attivo = 0;
    // Marca temporale d'uso per posto: serve a scegliere CHI spiazzare quando
    // la tavolozza è piena. Il meno usato di recente è la scelta meno dolorosa,
    // ed è la stessa euristica delle schede del browser.
    this._uso = new Array(POSTI).fill(0);
    this._orologio = 1;
    this.onCambio = null;
    this._muto = false;
    this._riempi(posti);
  }

  _riempi(ids) {
    for (let i = 0; i < POSTI; i++) {
      const v = ids[i];
      this.posti[i] = v ? (typeof v === 'string' ? { id: v, fissato: false } : { ...v }) : null;
    }
    this._garantisciZampa();
  }

  /** La zampa non può mancare: senza, "torna a esplorare" non esisterebbe più.
   *  Se un salvataggio arriva senza, entra nel primo posto libero — e se non
   *  ce ne sono, prende l'ultimo (chi ci stava resta nello zaino: non si perde). */
  _garantisciZampa() {
    if (this.postoDi(ZAMPA) >= 0) return;
    let i = this.posti.indexOf(null);
    if (i < 0) i = POSTI - 1;
    this.posti[i] = { id: ZAMPA, fissato: true };
  }

  _cambiato() { if (this.onCambio && !this._muto) this.onCambio(); }

  // ---- lettura ---------------------------------------------------------------

  /** La voce in un posto: {id, fissato} oppure null. */
  voce(i) { return this.posti[i] || null; }

  /** L'id in un posto, o null. */
  id(i) { const v = this.posti[i]; return v ? v.id : null; }

  /** Cosa si ha in mano adesso. */
  inMano() { return this.id(this.attivo); }

  /** true se in mano non c'è niente, cioè si sta esplorando. */
  aManiLibere() { return this.inMano() === ZAMPA; }

  /** In che posto sta un oggetto, -1 se non c'è. */
  postoDi(id) {
    for (let i = 0; i < POSTI; i++) if (this.posti[i] && this.posti[i].id === id) return i;
    return -1;
  }

  /** Un posto è protetto dallo spiazzamento? (la zampa lo è sempre) */
  fissato(i) {
    const v = this.posti[i];
    return !!v && (v.fissato || v.id === ZAMPA);
  }

  /** Gli id in ordine di posto, coi buchi come null: è ciò che disegnano sia la
   *  striscia sia la ruota. */
  elenco() { return this.posti.map((v) => (v ? v.id : null)); }

  // ---- scelta ----------------------------------------------------------------

  /** Mette in mano il posto `i`. Rende true se la selezione è cambiata davvero. */
  seleziona(i) {
    if (i < 0 || i >= POSTI) return false;
    const cambia = i !== this.attivo;
    this.attivo = i;
    this._uso[i] = this._orologio++;
    if (cambia) this._cambiato();
    return cambia;
  }

  /** Il giro della rotellina del mouse: avanti/indietro fra i posti PIENI.
   *  Saltare i buchi è ciò che rende il gesto continuo invece che a scatti. */
  scorri(verso) {
    const pieni = [];
    for (let i = 0; i < POSTI; i++) if (this.posti[i]) pieni.push(i);
    if (!pieni.length) return false;
    const dove = pieni.indexOf(this.attivo);
    const p = dove < 0 ? 0 : (dove + (verso > 0 ? 1 : -1) + pieni.length) % pieni.length;
    return this.seleziona(pieni[p]);
  }

  // ---- sistemazione ----------------------------------------------------------

  /**
   * Mette `id` nel posto `i`. Se quell'oggetto era già in un altro posto i due
   * si SCAMBIANO invece di duplicarsi: è la semantica naturale del trascinare
   * (sposto una cosa, quella che c'era va dove stava lei) e rende impossibile
   * per costruzione avere lo stesso oggetto due volte sulla tavolozza.
   */
  metti(i, id) {
    if (i < 0 || i >= POSTI) return false;
    if (!id) return this.svuota(i);
    const j = this.postoDi(id);
    if (j === i) return false;
    const qui = this.posti[i];
    this.posti[i] = j >= 0 ? this.posti[j] : { id, fissato: false };
    if (j >= 0) {
      this.posti[j] = qui;                       // scambio
      const u = this._uso[i]; this._uso[i] = this._uso[j]; this._uso[j] = u;
    }
    this._uso[i] = this._orologio++;
    this._cambiato();
    return true;
  }

  /** Scambia due posti: il riordino per trascinamento sulla striscia. */
  scambia(a, b) {
    if (a === b || a < 0 || b < 0 || a >= POSTI || b >= POSTI) return false;
    const t = this.posti[a]; this.posti[a] = this.posti[b]; this.posti[b] = t;
    const u = this._uso[a]; this._uso[a] = this._uso[b]; this._uso[b] = u;
    // l'attivo segue l'oggetto, non il posto: hai spostato ciò che avevi in
    // mano, e in mano deve restare quello — non ciò che gli è finito sotto
    if (this.attivo === a) this.attivo = b;
    else if (this.attivo === b) this.attivo = a;
    this._cambiato();
    return true;
  }

  /** Libera un posto. La zampa non si toglie: resterebbe un gioco senza modo
   *  di tornare a esplorare. */
  svuota(i) {
    if (i < 0 || i >= POSTI || !this.posti[i]) return false;
    if (this.posti[i].id === ZAMPA) return false;
    this.posti[i] = null;
    this._cambiato();
    return true;
  }

  /** 📌 Protegge (o libera) un posto dallo spiazzamento automatico. */
  fissa(i, valore) {
    const v = this.posti[i];
    if (!v || v.id === ZAMPA) return false;              // la zampa è già intoccabile
    const nuovo = valore === undefined ? !v.fissato : !!valore;
    if (nuovo === v.fissato) return false;
    v.fissato = nuovo;
    this._cambiato();
    return true;
  }

  // ---- prendere in mano dallo zaino -------------------------------------------

  /**
   * IL GESTO PIÙ FREQUENTE DEL GIOCO: "voglio questo in mano, adesso".
   *
   * Rende sempre un resoconto — `{posto, spiazzato, pieno}` — e il chiamante è
   * TENUTO a raccontarlo. `spiazzato` è l'id che ha lasciato il posto: non è
   * andato perduto (sta nello zaino come prima), ma se non lo si dice il
   * giocatore vede la ruota cambiare da sola. Era esattamente il bug vecchio.
   *
   * L'ordine di scelta del posto:
   *   1. ce l'hai già sulla tavolozza → si seleziona quello, e basta;
   *   2. un posto libero SULL'ASSE (vedi CARDINALI) → quello, perché è dove il
   *      pollice azzecca la direzione quattro volte su cinque in più;
   *   3. un posto libero qualsiasi → il primo;
   *   4. tutti pieni → il NON fissato usato meno di recente;
   *   5. tutti fissati → non si fa niente e si dice perché (`pieno: true`).
   */
  prendi(id) {
    if (!id) return { posto: -1, spiazzato: null, pieno: false };
    const gia = this.postoDi(id);
    if (gia >= 0) { this.seleziona(gia); return { posto: gia, spiazzato: null, pieno: false }; }

    let posto = CARDINALI.find((i) => !this.posti[i]);
    if (posto === undefined) posto = this.posti.indexOf(null);
    if (posto < 0) {
      let vecchio = Infinity;
      for (let i = 0; i < POSTI; i++) {
        if (this.fissato(i)) continue;
        if (this._uso[i] < vecchio) { vecchio = this._uso[i]; posto = i; }
      }
      if (posto < 0) return { posto: -1, spiazzato: null, pieno: true };
    }
    const spiazzato = this.posti[posto] ? this.posti[posto].id : null;
    this.posti[posto] = { id, fissato: false };
    this._uso[posto] = this._orologio++;
    this.attivo = posto;
    this._cambiato();
    return { posto, spiazzato, pieno: false };
  }

  /** Un oggetto che non esiste più (blocco dell'Officina cancellato) va tolto
   *  di mezzo, altrimenti resta un posto che punta al nulla. */
  dimentica(id) {
    const i = this.postoDi(id);
    if (i < 0 || id === ZAMPA) return false;
    this.posti[i] = null;
    if (this.attivo === i) this.attivo = Math.max(0, this.postoDi(ZAMPA));
    this._cambiato();
    return true;
  }

  // ---- salvataggio -------------------------------------------------------------

  serializza() {
    return {
      posti: this.posti.map((v) => (v ? { id: v.id, fissato: !!v.fissato } : null)),
      attivo: this.attivo,
    };
  }

  /**
   * Accetta il formato nuovo e ANCHE il vecchio `['erba','terra',…]` da nove
   * posti, che è ciò che c'è in tutti i salvataggi esistenti. Dal vecchio si
   * tengono i primi sette e la zampa entra in testa: l'ottavo id non si perde,
   * resta nello zaino come ogni altra cosa (è tutto il senso della tavolozza).
   */
  applica(dati) {
    this._muto = true;
    if (Array.isArray(dati)) {
      const ids = dati.filter((x) => typeof x === 'string' && x && x !== ZAMPA);
      this._riempi([ZAMPA, ...ids.slice(0, POSTI - 1)]);
      this.attivo = 0;
    } else if (dati && Array.isArray(dati.posti)) {
      this._riempi(dati.posti);
      this.attivo = Number.isInteger(dati.attivo) ? Math.min(Math.max(dati.attivo, 0), POSTI - 1) : 0;
    } else {
      this._riempi(INIZIALE);
      this.attivo = 0;
    }
    // UNA TAVOLOZZA VUOTA NON SI CONSEGNA A NESSUNO. Un salvataggio può
    // arrivare con la sola zampa — succede davvero: le partite salvate prima di
    // questo sistema hanno una `hotbar: []` — e chi la ricarica si ritrova con
    // niente in mano, senza capire che deve aprire lo zaino per ripartire da
    // zero. Non è un dato corrotto da rifiutare, è una partita da rimettere in
    // piedi: si torna alla dotazione iniziale, che nessuno rimpiange visto che
    // non c'era nulla da conservare.
    if (this.posti.every((v) => !v || v.id === ZAMPA)) {
      const dove = this.postoDi(ZAMPA);
      this._riempi(INIZIALE);
      if (dove > 0) this.scambia(0, dove);      // la zampa resta dove l'aveva messa
      this.attivo = this.postoDi(ZAMPA);
    }
    this._uso = this.posti.map((_, i) => POSTI - i);      // ordine iniziale plausibile
    this._orologio = POSTI + 1;
    this._muto = false;
    this._cambiato();
  }
}
