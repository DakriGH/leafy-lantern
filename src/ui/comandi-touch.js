// Comandi TOUCH per mobile: joystick analogico (WASD) a sinistra + tasti a
// destra (salta, abbassati/scendi, distruggi, piazza/interagisci). Attivabili
// da un flag nelle Impostazioni. Ogni controllo cattura il suo pointer, così
// joystick e tasti funzionano insieme.
//
// Il joystick scrive `input.asseVirtuale = {x, z}` (stessa convenzione dei
// tasti: su = avanti = z negativo, poi Input applica lo yaw della camera).
// Salta/Giù tengono premuti 'Space'/'ShiftLeft' nel Set dei tasti finche'
// il dito e' giu'. Distruggi/Piazza chiamano i callback (click al centro).

export class ComandiTouch {
  constructor(input, { onPiazza, onDistruggi }) {
    this.input = input;
    this.onPiazza = onPiazza;
    this.onDistruggi = onDistruggi;
    this._costruisci();
  }

  mostra(v) { this.root.style.display = v ? 'block' : 'none'; }

  _costruisci() {
    const root = this.root = document.createElement('div');
    root.id = 'comandiTouch';
    root.style.display = 'none';
    // UN SOLO tasto qui: il SALTO. Rompere/piazzare/interagire li fa la bolla
    // (tocco = usa quello che hai in mano), e lo "scendi" non serviva a nulla.
    root.innerHTML = `
      <div class="ct-stick" data-el="stick"><div class="ct-knob" data-el="knob"></div></div>
      <button class="ct-btn ct-salto gel g-lime" data-el="salta" title="Salta">⤴</button>`;
    document.body.appendChild(root);
    const el = (n) => root.querySelector(`[data-el="${n}"]`);

    // ---- joystick ----
    const stick = el('stick'), knob = el('knob');
    let idJoy = null, cx = 0, cy = 0, raggio = 52;
    const aggiornaKnob = (dx, dz) => {
      knob.style.transform = `translate(${dx * raggio}px, ${dz * raggio}px)`;
      this.input.asseVirtuale = (dx || dz) ? { x: dx, z: dz } : null;
    };
    stick.addEventListener('pointerdown', (e) => {
      idJoy = e.pointerId;
      try { stick.setPointerCapture(e.pointerId); } catch { /* ok */ }
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; raggio = r.width / 2;
      muoviJoy(e);
    });
    const muoviJoy = (e) => {
      if (e.pointerId !== idJoy) return;
      let dx = (e.clientX - cx) / raggio, dz = (e.clientY - cy) / raggio;
      const m = Math.hypot(dx, dz);
      if (m > 1) { dx /= m; dz /= m; }
      aggiornaKnob(dx, dz);
    };
    stick.addEventListener('pointermove', muoviJoy);
    const fineJoy = (e) => { if (e.pointerId === idJoy) { idJoy = null; aggiornaKnob(0, 0); } };
    stick.addEventListener('pointerup', fineJoy);
    stick.addEventListener('pointercancel', fineJoy);

    // ---- tasti "tieni premuto" (salto/giù) ----
    const tieni = (elem, codice) => {
      const giu = (e) => { e.preventDefault(); this.input.tasti.add(codice); elem.classList.add('premuto'); };
      const su = () => { this.input.tasti.delete(codice); elem.classList.remove('premuto'); };
      elem.addEventListener('pointerdown', giu);
      elem.addEventListener('pointerup', su);
      elem.addEventListener('pointercancel', su);
      elem.addEventListener('pointerleave', su);
    };
    tieni(el('salta'), 'Space');
  }
}
