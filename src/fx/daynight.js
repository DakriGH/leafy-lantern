// Ciclo giorno/notte: guida cielo, fog, ambiente delle luci-sfera e fase lampioni.
// t ∈ [0,1): 0 mezzanotte · 0.25 alba · 0.5 mezzogiorno · 0.75 tramonto.

import * as THREE from 'three';
import { TEMPO } from '../config.js';
import { impostaAmbiente, impostaTintaCielo } from './materials.js';

// `tinta` = quanto il colore del cielo VIRA l'albedo del terreno (0..1), non
// quanto lo moltiplica. Serve perché una tinta moltiplicativa non può spostare
// la tonalità di un verde saturo: alle 18:00 il cielo era arancione e l'erba
// restava dello stesso verde freddo di mezzogiorno. È alta all'alba e al
// tramonto (le ore in cui la luce HA un colore), bassa a mezzogiorno — dove il
// cielo è quasi bianco e virare troppo laverebbe le tinte dei blocchi.
//
// DA DOVE VENGONO I QUATTRO NUMERI. Non sono tarati a occhio: escono dalla
// SATURAZIONE del cielo di quella chiave, che è poi quanto quel cielo può
// davvero tingere qualcosa.
//  · 0.07 a giorno pieno — #8fd3ff è tenue: qui la tinta serve solo a evitare
//    che le ombre lontane restino grigio-neutre. Sopra ~0.12 i verdi viravano
//    all'azzurro e il prato sembrava lavato.
//  · 0.32 all'alba e 0.34 al tramonto — i due cieli più saturi. Il tramonto
//    prende il valore più alto perché #ff9d6e è più rosso di #ffb787 e la scena
//    è già in penombra, quindi ha meno colore proprio da difendere.
//  · 0.18÷0.20 di notte — il cielo notturno è scuro ma molto blu: sotto 0.15 le
//    superfici restavano grigie sotto un cielo blu (l'incoerenza si vede subito
//    sui muri chiari), sopra 0.25 tutto diventava monocromo blu e le lanterne
//    perdevano il loro contrasto caldo, che è il fenomeno principale della notte.
const CHIAVI = [
  { t: 0.00, cielo: 0x0e1630, ambiente: new THREE.Color(0.32, 0.36, 0.55), fog: 0.030, tinta: 0.18 },
  { t: 0.20, cielo: 0x18204a, ambiente: new THREE.Color(0.36, 0.40, 0.58), fog: 0.028, tinta: 0.18 },
  { t: 0.26, cielo: 0xffb787, ambiente: new THREE.Color(0.92, 0.78, 0.66), fog: 0.020, tinta: 0.32 },
  { t: 0.34, cielo: 0x8fd3ff, ambiente: new THREE.Color(1.04, 1.00, 0.94), fog: 0.012, tinta: 0.07 },
  { t: 0.66, cielo: 0x8fd3ff, ambiente: new THREE.Color(1.04, 1.00, 0.94), fog: 0.012, tinta: 0.07 },
  { t: 0.74, cielo: 0xff9d6e, ambiente: new THREE.Color(0.95, 0.72, 0.58), fog: 0.018, tinta: 0.34 },
  { t: 0.82, cielo: 0x1a2148, ambiente: new THREE.Color(0.38, 0.42, 0.60), fog: 0.028, tinta: 0.20 },
  { t: 1.00, cielo: 0x0e1630, ambiente: new THREE.Color(0.32, 0.36, 0.55), fog: 0.030, tinta: 0.18 },
];

const _cielo = new THREE.Color();
const _ambiente = new THREE.Color();
const _a = new THREE.Color();
const _b = new THREE.Color();
const _tinta = new THREE.Color();

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
    // il colore del cielo PRIMA che il ramo sott'acqua lo viri di blu: quello è
    // un effetto di camera, non l'ora del giorno
    _tinta.copy(_cielo);
    impostaTintaCielo(_tinta, THREE.MathUtils.lerp(k0.tinta, k1.tinta, f));

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

    if (this._eraNotte !== this.eNotte) {
      this._eraNotte = this.eNotte;
      if (this.onFase) this.onFase(this.eNotte);
    }
  }
}
