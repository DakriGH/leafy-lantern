// Ciclo giorno/notte: guida cielo, fog, ambiente delle luci-sfera e fase lampioni.
// t ∈ [0,1): 0 mezzanotte · 0.25 alba · 0.5 mezzogiorno · 0.75 tramonto.

import * as THREE from 'three';
import { TEMPO } from '../config.js?v=ms889ojq';
import { impostaAmbiente, impostaOmbraCielo } from './materials.js?v=ms889ojq';
import { Cielo } from './cielo.js?v=ms889ojq';

// `ambiente` È IL GIORNO E LA NOTTE, e non serve altro: lo shader moltiplica
// l'albedo per questo colore e ci somma sopra le luci-sfera. Un tentativo aveva
// aggiunto qui anche una `tinta` che virava l'albedo verso il colore del cielo,
// ma si appoggiava a un canale di luce CIELO cotto nei vertici, e quel canale è
// stato tolto insieme all'occlusione ambientale e all'ombra per faccia: oggi
// l'unico canale cotto è la maschera d'occlusione, che con l'ora non c'entra.
// `cielo` è il colore dell'ORIZZONTE e ANCHE quello della nebbia — devono
// coincidere, se no si vede la riga dove il terreno lontano finisce e comincia
// il cielo. `alto` è lo zenit, ed è nuovo: senza, il cielo era una parete di
// tinta piatta. Di giorno il salto è netto (azzurro pallido in basso, blu pieno
// in alto), di notte quasi nullo — un cielo notturno è uniforme, sono le stelle
// a dargli profondità.
const CHIAVI = [
  { t: 0.00, cielo: 0x0e1630, alto: 0x05091c, ambiente: new THREE.Color(0.32, 0.36, 0.55), fog: 0.030 },
  { t: 0.20, cielo: 0x18204a, alto: 0x0a1030, ambiente: new THREE.Color(0.36, 0.40, 0.58), fog: 0.028 },
  { t: 0.26, cielo: 0xffb787, alto: 0x4a5c9e, ambiente: new THREE.Color(0.92, 0.78, 0.66), fog: 0.020 },
  { t: 0.34, cielo: 0x8fd3ff, alto: 0x3a86d6, ambiente: new THREE.Color(1.04, 1.00, 0.94), fog: 0.012 },
  { t: 0.66, cielo: 0x8fd3ff, alto: 0x3a86d6, ambiente: new THREE.Color(1.04, 1.00, 0.94), fog: 0.012 },
  { t: 0.74, cielo: 0xff9d6e, alto: 0x40538f, ambiente: new THREE.Color(0.95, 0.72, 0.58), fog: 0.018 },
  { t: 0.82, cielo: 0x1a2148, alto: 0x0b1132, ambiente: new THREE.Color(0.38, 0.42, 0.60), fog: 0.028 },
  { t: 1.00, cielo: 0x0e1630, alto: 0x05091c, ambiente: new THREE.Color(0.32, 0.36, 0.55), fog: 0.030 },
];

// Quanta ombra resta quando l'astro è appena sopra l'orizzonte, in frazione di
// quella di culmine. Alzarlo rende alba e tramonto più drammatici (ombre lunghe
// e marcate), abbassarlo li appiattisce: a 0 si torna al comportamento vecchio.
const FONDO_OMBRA = 0.32;
// Sotto questa altezza dell'astro il fondo si spegne (vedi `sfuma`): è la
// finestra in cui l'astro sta davvero sorgendo o tramontando.
const ALBA = 0.22;
// LE DUE SOGLIE DEL GIORNO, in un posto solo: le usano sia `eNotte` (che decide
// il colore del cielo e i lampioni) sia l'arco dell'astro. Tenerle separate
// faceva nascere la luna già alta — vedi _astro.
const ALBA_T = 0.24, SERA_T = 0.78;
/** Rampa liscia in [0,1]: agli estremi la derivata è nulla, quindi il congedo
 *  non ha lo scalino che una rampa lineare lascia proprio dove si nota. */
