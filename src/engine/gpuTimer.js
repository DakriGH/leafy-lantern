// MISURA IL TEMPO GPU VERO, indipendente dal vsync — l'unico modo di sapere
// quanto costa DAVVERO ogni passata su una macchina debole.
//
// PERCHÉ SERVE. Su una RTX il render principale costa meno di 1 ms e sotto vsync
// (144 Hz) il tempo GPU non si vede: il browser aspetta il refresh e riporta
// sempre "16.6 ms" o giù di lì. Le TIMER QUERY di WebGL2
// (EXT_disjoint_timer_query_webgl2) misurano invece il tempo che la GPU passa
// dentro un intervallo di comandi, refresh o no. È così che si separa il costo
// del riflesso da quello dell'acqua da quello del tilt-shift.
//
// IL TIMER È ASINCRONO, e questo è tutto il disegno del modulo: quando si chiude
// una query il risultato NON è pronto — arriva qualche frame dopo. Quindi si
// tiene un pool di oggetti-query "in volo" e a ogni frame si raccolgono quelli
// diventati leggibili (QUERY_RESULT_AVAILABLE), scartando l'intero raccolto se la
// GPU segnala GPU_DISJOINT_EXT (un cambio di frequenza/contesto rende i numeri di
// quel giro senza senso).
//
// UNA SOLA QUERY TIME_ELAPSED ALLA VOLTA: WebGL2 non permette di annidarle. Le
// passate del gioco sono però SEQUENZIALI (riflesso, poi schiuma, poi il render
// principale), quindi si aprono e chiudono una per volta e il totale è la loro
// somma — niente query "attorno a tutto" che dovrebbe contenere le altre.
//
// LA PARTE PURA (Campioni: ring buffer + media/mediana/p95) non tocca WebGL ed è
// testata in Node (test/gpu-timer.test.mjs). La classe GpuProfiler è il guscio
// GL, che un contesto vero lo pretende e in Node non si prova.

/**
 * Ring buffer di campioni in millisecondi, con le statistiche che servono a
 * leggere una prestazione: la media (tendenza), la mediana (robusta agli
 * sbalzi) e il p95 (i frame CATTIVI, che sono quelli che si notano giocando).
 *
 * PARTE PURA: nessun WebGL, nessun DOM. Si prova per intero in Node.
 */
export class Campioni {
  constructor(capienza = 120) {
    this.capienza = Math.max(1, capienza | 0);
    this.buf = new Float64Array(this.capienza);
    this.n = 0;          // quanti campioni validi (satura a capienza)
    this.i = 0;          // prossimo indice di scrittura (ring)
  }

  /** Aggiunge un campione. Scarta NaN e negativi (una query disgiunta o rotta
   *  non deve inquinare la media). */
  push(v) {
    if (typeof v !== 'number' || !(v >= 0)) return false;
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.capienza;
    if (this.n < this.capienza) this.n++;
    return true;
  }

  get vuoto() { return this.n === 0; }

  media() {
    if (this.n === 0) return 0;
    let s = 0;
    for (let k = 0; k < this.n; k++) s += this.buf[k];
    return s / this.n;
  }

  // copia ordinata dei soli campioni validi (mediana/percentili non distruttivi)
  _ordinati() {
    const a = new Array(this.n);
    for (let k = 0; k < this.n; k++) a[k] = this.buf[k];
    a.sort((x, y) => x - y);
    return a;
  }

  /** Percentile p in [0,100], con interpolazione lineare fra i due ranghi
   *  vicini — così p50 di due campioni è la loro media, non uno dei due. */
  percentile(p) {
    if (this.n === 0) return 0;
    const a = this._ordinati();
    if (a.length === 1) return a[0];
    const q = Math.min(100, Math.max(0, p));
    const idx = (q / 100) * (a.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return a[lo];
    return a[lo] + (a[hi] - a[lo]) * (idx - lo);
  }

  mediana() { return this.percentile(50); }
  p95() { return this.percentile(95); }

  azzera() { this.n = 0; this.i = 0; }
}

/**
 * Guscio WebGL2 attorno alle timer query. Misura regioni NOMINATE del frame
 * (una passata di rendering per nome) e ne tiene le statistiche in un Campioni
 * per nome.
 *
 * COSTA QUASI NULLA DA SPENTO: se `attivo` è false, inizia()/fine()/regione()
 * escono al primo confronto e non si crea nemmeno una query. È il requisito
 * dell'overlay — acceso solo quando il committente lo chiede.
 */
export class GpuProfiler {
  /** @param {WebGL2RenderingContext} gl  contesto corrente (può cambiare in AR) */
  constructor(gl = null, { capienza = 120, nomi = [] } = {}) {
    this.capienza = capienza;
    this.campioni = new Map();
    for (const n of nomi) this.campioni.set(n, new Campioni(capienza));
    this.attivo = false;
    this._libere = [];        // pool di oggetti query riusabili (del contesto corrente)
    this._volo = [];          // { nome, query } emessi, in attesa del risultato
    this._apertaNome = null;  // regione TIME_ELAPSED attualmente aperta (niente nesting)
    this._query = null;
    this.gl = null;
    this.ext = null;
    this.disponibile = false;
    if (gl) this.usaContesto(gl);
  }

