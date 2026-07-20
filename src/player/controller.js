// Fisica del player (AABB vs griglia, per asse) + i due movimenti:
// WASD/salto manuale e click-to-move che consuma il percorso dell'A*.

import * as THREE from 'three';
import { FISICA } from '../config.js?v=mrt9jcee';
import { defDi, livelloAcqua } from '../world/blocks.js?v=mrt9jcee';
import { trovaPercorso } from './pathfind.js?v=mrt9jcee';

const EPS = 0.001;

export class Controller {
  constructor(mondo, input) {
    this.mondo = mondo;
    this.input = input;
    this.pos = new THREE.Vector3();      // piedi
    this.vel = new THREE.Vector3();
    this.aTerra = false;
    this.coyote = 0;
    this.percorso = null;
    this.indice = 0;
    this.spawnCella = [0, 4, 0];
    this.onArrivo = null;
    this.vola = false;           // modalità debug: niente gravità né collisioni
    this.seduto = null;          // { uscita: [x,y,z] } quando è su una panchina
    this._saltoCd = 0;           // cooldown del salto automatico (anti-rimbalzo)
    this.inAcqua = false;        // il corpo è immerso: si NUOTA
    this.metaNuoto = null;       // [x,y,z] dove nuotare (click su acqua)
    this._muroLato = false;      // collisione laterale in questo passo
    this._stuck = 0;             // tempo bloccato spingendo (anti-incastro)
  }

  /** Siediti: il gatto si accomoda in `pos` e scende alla cella `uscita` quando ti muovi. */
  siedi(pos, uscita) {
    this.seduto = { uscita };
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.percorso = null;
    this.aTerra = true;
  }

  alzati() {
    if (!this.seduto) return;
    const [x, y, z] = this.seduto.uscita;
    this.pos.set(x + 0.5, y, z + 0.5);
    this.vel.set(0, 0, 0);
    this.seduto = null;
  }

  /** Volo di debug on/off. Allo spegnimento, se sei dentro un solido, risali. */
  imposta_volo(attivo) {
    this.vola = attivo;
    this.percorso = null;
    this.vel.set(0, 0, 0);
    if (!attivo) {
      const [x, , z] = [Math.floor(this.pos.x), 0, Math.floor(this.pos.z)];
      let y = Math.floor(this.pos.y + 0.01);
      let tentativi = 0;
      while (tentativi++ < 40 && (this.mondo.solido(x, y, z) || this.mondo.solido(x, y + 1, z))) y++;
      this.pos.y = y;
    }
  }

  spawn(cella) {
    this.spawnCella = cella;
    this.pos.set(cella[0] + 0.5, cella[1], cella[2] + 0.5);
    this.vel.set(0, 0, 0);
    // reset COMPLETO del moto: senza, dopo un cambio mappa il gatto poteva
    // "camminare da solo" (percorso/meta/seduta rimasti) o restare col
    // joystick virtuale ancora premuto
    this.percorso = null;
    this.metaNuoto = null;
    this.seduto = null;
    this._stuck = 0;
    if (this.input) { this.input.asseVirtuale = null; this.input.tasti.clear(); }
  }

  cella() {
    return [Math.floor(this.pos.x), Math.floor(this.pos.y + 0.01), Math.floor(this.pos.z)];
  }

  /** Click-to-move: true se un percorso esiste. */
  vaiA(cella) {
    const percorso = trovaPercorso(this.mondo, this.cella(), cella);
    if (!percorso) return false;
    this.percorso = percorso.length ? percorso : null;
    this.indice = 0;
    return true;
  }

  fermaPercorso() { this.percorso = null; }

  /** L'AABB del player copre questa cella? (per vietare blocchi addosso) */
  occupaCella(x, y, z) {
    const me = FISICA.larghezza / 2;
    return x + 1 > this.pos.x - me && x < this.pos.x + me &&
           z + 1 > this.pos.z - me && z < this.pos.z + me &&
           y + 1 > this.pos.y && y < this.pos.y + FISICA.altezza;
  }

  aggiorna(dt) {
    while (dt > 0) {
      const passo = Math.min(dt, FISICA.passoMax);
      this._fisica(passo);
      dt -= passo;
    }
  }

