// Ciclo giorno/notte: guida cielo, fog, ambiente delle luci-sfera e fase lampioni.
// t ∈ [0,1): 0 mezzanotte · 0.25 alba · 0.5 mezzogiorno · 0.75 tramonto.

import * as THREE from 'three';
import { TEMPO } from '../config.js?v=ms4didtp';
import { impostaAmbiente, impostaOmbraCielo } from './materials.js?v=ms4didtp';

// `ambiente` È IL GIORNO E LA NOTTE, e non serve altro: lo shader moltiplica
// l'albedo per questo colore e ci somma sopra le luci-sfera. Un tentativo aveva
// aggiunto qui anche una `tinta` che virava l'albedo verso il colore del cielo,
// ma si appoggiava a un canale di luce CIELO cotto nei vertici, e quel canale è
// stato tolto insieme all'occlusione ambientale e all'ombra per faccia: oggi
// l'unico canale cotto è la maschera d'occlusione, che con l'ora non c'entra.
const CHIAVI = [
  { t: 0.00, cielo: 0x0e1630, ambiente: new THREE.Color(0.32, 0.36, 0.55), fog: 0.030 },
  { t: 0.20, cielo: 0x18204a, ambiente: new THREE.Color(0.36, 0.40, 0.58), fog: 0.028 },
  { t: 0.26, cielo: 0xffb787, ambiente: new THREE.Color(0.92, 0.78, 0.66), fog: 0.020 },
  { t: 0.34, cielo: 0x8fd3ff, ambiente: new THREE.Color(1.04, 1.00, 0.94), fog: 0.012 },
  { t: 0.66, cielo: 0x8fd3ff, ambiente: new THREE.Color(1.04, 1.00, 0.94), fog: 0.012 },
  { t: 0.74, cielo: 0xff9d6e, ambiente: new THREE.Color(0.95, 0.72, 0.58), fog: 0.018 },
  { t: 0.82, cielo: 0x1a2148, ambiente: new THREE.Color(0.38, 0.42, 0.60), fog: 0.028 },
  { t: 1.00, cielo: 0x0e1630, ambiente: new THREE.Color(0.32, 0.36, 0.55), fog: 0.030 },
];

const _cielo = new THREE.Color();
const _ambiente = new THREE.Color();
const _sole = new THREE.Vector3();   // direzione verso l'astro, riusata ogni frame
const _a = new THREE.Color();
const _b = new THREE.Color();

export class CicloGiorno {
  constructor(scena) {
    this.scena = scena;
    this.t = TEMPO.inizio;
    this.auto = true;
    this.durata = TEMPO.durataCiclo;
    this.fattoreFog = 1;           // <1 = si vede più lontano (slider Impostazioni)
    this.zoomComp = 1;             // compensa lo zoom: dezoomando la nebbia si apre
    this.sottacqua = false;        // camera immersa: nebbia fitta e blu
    this.onFase = null;            // callback(eNotte) sul cambio giorno/notte
    this._eraNotte = null;
    scena.fog = new THREE.FogExp2(0x8fd3ff, 0.012);
    scena.background = new THREE.Color(0x8fd3ff);
  }

  get eNotte() { return this.t < 0.24 || this.t > 0.78; }

  oraTesto() {
    const ore = this.t * 24;
    const h = Math.floor(ore);
    const m = Math.floor((ore - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  faseEmoji() {
    if (this.eNotte) return '🌙';
    if (this.t < 0.32) return '🌅';
    if (this.t > 0.70) return '🌇';
    return '☀️';
  }

  /**
   * DOVE STA L'ASTRO E QUANTO SCURISCE — l'ombra del cielo (cel shading) la
   * disegna lo shader, ma da dove viene la luce lo decide l'ora.
   *
   * Il sole percorre mezzo giro dall'alba (t 0.25) al tramonto (t 0.75) e la
   * luna fa lo stesso di notte, con la stessa forma di arco: così l'ombra gira
   * lentamente durante la giornata invece di stare inchiodata, che è metà del
   * mestiere di un'ombra.
   *
   * DUE FORZE DIVERSE, ed è una richiesta esplicita: di giorno l'ombra è netta e
   * marcata, di notte è LEGGERA — la luna illumina poco e un'ombra lunare nera
   * come quella di mezzogiorno si legge come un buco. Vicino all'orizzonte
   * (alba e tramonto) la forza scende: con l'astro radente ogni sasso
   * proietterebbe una lama nera lunga tutto lo schermo.
   */
  _astro() {
    const notte = this.eNotte;
    // fase 0..1 dell'arco: di giorno dall'alba al tramonto, di notte l'opposto
    const g = notte ? ((this.t + 0.5) % 1 - 0.25) / 0.5 : (this.t - 0.25) / 0.5;
    const a = Math.PI * Math.min(1, Math.max(0, g));
    const alt = Math.sin(a);                       // 0 all'orizzonte, 1 allo zenit
    _sole.set(Math.cos(a) * 0.75, Math.max(0.05, alt), 0.42);
    // l'astro basso scurisce meno: la rampa è quadratica, così la lama radente
    // dell'alba non compare mai
    const morbido = alt * alt;
    impostaOmbraCielo(_sole, (notte ? 0.16 : 0.42) * morbido);
  }

  aggiorna(dt) {
    if (this.auto) this.t = (this.t + dt / this.durata) % 1;
    // campiona i keyframe
    let i = 0;
    while (i < CHIAVI.length - 2 && CHIAVI[i + 1].t < this.t) i++;
    const k0 = CHIAVI[i], k1 = CHIAVI[i + 1];
    const f = THREE.MathUtils.clamp((this.t - k0.t) / (k1.t - k0.t || 1), 0, 1);

    _cielo.copy(_a.setHex(k0.cielo)).lerp(_b.setHex(k1.cielo), f);
    _ambiente.copy(k0.ambiente).lerp(k1.ambiente, f);
    const fog = THREE.MathUtils.lerp(k0.fog, k1.fog, f);

    // in AR la scena non è nostra: fog tolta e background = video della
    // camera — scrivere qui uccideva il LOOP (null.density → TypeError a ogni
    // frame = "gioco bloccato"). Il tempo continua a scorrere comunque.
    if (this.scena.fog) {
      if (this.sottacqua) {
        _cielo.lerp(_b.setHex(0x1d5e8e), 0.75);
        this.scena.fog.density = Math.max(0.05, fog * 4);
      } else {
        this.scena.fog.density = fog * this.fattoreFog * this.zoomComp;
      }
      this.scena.fog.color.copy(_cielo);
    }
    if (this.scena.background && this.scena.background.isColor) {
      this.scena.background.copy(_cielo);
    }
    impostaAmbiente(_ambiente);
    this._astro();

    if (this._eraNotte !== this.eNotte) {
      this._eraNotte = this.eNotte;
      if (this.onFase) this.onFase(this.eNotte);
    }
  }
}