  /** Lega (o ri-lega) il contesto GL. In AR il render passa per il renderer di
   *  MindAR, che è un ALTRO contesto: gli oggetti-query del vecchio non valgono
   *  più, quindi si scarta tutto ciò che è in volo e si ri-chiede l'estensione. */
  usaContesto(gl) {
    if (gl === this.gl) return;
    this._scarta();
    this._libere.length = 0;       // le query appartengono al vecchio contesto
    this.gl = gl || null;
    try { this.ext = gl ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null; }
    catch { this.ext = null; }
    this.disponibile = !!this.ext;
    if (this.attivo && !this.disponibile) this.attivo = false;
  }

  /** Accende/spegne. Da spento libera i query in volo e non misura più niente. */
  imposta(attivo) {
    const vuole = !!attivo;
    if (vuole && !this.disponibile) { this.attivo = false; return false; }
    this.attivo = vuole;
    if (!vuole) this._scarta();
    return this.attivo;
  }

  _campioniDi(nome) {
    let c = this.campioni.get(nome);
    if (!c) { c = new Campioni(this.capienza); this.campioni.set(nome, c); }
    return c;
  }

  // chiude una regione eventualmente aperta e ricicla i query in volo, senza
  // provare a leggerne il risultato (serve allo spegnimento e al cambio contesto)
  _scarta() {
    if (this._apertaNome && this.ext && this.gl) {
      try { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); } catch { /* pazienza */ }
    }
    this._apertaNome = null;
    this._query = null;
    if (this._volo.length) {
      for (const v of this._volo) this._libere.push(v.query);
      this._volo.length = 0;
    }
  }

  /** Apre la misura della passata `nome`. Ignorata se un'altra è già aperta
   *  (le timer query non si annidano) o se il profiler è spento. */
  inizia(nome) {
    if (!this.attivo || this._apertaNome) return;
    const gl = this.gl;
    const q = this._libere.pop() || gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this._apertaNome = nome;
    this._query = q;
  }

  /** Chiude la passata `nome` (solo se è quella aperta). */
  fine(nome) {
    if (!this.attivo || this._apertaNome !== nome) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this._volo.push({ nome, query: this._query });
    this._apertaNome = null;
    this._query = null;
  }

  /** Comodo: misura `fn` come passata `nome`. Da spento è solo `fn()`. */
  regione(nome, fn) {
    if (!this.attivo) return fn();
    this.inizia(nome);
    try { return fn(); }
    finally { this.fine(nome); }
  }

  /**
   * Da chiamare una volta per frame, DOPO aver chiuso tutte le regioni: raccoglie
   * i risultati diventati leggibili. I query si risolvono NELL'ORDINE di emissione,
   * quindi appena il più vecchio non è pronto ci si ferma. Se la GPU è disgiunta
   * (GPU_DISJOINT_EXT) i numeri di questo giro non hanno senso: si riciclano le
   * query senza leggerle.
   */
  raccogli() {
    if (!this.attivo || !this.ext) return;
    const gl = this.gl;
    const disgiunto = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this._volo.length) {
      const v = this._volo[0];
      let pronto = false;
      try { pronto = gl.getQueryParameter(v.query, gl.QUERY_RESULT_AVAILABLE); }
      catch { pronto = false; }
      if (!pronto) break;
      this._volo.shift();
      if (!disgiunto) {
        let ns = 0;
        try { ns = gl.getQueryParameter(v.query, gl.QUERY_RESULT); } catch { ns = 0; }
        this._campioniDi(v.nome).push(Number(ns) / 1e6);   // nanosecondi → ms
      }
      this._libere.push(v.query);
    }
  }

  /** Svuota le statistiche (fra due scenari di misura). */
  azzera() { for (const c of this.campioni.values()) c.azzera(); }

  /** Ripartizione corrente per passata + totale (somma delle medie), per l'overlay. */
  statistiche() {
    const out = { passate: {}, totaleMedia: 0, totaleP95: 0 };
    for (const [nome, c] of this.campioni) {
      out.passate[nome] = { media: c.media(), mediana: c.mediana(), p95: c.p95(), n: c.n };
      out.totaleMedia += c.media();
      out.totaleP95 += c.p95();
    }
    return out;
  }
}