  _fisica(dt) {
    if (this.seduto) {
      // da SEDUTO non ci si alza muovendosi: ci si GIRA sul posto (la direzione
      // diventa il verso in cui guarda il gatto). Ci si scende SOLO con
      // l'interazione (alzati()) o col salto.
      if (this.input.premuto('Space')) { this.alzati(); }
      else {
        const dir = this.input.direzione();
        this.sguardo = dir ? { x: dir.x, z: dir.z } : (this.sguardo || null);
        this.vel.set(0, 0, 0);
        return;
      }
    } else {
      this.sguardo = null;
    }

    if (this.vola) {
      const dir = this.input.direzione();
      const v = 9;
      this.vel.x = avvicina(this.vel.x, dir ? dir.x * v : 0, 60 * dt);
      this.vel.z = avvicina(this.vel.z, dir ? dir.z * v : 0, 60 * dt);
      const su = this.input.premuto('Space') ? 1 : 0;
      const giu = this.input.premuto('ShiftLeft', 'ShiftRight') ? 1 : 0;
      this.vel.y = avvicina(this.vel.y, (su - giu) * 7, 60 * dt);
      this.pos.addScaledVector(this.vel, dt);
      this.aTerra = false;
      return;
    }

    // NUOTO: sei in acqua se la cella a metà corpo è liquida
    const tCorpo = this.mondo.tipo(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.35), Math.floor(this.pos.z));
    this.inAcqua = !!(tCorpo && defDi(tCorpo).acqua);

    const manuale = this.input.direzione();
    if (manuale) { this.percorso = null; this.metaNuoto = null; }

