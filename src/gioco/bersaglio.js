// DOVE si costruisce: modulo PURO (niente three.js, niente DOM, niente stato
// globale) così è testabile da solo in Node e riusabile ovunque.
//
// Perché esiste: i tasti touch sparavano un raggio dal centro dello schermo,
// ma il gatto non sta al centro (la camera orbita) ⇒ si costruiva a caso. Qui
// il bersaglio si deriva SOLO da posizione + sguardo + posa scelta.
//
//   const b = new Bersaglio();
//   b.sguardoDa(velX, velZ);        // nel loop
//   b.cella(pos)                    // → [x, y, z] su cui agire

/** Le pose disponibili. `avanti` = passi in avanti · `su` = scarto verticale. */
export const POSE = [
  { id: 'davanti',      icona: '🧱', nome: 'Davanti',       avanti: 1, su: 0 },
  { id: 'davantiSopra', icona: '↗',  nome: 'Davanti sopra', avanti: 1, su: 1 },
  { id: 'davantiSotto', icona: '↘',  nome: 'Davanti sotto', avanti: 1, su: -1 },
  { id: 'sotto',        icona: '⤓',  nome: 'Sotto di te',   avanti: 0, su: -1 },
  { id: 'sopra',        icona: '⤒',  nome: 'Sopra di te',   avanti: 0, su: 2 },
];

const VELOCITA_MINIMA = 0.6;      // sotto questa soglia lo sguardo non cambia

export class Bersaglio {
  constructor(posa = 'davanti') {
    this.guardo = { x: 0, z: -1 };   // ultima direzione guardata (persiste da fermo)
    this.posa = posa;
  }

  /** La posa attiva (oggetto della tabella POSE). */
  get posaCorrente() {
    return POSE.find((p) => p.id === this.posa) || POSE[0];
  }

  /** Aggiorna lo sguardo dalla velocità: da fermo resta l'ultima direzione. */
  sguardoDa(vx, vz) {
    const m = Math.hypot(vx, vz);
    if (m > VELOCITA_MINIMA) { this.guardo.x = vx / m; this.guardo.z = vz / m; }
    return this.guardo;
  }

  /** Imposta lo sguardo da un vettore qualunque (es. il gatto seduto che gira). */
  sguardoVerso(x, z) {
    const m = Math.hypot(x, z);
    if (m > 0.01) { this.guardo.x = x / m; this.guardo.z = z / m; }
    return this.guardo;
  }

  /** Direzione CARDINALE: su una griglia a voxel è l'unica prevedibile. */
  get cardinale() {
    const g = this.guardo;
    const dx = Math.abs(g.x) >= Math.abs(g.z) ? Math.sign(g.x) : 0;
    const dz = dx === 0 ? (Math.sign(g.z) || -1) : 0;
    return { dx, dz };
  }

  /** La cella su cui agire, dato il centro del giocatore. */
  cella(pos) {
    const { dx, dz } = this.cardinale;
    const q = this.posaCorrente;
    return [
      Math.floor(pos.x) + dx * q.avanti,
      Math.floor(pos.y + 0.1) + q.su,
      Math.floor(pos.z) + dz * q.avanti,
    ];
  }
}
