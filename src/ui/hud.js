// HUD — quel che resta dopo la tavolozza: pillola modalità, orologio col cursore
// del tempo, contafotogrammi, avvisi (toast) e la scheda dell'aiuto.
//
// QUI DENTRO C'ERANO DUE INVENTARI MORTI, e vale la pena dire cosa è successo
// perché è la ragione per cui questo file era lungo il triplo. Il primo era la
// hotbar vera e propria (costruisciHotbar + aggiornaConteggi + seleziona): ha
// smesso di vedersi il giorno in cui è arrivata la ruota, che l'ha nascosta con
// un display:none, ma ha continuato a costruire i suoi nove riquadri a ogni
// ricostruzione — lavoro per nessuno. Il secondo era un menu creativa completo
// (costruisciInventario, _riempiZaino, _riempiBanco, _trascinabile: ~180 righe
// con tanto di trascina-e-lascia fra gli slot) che NON VENIVA PIÙ CHIAMATO da
// nessuno, e che avrebbe lanciato un errore se qualcuno ci avesse provato,
// perché cercava nodi (.zaino-corpo, .zaino-banco) che ui/zaino.js cancellava
// riscrivendo la scheda. Del codice morto non è mai chiaro che è morto: chi
// legge lo conta come funzionalità esistente e ci ragiona sopra.
//
// Adesso l'inventario sta tutto in tre file che si vedono: gioco/tavolozza.js
// (il modello), ui/tavolozza.js (la striscia) e ui/zaino.js (il catalogo).

export class HUD {
  constructor() {
    this.elPilla = document.getElementById('pillaModo');
    this.elOrologio = document.getElementById('orologio');
    this.elFase = document.getElementById('fase');
    this.elBarra = document.getElementById('barraTempo');
    this.elToast = document.getElementById('toast');
    this.elAiuto = document.getElementById('aiuto');
    this.elFps = document.getElementById('fps');
    this.elSuggerimento = document.getElementById('suggerimento');

    this.onModo = null;
    this.onTempo = null;         // (t 0..1) mentre l'utente trascina
    this.trascinandoTempo = false;
    this._timerToast = null;

    this.elPilla.addEventListener('click', () => this.onModo && this.onModo());
    this.elBarra.addEventListener('input', () => {
      this.trascinandoTempo = true;
      if (this.onTempo) this.onTempo(this.elBarra.value / 1000);
    });
    const fineTrascino = () => { this.trascinandoTempo = false; };
    this.elBarra.addEventListener('change', fineTrascino);
    this.elBarra.addEventListener('pointerup', fineTrascino);

    document.getElementById('btnChiudiAiuto').addEventListener('click', () => this.mostraAiuto(false));
  }

  setModo(costruisci) {
    this.elPilla.textContent = costruisci ? '🔨 COSTRUISCI' : '🐾 ESPLORA';
    this.elPilla.classList.toggle('costruisci', costruisci);
    this.elSuggerimento.textContent = costruisci
      ? '1‑8 o rotella scegli · R gira · tasto centrale copia · click dx rimuovi'
      : 'B costruisci · I zaino · H aiuto';
  }

  // Le scritture DOM costano (specie su WebView): si tocca il DOM solo al cambio.
  orologio(testo, emoji, t) {
    if (testo !== this._uTesto) { this._uTesto = testo; this.elOrologio.textContent = testo; }
    if (emoji !== this._uFase) { this._uFase = emoji; this.elFase.textContent = emoji; }
    const v = Math.round(t * 1000);
    if (!this.trascinandoTempo && v !== this._uBarra) { this._uBarra = v; this.elBarra.value = v; }
  }

  /**
   * @param n    fotogrammi al secondo osservati
   * @param ms   millisecondi di LAVORO per fotogramma (CPU + GPU), o 0
   *
   * ⚠ IL SOLO NUMERO DI FPS È FUORVIANTE, ed è costato una delusione: in un
   * browser `requestAnimationFrame` NON PUÒ superare la frequenza dello schermo.
   * Su un pannello a 144 Hz il tetto è 144, e sopra quello si aspetta e basta —
   * quindi «123 fps» può voler dire tanto «il motore arranca» quanto «il motore
   * ha finito in due millisecondi e sta aspettando il monitor». Sono due
   * situazioni opposte e il contatore le scriveva uguali.
   * I millisecondi accanto sciolgono l'ambiguità: 2 ms su un budget di 6,9
   * (144 Hz) vuol dire che il lavoro occupa un terzo scarso del fotogramma.
   */
  fps(n, ms = 0) {
    const testo = ms > 0 ? `${n} fps · ${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms` : `${n} fps`;
    if (n === this._uFps && testo === this._uFpsTesto) return;
    this._uFps = n;
    this._uFpsTesto = testo;
    this.elFps.textContent = testo;
    // semaforo: verde/bianco sopra 50, ambra 30-50, rosso sotto 30 — si capisce
    // se il gioco sta soffrendo senza dover leggere il numero
    const classe = n < 30 ? 'fps-bassi' : n < 50 ? 'fps-medi' : '';
    if (classe !== this._uFpsClasse) {
      this._uFpsClasse = classe;
      this.elFps.className = 'hud' + (classe ? ' ' + classe : '');
    }
  }

  toast(msg, durata = 2200) {
    this.elToast.textContent = msg;
    this.elToast.classList.add('visibile');
    clearTimeout(this._timerToast);
    this._timerToast = setTimeout(() => this.elToast.classList.remove('visibile'), durata);
  }

  mostraAiuto(apri = !this.elAiuto.classList.contains('aperto')) {
    this.elAiuto.classList.toggle('aperto', apri);
  }
}