    // direzione voluta (manuale o dal percorso)
    let dirX = 0, dirZ = 0, veloce = this.inAcqua ? FISICA.nuoto : FISICA.velocita;
    if (manuale) {
      dirX = manuale.x; dirZ = manuale.z;
      if (!this.aTerra && !this.inAcqua) veloce = Math.max(FISICA.velocitaAria, Math.hypot(this.vel.x, this.vel.z));
    } else if (this.metaNuoto) {
      const dx = this.metaNuoto[0] - this.pos.x, dz = this.metaNuoto[2] - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.35) this.metaNuoto = null;
      else { dirX = dx / dist; dirZ = dz / dist; }
    } else if (this.percorso) {
      const w = this.percorso[this.indice];
      const wx = w[0] + 0.5, wz = w[2] + 0.5;
      const dx = wx - this.pos.x, dz = wz - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const cellaY = Math.floor(this.pos.y + 0.01);

      if (dist < 0.22 && Math.abs(this.pos.y - w[1]) < 0.6) {
        this.indice++;
        if (this.indice >= this.percorso.length) {
          this.percorso = null;
          if (this.onArrivo) this.onArrivo();
          if (this.seduto) return;   // l'arrivo può averci fatto sedere: stop subito
        }
      } else {
        dirX = dx / (dist || 1); dirZ = dz / (dist || 1);
        // il gradino davanti è più alto: salto automatico (con cooldown, così a
        // basso frame-rate non "mitraglia" saltellando sul posto)
        if (w[1] > cellaY && this.aTerra && dist < 0.95 && this._saltoCd <= 0) {
          this.vel.y = FISICA.salto;
          this.aTerra = false;
          this.coyote = 0;
          this._saltoCd = 0.35;
        }
        if (dist < 0.5) veloce *= Math.max(0.45, dist * 2);  // frena vicino al waypoint
      }
    }

    // accelerazione orizzontale
    const acc = this.aTerra ? 42 : (this.inAcqua ? 26 : 16);
    this.vel.x = avvicina(this.vel.x, dirX * veloce, acc * dt);
    this.vel.z = avvicina(this.vel.z, dirZ * veloce, acc * dt);

    if (this.inAcqua) {
      // GALLEGGIAMENTO: il gatto risale da solo verso il pelo (Shift per immergersi)
      const giu = this.input.premuto('ShiftLeft', 'ShiftRight');
      const tTesta = this.mondo.tipo(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.95), Math.floor(this.pos.z));
      const sommerso = !!(tTesta && defDi(tTesta).acqua);
      this.vel.y -= FISICA.gravita * 0.12 * dt;
      this.vel.y *= 1 - Math.min(1, dt * 2.4);          // resistenza dell'acqua
      if (giu) {
        this.vel.y = Math.max(this.vel.y - 20 * dt, -2.6);
      } else if (sommerso) {
        this.vel.y += 14 * dt;                          // spinta di Archimede: a galla
      } else {
        // molla dolce verso la LINEA DI GALLEGGIAMENTO: piedi ~0.42 sotto il pelo
        const cyC = Math.floor(this.pos.y + 0.35);
        const Lq = livelloAcqua(tCorpo) || 0;
        const lineaGalla = cyC + (15 - 2 * Lq) / 16 - 0.42;
        this.vel.y += Math.max(-8, Math.min(8, (lineaGalla - this.pos.y) * 6)) * dt * 4;
      }
      if (this.input.premuto('Space')) {
        if (this.aTerra) {
          this.vel.y = FISICA.salto;                    // piedi sul fondale: salto VERO
          this.aTerra = false;
        } else if (!sommerso) {
          this.vel.y = Math.max(this.vel.y, 6.8);       // sul pelo: balzo FUORI dall'acqua
        } else {
          this.vel.y = Math.min(this.vel.y + 24 * dt, 2.8);   // immerso: pagaia
        }
      }
      if (sommerso) this.vel.y = Math.max(-2.6, Math.min(this.vel.y, 3));
    } else {
      // salto manuale (con coyote time)
      if (this.input.premuto('Space') && (this.aTerra || this.coyote > 0)) {
        this.vel.y = FISICA.salto;
        this.aTerra = false;
        this.coyote = 0;
      }
      // gravità
      this.vel.y = Math.max(this.vel.y - FISICA.gravita * dt, -FISICA.cadutaMax);
    }

    if (this._saltoCd > 0) this._saltoCd -= dt;

    this._muroLato = false;
    const preX = this.pos.x, preZ = this.pos.z;
    this._muovi(0, this.vel.x * dt);
    this._muovi(2, this.vel.z * dt);
    // spinto contro un bordo mentre nuoti: ti issi fuori (basta a scavalcare 1 blocco)
    if (this.inAcqua && this._muroLato && (dirX || dirZ)) this.vel.y = Math.max(this.vel.y, 4.8);

    // ANTI-INCASTRO + salita gradini col movimento MANUALE: se stai spingendo
    // ma non avanzi e sei a terra, un piccolo salto scavalca il gradino/spigolo
    // (come fa il click-to-move). Se resti bloccato a lungo davvero, una spinta
    // verso l'alto ti libera dall'angolo.
    if (!this.inAcqua && (dirX || dirZ)) {
      const avanzato = Math.hypot(this.pos.x - preX, this.pos.z - preZ);
      if (avanzato < 0.004 * (dt * 60)) {
        this._stuck += dt;
        if (this.aTerra && this._saltoCd <= 0) {
          this.vel.y = FISICA.salto; this.aTerra = false; this.coyote = 0; this._saltoCd = 0.35;
        }
        if (this._stuck > 0.8) { this.pos.y += 0.06; this._stuck = 0; }   // liberazione
      } else {
        this._stuck = 0;
      }
    } else {
      this._stuck = 0;
    }
    this.aTerra = false;
    this._muovi(1, this.vel.y * dt);
    // GROUND CHECK ROBUSTO: quando il movimento verticale è minuscolo (sotto-passi
    // piccoli a frame-rate variabile) la risoluzione della collisione non scatta e
    // aTerra resterebbe falso → il gatto si "stira" (animazione in aria) di continuo.
    // Una sonda appena sotto i piedi risolve: se non sali e c'è un solido sotto, sei a terra.
    if (!this.aTerra && this.vel.y <= 0.001 && this._terraSotto()) {
      this.aTerra = true;
      if (this.vel.y < 0) this.vel.y = 0;
    }
    this.coyote = this.aTerra ? FISICA.coyote : Math.max(0, this.coyote - dt);

    // caduto nel vuoto → respawn
    if (this.pos.y < -12) this.spawn(this.spawnCella);
  }

  _muovi(asse, delta) {
    if (delta === 0) return;
    const p = this.pos;
    p.setComponent(asse, p.getComponent(asse) + delta);

    const me = FISICA.larghezza / 2;
    const minX = Math.floor(p.x - me), maxX = Math.floor(p.x + me - EPS);
    const minY = Math.floor(p.y + EPS), maxY = Math.floor(p.y + FISICA.altezza - EPS);
    const minZ = Math.floor(p.z - me), maxZ = Math.floor(p.z + me - EPS);

    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        for (let z = minZ; z <= maxZ; z++) {
          if (!this.mondo.solido(x, y, z)) continue;
          if (asse === 0) {
            p.x = delta > 0 ? x - me - EPS : x + 1 + me + EPS;
            this.vel.x = 0;
            this._muroLato = true;
          } else if (asse === 2) {
            p.z = delta > 0 ? z - me - EPS : z + 1 + me + EPS;
            this.vel.z = 0;
            this._muroLato = true;
          } else if (delta < 0) {
            p.y = y + 1;
            this.vel.y = 0;
            this.aTerra = true;
          } else {
            p.y = y - FISICA.altezza - EPS;
            this.vel.y = 0;
          }
          return; // dopo la risoluzione su quest'asse non serve altro
        }
  }

  /** C'è un solido appena sotto i piedi? (ground check indipendente dal movimento). */
  _terraSotto() {
    const me = FISICA.larghezza / 2;
    const yc = Math.floor(this.pos.y - 0.05);   // cella appena sotto la pianta dei piedi
    const minX = Math.floor(this.pos.x - me), maxX = Math.floor(this.pos.x + me - EPS);
    const minZ = Math.floor(this.pos.z - me), maxZ = Math.floor(this.pos.z + me - EPS);
    for (let x = minX; x <= maxX; x++)
      for (let z = minZ; z <= maxZ; z++)
        if (this.mondo.solido(x, yc, z)) return true;
    return false;
  }
}

function avvicina(v, target, passo) {
  if (v < target) return Math.min(v + passo, target);
  return Math.max(v - passo, target);
}
