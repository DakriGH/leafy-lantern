// Input unificato mouse/touch: distingue click (tap) da trascinamento (orbita),
// gestisce pinch-zoom e la tastiera. Pensato per passare all'AR senza cambiare API.

const SOGLIA_DRAG = 6; // px prima che un tocco diventi orbita
// TOCCO LUNGO: 450 ms è la soglia che il mobile usa da sempre per "dimmi di più
// su questo" (menu contestuali di iOS e Android). Più corta e la si fa per
// sbaglio orbitando piano; più lunga e sembra che non funzioni.
const TOCCO_LUNGO = 450;

export class Input {
  constructor(elemento, rig) {
    this.tasti = new Set();
    this.rig = rig;
    this.onClick = null;        // (x, y, bottone) → click "pulito", non drag
    this.onMuovi = null;        // (x, y) → per il ghost di anteprima
    // (x, y) → tocco TENUTO fermo: il gesto "apri le impostazioni di questo".
    // Se scatta, il pointerup successivo NON diventa un click: un solo gesto
    // deve fare una sola cosa (altrimenti il tocco lungo su una macchina
    // aprirebbe il pannello E farebbe partire l'azione).
    this.onPressione = null;
    this._puntatori = new Map();
    this._drag = false;
    this._inizio = null;
    this._pinchDist = 0;
    this._timerLungo = 0;
    this._lungoFatto = false;

    elemento.addEventListener('pointerdown', (e) => {
      try { elemento.setPointerCapture(e.pointerId); } catch { /* eventi sintetici */ }
      this._puntatori.set(e.pointerId, { x: e.clientX, y: e.clientY, bottone: e.button });
      if (this._puntatori.size === 1) {
        this._drag = false;
        this._inizio = { x: e.clientX, y: e.clientY };
        this._armaLungo(e.clientX, e.clientY, e.button);
      } else if (this._puntatori.size === 2) {
        this._disarmaLungo();                 // due dita = pinch, non pressione
        const [a, b] = [...this._puntatori.values()];
        this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });

    elemento.addEventListener('pointermove', (e) => {
      const p = this._puntatori.get(e.pointerId);
      if (!p) { if (this.onMuovi) this.onMuovi(e.clientX, e.clientY); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;

      if (this._puntatori.size === 2) {
        const [a, b] = [...this._puntatori.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinchDist > 0) this.rig.zoom(this._pinchDist / d);
        this._pinchDist = d;
        return;
      }
      if (!this._drag && this._inizio &&
          Math.hypot(e.clientX - this._inizio.x, e.clientY - this._inizio.y) > SOGLIA_DRAG) {
        this._drag = true;
        this._disarmaLungo();                 // il dito si è mosso: è un'orbita, non una pressione
      }
      if (this._drag) this.rig.orbita(dx, dy);
      if (this.onMuovi) this.onMuovi(e.clientX, e.clientY);
    });

    const fine = (e) => {
      const p = this._puntatori.get(e.pointerId);
      this._puntatori.delete(e.pointerId);
      this._pinchDist = 0;
      this._disarmaLungo();
      // il tocco lungo ha GIÀ agito: il rilascio non deve fare anche il click
      if (p && !this._drag && !this._lungoFatto && this.onClick && e.type === 'pointerup') {
        this.onClick(e.clientX, e.clientY, p.bottone);
      }
      if (this._puntatori.size === 0) { this._drag = false; this._lungoFatto = false; }
    };
    elemento.addEventListener('pointerup', fine);
    elemento.addEventListener('pointercancel', fine);

    elemento.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.rig.zoom(Math.exp(e.deltaY * 0.001));
    }, { passive: false });

    elemento.addEventListener('contextmenu', (e) => e.preventDefault());

    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      this.tasti.add(e.code);
      if (this.onTasto) this.onTasto(e.code, e);
    });
    addEventListener('keyup', (e) => this.tasti.delete(e.code));
    addEventListener('blur', () => this.tasti.clear());
  }

  /** Avvia il conto alla rovescia del tocco lungo (solo tasto sinistro/dito:
   *  col destro si rimuove, e una pressione destra prolungata non significa
   *  niente in nessuna modalità). */
  _armaLungo(x, y, bottone) {
    this._disarmaLungo();
    this._lungoFatto = false;
    if (bottone !== 0) return;
    this._timerLungo = setTimeout(() => {
      this._timerLungo = 0;
      if (this._drag || this._puntatori.size !== 1) return;
      this._lungoFatto = true;
      if (this.onPressione) this.onPressione(x, y);
    }, TOCCO_LUNGO);
  }

  _disarmaLungo() {
    if (this._timerLungo) { clearTimeout(this._timerLungo); this._timerLungo = 0; }
  }

  premuto(...codici) { return codici.some((c) => this.tasti.has(c)); }

  /** Direzione WASD/frecce/JOYSTICK relativa alla camera, {x, z} normalizzato (o null). */
  direzione() {
    let ax = 0, az = 0;
    if (this.premuto('KeyW', 'ArrowUp')) az -= 1;
    if (this.premuto('KeyS', 'ArrowDown')) az += 1;
    if (this.premuto('KeyA', 'ArrowLeft')) ax -= 1;
    if (this.premuto('KeyD', 'ArrowRight')) ax += 1;
    // joystick virtuale (comandi touch): stessa convenzione, su = avanti
    if (this.asseVirtuale) { ax += this.asseVirtuale.x; az += this.asseVirtuale.z; }
    if (!ax && !az) return null;
    const yaw = this.rig.yaw;
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    // avanti = dalla camera verso il bersaglio (proiettato sul piano)
    const x = ax * cos + az * sin;
    const z = az * cos - ax * sin;
    const n = Math.hypot(x, z);
    return { x: x / n, z: z / n };
  }
}
