// Audio PROCEDURALE (Web Audio): niente file — tutto sintetizzato, così
// l'APK resta leggero e funziona offline. Due livelli:
//  · SFX: eventi brevi (piazza, rompi, passo, salto, atterra, splash, nuota,
//    lampione, palla, siedi, raccogli, crea, apri/chiudi, ui, errore, miao)
//  · AMBIENTE: brezza naturale (rumore filtrato che respira) + uccellini di
//    giorno / grilli di notte. NIENTE musica di sottofondo (era invadente).
// Un RIVERBERO leggero (convolver) dà spazio agli effetti così non suonano
// secchi. L'AudioContext parte SOSPESO (regola browser): si sblocca al 1° tocco.

const rnd = (a, b) => a + Math.random() * (b - a);
// scala pentatonica per i suoni "belli" (raccogli/crea/lampione): mai stonati
const semi = (n) => 440 * Math.pow(2, n / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.pronto = false;
    this.volume = 0.6;
    this.mutoTutto = false;
    this._notte = 0;
    this._passoAlt = 0;   // alterna il piede per variare i passi
  }

  /** Da chiamare al PRIMO gesto utente (i browser bloccano l'audio prima). */
  sblocca() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = this.mutoTutto ? 0 : this.volume;
      this.master.connect(ctx.destination);

      // bus effetti + bus ambiente
      this.busSfx = ctx.createGain(); this.busSfx.gain.value = 0.9; this.busSfx.connect(this.master);
      this.busAmb = ctx.createGain(); this.busAmb.gain.value = 0.0; this.busAmb.connect(this.master);

      // RIVERBERO: manda una copia di sfx+amb nel convolver → un filo di coda
      const conv = ctx.createConvolver(); conv.buffer = this._impulso(1.1, 3.4);
      this.wet = ctx.createGain(); this.wet.gain.value = 0.22;
      conv.connect(this.wet); this.wet.connect(this.master);
      this.busSfx.connect(conv);
      this.busAmb.connect(conv);

      this._creaBrezza();
      this.pronto = true;
    } catch (e) { console.warn('[lantern] audio non disponibile', e); }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.mutoTutto ? 0 : v; }
  muto(v) { this.mutoTutto = v; if (this.master) this.master.gain.value = v ? 0 : this.volume; }

  // ---- mattoni: impulso riverbero, oscillatore con inviluppo, rumore -----------
  _impulso(dur, decay) {
    const rate = this.ctx.sampleRate, n = Math.floor(rate * dur);
    const imp = this.ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return imp;
  }

  // una voce a oscillatore con inviluppo A/D e glide opzionale
  _osc(f, { tipo = 'sine', dur = 0.15, vol = 0.3, atk = 0.006, glide = null, pan = 0, dest = null } = {}) {
    if (!this.pronto) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = g;
    if (pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); last = p; }
    o.connect(g); last.connect(dest || this.busSfx);
    o.start(t); o.stop(t + dur + 0.03);
  }

  // burst di rumore filtrato (materiali: terra, pietra, acqua…)
  _rumore(dur, { vol = 0.2, tipo = 'lowpass', freq = 1200, q = 0.6, glide = null, pan = 0, decadi = true, dest = null } = {}) {
    if (!this.pronto) return;
    const t = this.ctx.currentTime, n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (decadi ? Math.pow(1 - i / n, 1.4) : 1);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const fl = this.ctx.createBiquadFilter(); fl.type = tipo; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q;
    if (glide) fl.frequency.exponentialRampToValueAtTime(Math.max(40, glide), t + dur);
    const g = this.ctx.createGain(); g.gain.value = vol;
    let last = g;
    if (pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); last = p; }
    src.connect(fl); fl.connect(g); last.connect(dest || this.busSfx);
    src.start(t);
  }

  // arpeggio corto e pulito (per i suoni gratificanti)
  _arpeggio(semitoni, { tipo = 'triangle', passo = 0.07, dur = 0.16, vol = 0.18 } = {}) {
    semitoni.forEach((s, i) => setTimeout(() => this._osc(semi(s), { tipo, dur, vol, atk: 0.004 }), i * passo * 1000));
  }

  // ---- SFX -------------------------------------------------------------------
  /** Un SFX per nome (chiamato dagli eventi di gioco). */
  sfx(nome) {
    if (!this.pronto) return;
    switch (nome) {
      case 'piazza':  // "top" morbido di posa + zolletta
        this._osc(rnd(150, 175), { tipo: 'triangle', dur: 0.12, vol: 0.22, glide: 90 });
        this._rumore(0.06, { vol: 0.12, tipo: 'lowpass', freq: rnd(700, 1000) });
        break;
      case 'rompi':   // frantumazione croccante + tonfo grave
        this._rumore(0.16, { vol: 0.24, tipo: 'bandpass', freq: rnd(1300, 1800), q: 0.9 });
        this._rumore(0.09, { vol: 0.12, tipo: 'lowpass', freq: 500, pan: rnd(-0.2, 0.2) });
        this._osc(rnd(80, 110), { tipo: 'square', dur: 0.09, vol: 0.1, glide: 55 });
        break;
      case 'passo': { // passo felpato, alterna piede (pan) e pitch
        this._passoAlt ^= 1;
        this._rumore(0.05, { vol: 0.06, tipo: 'lowpass', freq: rnd(320, 430), pan: this._passoAlt ? 0.25 : -0.25 });
        break;
      }
      case 'salto':   // stacco: piccolo "hop" ascendente
        this._osc(300, { tipo: 'sine', dur: 0.14, vol: 0.16, glide: 560 });
        break;
      case 'atterra': // tonfo morbido di atterraggio
        this._rumore(0.1, { vol: 0.16, tipo: 'lowpass', freq: 260 });
        this._osc(150, { tipo: 'sine', dur: 0.1, vol: 0.12, glide: 90 });
        break;
      case 'splash':  // tuffo: sweep d'acqua + bollicine
        this._rumore(0.26, { vol: 0.22, tipo: 'bandpass', freq: 700, q: 0.8, glide: 2600 });
        this._osc(520, { tipo: 'sine', dur: 0.12, vol: 0.08, glide: 900 });
        break;
      case 'nuota':   // bracciata: fruscio d'acqua breve e panato
        this._rumore(0.16, { vol: 0.08, tipo: 'bandpass', freq: 900, q: 0.7, glide: 1500, pan: rnd(-0.35, 0.35) });
        break;
      case 'lampione': // click interruttore + bagliore a due note calde
        this._rumore(0.03, { vol: 0.1, tipo: 'highpass', freq: 2000 });
        this._osc(semi(7), { tipo: 'sine', dur: 0.22, vol: 0.14, atk: 0.01 });
        this._osc(semi(12), { tipo: 'sine', dur: 0.28, vol: 0.09, atk: 0.02 });
        break;
      case 'palla':   // calcio: "tock" con corpo che scende
        this._osc(rnd(300, 360), { tipo: 'triangle', dur: 0.14, vol: 0.24, glide: 150 });
        this._rumore(0.03, { vol: 0.08, tipo: 'lowpass', freq: 1400 });
        break;
      case 'siedi':   // sedersi: soffio basso di cuscino
        this._rumore(0.18, { vol: 0.1, tipo: 'lowpass', freq: 420, glide: 240 });
        this._osc(140, { tipo: 'sine', dur: 0.16, vol: 0.08, glide: 100 });
        break;
      case 'raccogli': // raccolta: scintilla ascendente a due note
        this._arpeggio([12, 19], { tipo: 'triangle', passo: 0.05, dur: 0.12, vol: 0.16 });
        break;
      case 'crea':    // crafting riuscito: triade maggiore breve (gratificante)
        this._arpeggio([12, 16, 19, 24], { tipo: 'triangle', passo: 0.06, dur: 0.18, vol: 0.15 });
        break;
      case 'apri':    // pannello che si apre: soffio ascendente + blip
        this._rumore(0.14, { vol: 0.05, tipo: 'bandpass', freq: 500, q: 0.6, glide: 1400 });
        this._osc(semi(4), { tipo: 'sine', dur: 0.09, vol: 0.08 });
        break;
      case 'chiudi':  // pannello che si chiude: blip discendente
        this._osc(semi(4), { tipo: 'sine', dur: 0.1, vol: 0.08, glide: semi(-3) });
        break;
      case 'ui':      // click leggero d'interfaccia
        this._osc(semi(16), { tipo: 'sine', dur: 0.05, vol: 0.1 });
        break;
      case 'errore':  // errore gentile (non stridulo)
        this._osc(200, { tipo: 'sawtooth', dur: 0.16, vol: 0.1, glide: 150, dest: this._filtroErr() });
        this._osc(150, { tipo: 'sine', dur: 0.18, vol: 0.08, glide: 110 });
        break;
      case 'miao': {  // versetto del gatto (piegatura di pitch a due formanti)
        const b = rnd(520, 620);
        this._osc(b, { tipo: 'sawtooth', dur: 0.28, vol: 0.12, glide: b * 1.5, dest: this._filtroErr(900) });
        break;
      }
    }
  }
  // lowpass "morbido" per addolcire il sawtooth di errore/miao
  _filtroErr(freq = 700) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = 0.5;
    f.connect(this.busSfx); return f;
  }

  // ---- AMBIENTE: brezza + fauna ----------------------------------------------
  _creaBrezza() {
    const ctx = this.ctx, t = ctx.currentTime;
    // rumore in loop (2s) → lowpass che respira = vento leggero
    const n = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 420; fl.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.12;
    src.connect(fl); fl.connect(g); g.connect(this.busAmb);
    src.start(t);
    // LFO lentissimo sul taglio del filtro → il vento "respira"
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 160;
    lfo.connect(lg); lg.connect(fl.frequency); lfo.start(t);
  }

  /** Dal loop: `notte` 0..1 sfuma l'ambiente e sceglie uccellini/grilli. */
  aggiorna(dt, notte) {
    if (!this.pronto) return;
    this._notte = notte;
    // il vento cala di notte; l'ambiente entra dolcemente
    this.busAmb.gain.setTargetAtTime(notte < 0.5 ? 0.5 : 0.34, this.ctx.currentTime, 1.5);
    // fauna: colpi radi e randomici, panati per dare larghezza
    const p = rnd(-0.5, 0.5);
    if (notte < 0.5) {
      if (Math.random() < dt * 0.5) {   // cinguettio: 2-3 note pentatoniche rapide
        const base = 24 + (Math.random() * 3 | 0) * 2;
        this._osc(semi(base), { tipo: 'sine', dur: 0.08, vol: 0.05, glide: semi(base + 4), pan: p });
        if (Math.random() < 0.6) setTimeout(() => this._osc(semi(base + 3), { tipo: 'sine', dur: 0.07, vol: 0.04, pan: p }), 90);
      }
    } else {
      if (Math.random() < dt * 0.7) {   // grillo: trillo cortissimo
        this._osc(semi(28), { tipo: 'triangle', dur: 0.03, vol: 0.025, pan: p });
        setTimeout(() => this._osc(semi(28), { tipo: 'triangle', dur: 0.03, vol: 0.025, pan: p }), 45);
      }
    }
  }
}
