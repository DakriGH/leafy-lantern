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

  fps(n) {
    if (n === this._uFps) return;
    this._uFps = n;
    this.elFps.textContent = `${n} fps`;
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
