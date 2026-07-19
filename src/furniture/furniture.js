// Gestione dei furni piazzati: validazione (supporto pieno, celle libere),
// occupazione della griglia per fisica/pathfinding, stati con visuale dedicata
// (es. LampostON/OFF.fbx), luce-sfera + ALONI concentrici semitrasparenti
// (finta luce emessa, separata dal fake pointlight), fluttuazione di 1 px.

import * as THREE from 'three';
import { PX } from '../config.js';
import { FURNI, celleOccupate, celleAppoggio, centroide } from './registry.js';
import { defDi } from '../world/blocks.js';
import { creaLuce, rimuoviLuce } from '../fx/materials.js';

let prossimoId = 1;

// aloni condivisi: due gusci concentrici additivi, immuni alla fog —
// grandi e LEGGERI (velature, non palle): richiesta esplicita dell'utente
const GEO_ALONE_1 = new THREE.SphereGeometry(0.42, 24, 16);
const GEO_ALONE_2 = new THREE.SphereGeometry(0.85, 24, 16);
const MAT_ALONE_1 = new THREE.MeshBasicMaterial({
  color: 0xffdf9e, transparent: true, opacity: 0.16, depthWrite: false,
  blending: THREE.AdditiveBlending, fog: false,
});
const MAT_ALONE_2 = new THREE.MeshBasicMaterial({
  color: 0xffd071, transparent: true, opacity: 0.06, depthWrite: false,
  blending: THREE.AdditiveBlending, fog: false,
});

export class Arredo {
  constructor(scena, mondo) {
    this.radice = new THREE.Group();
    scena.add(this.radice);
    this.mondo = mondo;
    this.istanze = [];
    this.onEvento = null;
  }

  /** Controlla se un furni può stare lì. Ritorna {ok, motivo}. */
  puoiPiazzare(defId, cella, rot, controller = null) {
    const def = FURNI[defId];
    const celle = celleOccupate(def, cella, rot);
    for (const [x, y, z] of celle) {
      // l'acqua non blocca: i furni si piazzano anche a mezz'acqua (waterlog)
      const tIn = this.mondo.tipo(x, y, z);
      if (tIn && !defDi(tIn).acqua) return { ok: false, motivo: 'C’è un blocco in mezzo' };
      if (this.mondo.furniIn(x, y, z)) return { ok: false, motivo: 'C’è già un furni' };
      if (controller && controller.occupaCella(x, y, z)) return { ok: false, motivo: 'Ci sei sopra tu!' };
    }
    for (const [x, y, z] of celleAppoggio(def, cella, rot)) {
      if (!this.mondo.solido(x, y - 1, z)) return { ok: false, motivo: 'Serve terreno piano sotto' };
    }
    return { ok: true };
  }

  piazza(defId, cella, rot = 0, silenzioso = false) {
    const def = FURNI[defId];
    if (!def || !def.modello3d) return null;

    const gruppo = new THREE.Group();
    gruppo.position.set(cella[0] + 0.5, cella[1] + PX, cella[2] + 0.5); // fluttua di 1 px
    gruppo.rotation.y = rot * Math.PI / 2;

    const [cX, cZ] = centroide(def);               // multicella: modello sul baricentro
    const off = def.offsetPx || [0, 0, 0];         // calibrazione fine modello↔hitbox
    const posa = (o) => o.position.set(cX + off[0] * PX, off[1] * PX, cZ + off[2] * PX);

    const istanza = {
      id: prossimoId++, defId, def, cella: [...cella], rot,
      stato: 0, manuale: false, gruppo, luce: null, aloni: null, visualiStato: null,
      celle: celleOccupate(def, cella, rot),
    };

    // visuale: una per stato se i tuoi FBX di stato esistono, altrimenti il base
    const usaStati = (def.stati || []).some((s) => s.modello3d);
    if (usaStati) {
      istanza.visualiStato = def.stati.map((s) => {
        const v = (s.modello3d || def.modello3d).clone();
        posa(v);
        v.visible = false;
        gruppo.add(v);
        return v;
      });
    } else {
      const corpo = def.modello3d.clone();
      posa(corpo);
      gruppo.add(corpo);
    }

    // luce-sfera + aloni per gli stati che li prevedono
    const statoConLuce = (def.stati || []).find((s) => s.luce);
    if (statoConLuce) {
      const offL = statoConLuce.luce.offset || [0, 1.8, 0];
      istanza.luce = creaLuce({
        pos: new THREE.Vector3(cella[0] + 0.5 + offL[0], cella[1] + offL[1], cella[2] + 0.5 + offL[2]),
        raggio: statoConLuce.luce.raggio,
        colore: statoConLuce.luce.colore,
        intensita: statoConLuce.luce.intensita,
        ombra: !!statoConLuce.luce.ombra,
        attiva: false,
      });
      const aloni = new THREE.Group();
      const a1 = new THREE.Mesh(GEO_ALONE_1, MAT_ALONE_1);
      const a2 = new THREE.Mesh(GEO_ALONE_2, MAT_ALONE_2);
      a1.renderOrder = 3; a2.renderOrder = 3;
      // MAI nel render specchiato: da sotto il pelo gli aloni additivi sono
      // enormi → lavavano via il riflesso (guardando l'acqua attraverso la luce)
      a1.userData.alone = true; a2.userData.alone = true;
      aloni.add(a1, a2);
      aloni.position.set(offL[0], offL[1] - PX, offL[2]); // locali al gruppo (già alzato di 1 px)
      aloni.visible = false;
      gruppo.add(aloni);
      istanza.aloni = aloni;
    }

    gruppo.traverse((o) => { o.userData.istanza = istanza; });
    this.radice.add(gruppo);
    this.istanze.push(istanza);
    this.mondo.occupaFurni(istanza.celle, istanza);
    this._applicaStato(istanza);
    if (!silenzioso && this.onEvento) this.onEvento({ tipo: 'furniPiazza', defId, cella, rot });
    return istanza;
  }

