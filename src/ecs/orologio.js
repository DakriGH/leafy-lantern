// Orologio — il TICK a passo fisso, disaccoppiato dal rendering. È il cuore
// deterministico: la simulazione avanza sempre a scatti uguali (default 1/20s =
// 50ms, come Minecraft) qualunque siano gli fps.
//
// PERCHÉ (pattern "Fix Your Timestep" di Gaffer). Se la fisica avanzasse di dt
// variabile, a 25 fps e a 60 fps la simulazione darebbe risultati diversi: fatale
// per l'AR su dispositivi deboli (dove gli fps ballano) e per il multiplayer (che
// dev'essere riproducibile). Qui il tempo reale si ACCUMULA e si consumano solo
// interi passi fissi; il resto (frazione < passo) diventa ALPHA per interpolare
// la resa e non vedere scatti. Costo della simulazione uguale a 60 o a 25 fps.
//
// TETTO ANTI "SPIRALE DELLA MORTE". Se un frame arriva lunghissimo (scheda in
// secondo piano, GC, breakpoint), l'accumulo chiederebbe decine di tick: eseguirli
// tutti allunga il frame successivo, che ne chiede altri... a valanga. Perciò si
// esegue AL PIÙ maxTick per chiamata e il tempo in eccesso si SCARTA (segnalato in
// tickScartati): meglio un salto temporale che un freeze a spirale.

export const PASSO_DEFAULT = 1 / 20;   // 50 ms, come i "game tick" di Minecraft
export const MAX_TICK_DEFAULT = 5;     // quanti passi al massimo per chiamata

export class Orologio {
  /**
   * @param passoFisso durata di un tick, NELLA STESSA UNITÀ che passerai ad
   *        avanza()/passi() (secondi se passi dt in secondi, ms se in ms).
   * @param maxTick    tetto di passi per chiamata (anti spirale della morte).
   */
  constructor(passoFisso = PASSO_DEFAULT, maxTick = MAX_TICK_DEFAULT) {
    if (!(passoFisso > 0)) throw new Error('Orologio: passoFisso deve essere > 0');
    this.passoFisso = passoFisso;
    this.maxTick = Math.max(1, maxTick | 0);
    this.accumulatore = 0;
    this.tickCorrente = 0;     // contatore INTERO monotono: il timestamp logico dei comandi
    this.tickScartati = 0;     // quanti passi buttati dal tetto (per diagnostica)
  }

  /**
   * Deposita `dtReale` e ritorna QUANTI passi fissi vanno eseguiti adesso,
   * avanzando tickCorrente di altrettanto. dt negativi o assurdi si ignorano.
   * Se il tetto scatta, il tempo in eccesso viene scartato (vedi tickScartati)
   * e l'accumulatore resta < passoFisso, così alpha() resta valido.
   */
  avanza(dtReale) {
    if (!(dtReale > 0)) return 0;             // NaN, negativi, 0 → niente
    this.accumulatore += dtReale;
    // EPSILON: senza, 3×0.05 sommati in floating danno 0.1499…9 < 0.15 e si
    // perderebbe un tick su un multiplo esatto. Peggio: il conteggio dei tick
    // dipenderebbe da COME il tempo è spezzato nei frame (0.15 in un colpo vs
    // 0.05×3), rompendo l'indipendenza dagli fps che è tutto il punto. Una
    // tolleranza relativa minuscola ripara i multipli quasi-esatti senza mai
    // anticipare un tick vero.
    const eps = this.passoFisso * 1e-9;
    let n = 0;
    while (this.accumulatore + eps >= this.passoFisso) {
      if (n >= this.maxTick) {
        // tetto raggiunto ma c'è ancora tempo in coda: lo scartiamo tutto e
        // teniamo solo la frazione, altrimenti al prossimo giro rientrerebbe.
        const perse = Math.floor((this.accumulatore + eps) / this.passoFisso);
        this.tickScartati += perse;
        this.accumulatore -= perse * this.passoFisso;   // ora < passoFisso
        if (this.accumulatore < 0) this.accumulatore = 0;
        break;
      }
      this.accumulatore -= this.passoFisso;
      if (this.accumulatore < 0) this.accumulatore = 0;  // pulizia del residuo float negativo
      this.tickCorrente++;
      n++;
    }
    return n;
  }

  /**
   * Come avanza(), ma esegue `esegui(tick)` UNA volta per ogni passo dovuto,
   * col numero di tick assoluto — comodo per far girare i sistemi e scaricare
   * l'agenda a quel tick preciso. Torna il numero di passi eseguiti.
   */
  passi(dtReale, esegui) {
    const prima = this.tickCorrente;
    const n = this.avanza(dtReale);
    for (let t = prima + 1; t <= this.tickCorrente; t++) esegui(t);
    return n;
  }

  /** Frazione [0,1) dell'accumulatore sul passo: il fattore d'interpolazione. */
  alpha() { return this.accumulatore / this.passoFisso; }

  /** Riporta l'orologio all'origine (per un nuovo mondo o un load). */
  azzera() { this.accumulatore = 0; this.tickCorrente = 0; this.tickScartati = 0; }
}

// --- PRNG deterministico -----------------------------------------------------
// mulberry32: piccolo, veloce, con stato di un solo uint32, qualità più che
// sufficiente per la logica di gioco (non è crittografia). NIENTE Math.random
// nella simulazione: lo stesso seme deve dare la STESSA sequenza su ogni
// dispositivo, o addio determinismo e addio multiplayer riproducibile.
//
// Lo stato è pubblico e serializzabile (uno uint32): salvandolo/ripristinandolo
// la sequenza riprende identica dopo un load.

export class Rng {
  /** @param seme intero (verrà forzato a uint32). Stesso seme → stessa serie. */
  constructor(seme = 1) { this.s = seme >>> 0; }

  /** Prossimo float in [0,1). */
  prossimo() {
    // mulberry32
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Intero in [0, max) (max escluso). */
  intero(max) { return Math.floor(this.prossimo() * max); }

  /** Float in [a, b). */
  range(a, b) { return a + this.prossimo() * (b - a); }

  /** Lo stato corrente (uint32), da salvare per riprendere la sequenza. */
  stato() { return this.s >>> 0; }

  /** Ripristina uno stato salvato: la sequenza riparte da lì. */
  ripristina(stato) { this.s = stato >>> 0; return this; }

  /**
   * Deriva un sotto-generatore DETERMINISTICO da un "sale" (es. l'id di
   * un'entità): stesso stato + stesso sale → stesso sotto-rng, ovunque. Utile
   * per dare a ogni macchina la sua sequenza senza consumare quella globale.
   */
  diramazione(sale) {
    return new Rng((this.s ^ Math.imul(sale >>> 0, 0x9e3779b1)) >>> 0);
  }
}
