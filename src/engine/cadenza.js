// Cadenza — decide QUALI tick dello schermo diventano frame renderizzati.
//
// Il punto delicato: rAF batte al refresh del monitor e basta. Se per limitare
// gli fps si azzera il cronometro a ogni frame reso, si possono ottenere SOLO i
// divisori esatti del refresh: su uno schermo a 90Hz esistono 90, 45, 30, 22.5…
// e chiedere 60 fa cadere a 45 (è il caso segnalato: "70-90 fps lockati a 60
// danno 40-45"). Il difetto non si vede sui monitor a 60Hz, dove 60/30/20 sono
// tutti divisori — ed è per questo che era passato inosservato.
//
// Qui il tempo maturato si ACCUMULA e sul frame reso si sottrae l'intervallo
// tenendo il resto: alternando salti da 1 e 2 tick la media centra il bersaglio
// (a 90Hz: rendi 2 tick su 3 = 60 fps esatti). La tolleranza di mezzo tick fa
// scegliere il tick più VICINO al bersaglio invece del primo che lo supera.

export class Cadenza {
  constructor(fpsMax = 0) {
    this.fpsMax = fpsMax;
    this.accumulo = 0;
    this.tickSchermo = 1000 / 60;   // stima, si autocalibra sui tick veri
  }

  /**
   * @param {number} dTick millisecondi dal tick precedente dello schermo
   * @returns {boolean} true se questo tick va renderizzato
   */
  tick(dTick) {
    // autocalibrazione del passo schermo: si scartano i valori assurdi (primo
    // giro, scheda tornata in primo piano dopo minuti)
    if (dTick > 1 && dTick < 100) this.tickSchermo += (dTick - this.tickSchermo) * 0.1;

    if (!(this.fpsMax > 0)) return true;             // 0 = illimitato

    const intervallo = 1000 / this.fpsMax;
    // se lo schermo è più lento del limite chiesto, il limite non serve: ogni
    // tick va reso (chiedere 120 su un pannello a 60Hz non deve saltare nulla)
    if (this.tickSchermo >= intervallo) return true;

    this.accumulo += dTick;
    if (this.accumulo < intervallo - this.tickSchermo / 2) return false;
    // tetto al resto: senza, una pausa lunga produrrebbe una raffica di frame
    this.accumulo = Math.min(this.accumulo - intervallo, intervallo);
    return true;
  }
}