function _liscia(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

const _cielo = new THREE.Color();
const _alto = new THREE.Color();
const _ambiente = new THREE.Color();
const _sole = new THREE.Vector3();   // direzione verso l'astro, riusata ogni frame
const _fatt = new THREE.Color();     // colore dell'ombra, ricomposto ogni frame
const _bianco = new THREE.Color(1, 1, 1);
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
    this.forzaOmbra = 1;           // manopola Impostazioni: quanto scurisce l'ombra del cielo
    this.onFase = null;            // callback(eNotte) sul cambio giorno/notte
    this._eraNotte = null;
    this.cielo = new Cielo(scena); // cupola: gradiente, astro, bagliore, stelle
    this._nottePiena = 0;
    scena.fog = new THREE.FogExp2(0x8fd3ff, 0.012);
    scena.background = new THREE.Color(0x8fd3ff);
  }

  get eNotte() { return this.t < ALBA_T || this.t > SERA_T; }

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
   *
   * ---- PERCHÉ L'ASTRO NON PASSA MAI SOPRA LA TESTA ---------------------------
   * L'arco vero (est → zenit → ovest) qui era SBAGLIATO, e il motivo è che le
   * facce di questo mondo sono allineate agli assi. A mezzogiorno il sole
   * passava esattamente in verticale sul piano X, cioè si metteva PERPENDICOLARE
   * ai due muri rivolti a est e a ovest: perpendicolare vuol dire prodotto
   * scalare zero, cioè il confine esatto fra "al sole" e "in ombra". Con un
   * livello solo e nessuna sfumatura (che è il punto del cel shading) quei due
   * muri saltavano da chiaro a scuro nel giro di pochi minuti di gioco, tutti
   * insieme. Un lampo, non un'alba.
   *
   * Qui l'astro gira in AZIMUT dentro un settore DIAGONALE (45° ± 20°): le due
   * componenti orizzontali restano sempre dello stesso segno e sempre lontane
   * dallo zero, quindi in ogni istante della giornata due facce su quattro sono
   * al sole e due in ombra — stabile, leggibile, e l'ombra gira lo stesso perché
   * il settore è largo 40°. La LUNA prende il settore opposto (225°): di notte
   * le ombre cadono dall'altra parte, ed è la differenza che si vede subito.
   *
   * L'astro si abbassa anche verso l'orizzonte, e lì la componente orizzontale
   * cresce: le ombre si allungano all'alba e al tramonto, che è l'unica cosa che
   * l'occhio chiede davvero a un'ora del giorno.
   */
  _astro() {
    const notte = this.eNotte;
    // FASE 0..1 DELL'ARCO, e i suoi estremi sono ESATTAMENTE gli stessi di
    // `eNotte` (ALBA_T e SERA_T), non due soglie vicine ma diverse. Prima l'arco
    // andava da 0.25 a 0.75 mentre il cambio giorno/notte scattava a 0.24 e 0.78:
    // quindi nell'istante del cambio la luna era già a un decimo del suo arco,
    // cioè con l'ombra a forza NON nulla — e siccome sole e luna stanno su azimut
    // opposti, l'ombra saltava di lato tutta insieme. Facendo combaciare le
    // soglie, l'astro nasce e muore a zero da tutt'e due le parti e il cambio non
    // si vede più: è la stessa idea del fondo che si spegne qui sotto.
    const g = notte
      ? ((this.t + (1 - SERA_T)) % 1) / (1 - (SERA_T - ALBA_T))
      : (this.t - ALBA_T) / (SERA_T - ALBA_T);
    const alt = Math.sin(Math.PI * g);             // 0 all'orizzonte, 1 al culmine
    const az = (notte ? Math.PI * 1.25 : Math.PI * 0.25) + (g - 0.5) * 0.7;
    const oriz = 0.62 + 0.30 * (1 - alt);          // radente = ombre lunghe
    _sole.set(Math.cos(az) * oriz, Math.max(0.12, alt), Math.sin(az) * oriz);

    // QUANTO SCURISCE. La rampa sull'altezza serve a non far comparire la lama
    // radente dell'alba, ma quadratica era troppo: alle nove di mattina lasciava
    // un'ombra da un quarto di tono, cioè un'ombra che non si vede. Con 1.6
    // l'ombra c'è per quasi tutta la giornata.
    //
    // LA RAMPA NON PARTE PIÙ DA ZERO, ed è un difetto che si vedeva solo
    // guardando la giornata intera di fila: alle sette e alle diciassette e mezza
    // `alt^1.6` valeva 0.04, cioè il mondo diventava PIATTO — nessun fianco
    // scuro, nessuna ombra portata, il cubo di pietra con le sei facce dello
    // stesso identico grigio — proprio nelle due ore in cui il cielo è più bello
    // e uno si ferma a guardarlo. Il fondo (32%) tiene il rilievo minimo che fa
    // leggere le forme; il resto della rampa continua a raccontare l'ora.
    // La lama nera di cui aveva paura la versione di prima non può comunque
    // arrivare: la portata dell'ombra è tagliata a uSolePassi BLOCCHI, non a
    // mezzo schermo.
    // `forzaOmbra` è la manopola dell'utente (Impostazioni): moltiplica, non
    // sostituisce, così il rapporto giorno/notte resta quello deciso qui.
    //
    // IL FONDO SI SPEGNE SULL'ORIZZONTE, e non è un ripensamento: il sole e la
    // luna stanno su azimut OPPOSTI, quindi nell'istante in cui il giorno diventa
    // notte le ombre cambiano lato di colpo. Finché lì valevano zero non se ne
    // accorgeva nessuno; con un fondo piatto sarebbe diventato uno scatto in
    // faccia. La finestrella liscia (0 → ALBA) tiene il fondo dove serve — le ore
    // radenti — e lo lascia sparire dove l'astro tramonta davvero.
    const sfuma = _liscia(alt / ALBA);
    const rampa = sfuma * (FONDO_OMBRA + (1 - FONDO_OMBRA) * Math.pow(alt, 1.6));
    const k = Math.min(0.85, (notte ? 0.22 : 0.50) * rampa * this.forzaOmbra);
    // IL COLORE DELL'OMBRA È IL COLORE DEL CIELO. All'ombra non c'è meno luce e
    // basta: c'è la luce del cielo invece di quella del sole, ed è per questo che
    // le ombre vere sono azzurre di giorno e blu notte di notte. Si prende la
    // TINTA del cielo dell'ora (normalizzata sul canale più alto: la luminosità
    // la porta già k, se la prendessi anche da qui scurirebbe due volte) e la si
    // smorza verso il bianco, altrimenti a mezzogiorno l'ombra diventa un cartone
    // azzurro invece dell'erba in ombra.
    const m = Math.max(_cielo.r, _cielo.g, _cielo.b) || 1;
    _fatt.setRGB(_cielo.r / m, _cielo.g / m, _cielo.b / m).lerp(_bianco, 0.55).multiplyScalar(1 - k);
    // la forza è un INTERRUTTORE, non un'intensità: sotto la soglia lo shader non
    // cammina la griglia per niente (e a quel punto l'ombra non si vedrebbe).
    // `k` viaggia con lei perché non è solo l'ombra portata a doverlo sapere:
    // anche le nuvole scalano la loro su questa (materials.forzaAstro).
    impostaOmbraCielo(_sole, k > 0.004 ? 1 : 0, _fatt, k);
  }

  aggiorna(dt) {
    if (this.auto) this.t = (this.t + dt / this.durata) % 1;
    // campiona i keyframe
    let i = 0;
    while (i < CHIAVI.length - 2 && CHIAVI[i + 1].t < this.t) i++;
    const k0 = CHIAVI[i], k1 = CHIAVI[i + 1];
    const f = THREE.MathUtils.clamp((this.t - k0.t) / (k1.t - k0.t || 1), 0, 1);

    _cielo.copy(_a.setHex(k0.cielo)).lerp(_b.setHex(k1.cielo), f);
    _alto.copy(_a.setHex(k0.alto)).lerp(_b.setHex(k1.alto), f);
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
    // LA CUPOLA VIENE DOPO `_astro`, non prima: è lui che scrive la direzione
    // dell'astro, e disegnare il sole dove stava un fotogramma fa non si nota
    // da fermi ma si nota eccome mentre il tempo scorre veloce.
    if (this.cielo) {
      // la notte sfuma invece di scattare: alle soglie ALBA_T/SERA_T il disco
      // passa da sole a luna, e con un interruttore secco le stelle apparivano
      // tutte insieme in un fotogramma
      const notte = this.eNotte ? 1 : 0;
      this._nottePiena += (notte - this._nottePiena) * Math.min(1, dt * 1.5);
      this.cielo.aggiorna(_cielo, _alto, _sole, this._nottePiena);
    }

    if (this._eraNotte !== this.eNotte) {
      this._eraNotte = this.eNotte;
      if (this.onFase) this.onFase(this.eNotte);
    }
  }
}