  _applicaStato(istanza) {
    const stato = istanza.def.stati ? istanza.def.stati[istanza.stato] : null;
    if (istanza.visualiStato) {
      istanza.visualiStato.forEach((v, i) => { v.visible = i === istanza.stato; });
    }
    const accesa = !!(stato && stato.luce);
    // BASTA LA SFERA. Qui si avvisava anche il mesher (onLuce → main.js →
    // verificaLuciFurni), perché la maschera d'occlusione doveva seguire
    // l'interruttore: una lampada spenta che lasciava la sua maschera aperta si
    // vedeva. Con le ombre camminate per-frammento la maschera non esiste —
    // c'è la griglia dei MURI, e un interruttore i muri non li sposta.
    if (istanza.luce) istanza.luce.attiva = accesa;
    if (istanza.aloni) istanza.aloni.visible = accesa;
  }

  setStato(istanza, indice) {
    if (!istanza.def.stati || indice === istanza.stato) return;
    istanza.stato = indice;
    this._applicaStato(istanza);
  }

  /** Click su un furni con stati: alterna (es. lampione Spento/Acceso). */
  alterna(istanza) {
    if (!istanza.def.stati) return false;
    istanza.manuale = true;
    this.setStato(istanza, (istanza.stato + 1) % istanza.def.stati.length);
    if (this.onEvento) this.onEvento({ tipo: 'furniStato', cella: istanza.cella, stato: istanza.stato });
    return true;
  }

  /** Al cambio giorno/notte i furni autoNotte seguono il ciclo. */
  aggiornaNotte(eNotte) {
    for (const ist of this.istanze) {
      if (!ist.def.autoNotte || !ist.def.stati) continue;
      ist.manuale = false;
      this.setStato(ist, eNotte ? 1 : 0);
    }
  }

  rimuoviIn(cella) {
    const ist = this.mondo.furniIn(cella[0], cella[1], cella[2]);
    if (!ist) return false;
    this.rimuovi(ist);
    return true;
  }

  rimuovi(istanza, silenzioso = false) {
    this.mondo.liberaFurni(istanza.celle);
    this.radice.remove(istanza.gruppo);
    if (istanza.luce) rimuoviLuce(istanza.luce);
    const i = this.istanze.indexOf(istanza);
    if (i >= 0) this.istanze.splice(i, 1);
    if (!silenzioso && this.onEvento) this.onEvento({ tipo: 'furniRimuovi', cella: istanza.cella });
  }

  svuota() {
    for (const ist of [...this.istanze]) this.rimuovi(ist, true);
  }

  /** Dal risultato di un raycaster three risale all'istanza. */
  istanzaDa(oggetto) {
    let o = oggetto;
    while (o) {
      if (o.userData && o.userData.istanza) return o.userData.istanza;
      o = o.parent;
    }
    return null;
  }
}
