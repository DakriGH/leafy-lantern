// LA TARGHETTA SOPRA LA TESTA — chi è quel gatto.
//
// SERVE PERCHÉ I GATTI SI SOMIGLIANO. In una stanza con tre persone, tre gatti
// che si muovono sono tre gatti: senza un nome sopra non si sa a chi parlare né
// chi ha appena rotto una cosa. È la funzione più piccola del multiplayer ed è
// quella che si sente di più.
//
// COM'È FATTA E PERCHÉ COSÌ. Un cartellino disegnato su un canvas e appiccicato a
// uno `Sprite`: lo sprite guarda sempre la camera da solo, senza che nessuno
// aggiorni una rotazione ogni fotogramma. Costa una texture piccola per
// giocatore e ZERO lavoro per frame — che in un gioco dove si sta fermi per ore
// è esattamente il criterio giusto.
//
// NIENTE FONT ESTERNI e niente HTML sovrapposto: il primo aggiungerebbe un
// caricamento di rete al primo nome che compare, il secondo vorrebbe una
// proiezione a mano per ogni giocatore a ogni fotogramma — e si vedrebbe
// scivolare sopra al mondo invece di starci dentro.

import * as THREE from 'three';

const ALTEZZA_PX = 64;              // altezza della texture: il nome sta in una riga
const SU = 1.15;                    // quanto sopra la testa, in blocchi

/** Disegna il cartellino e ne fa una texture. Rende {texture, larghezza}. */
function disegna(nome, colore) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  // si misura PRIMA con il font definitivo, poi si dimensiona: al contrario il
  // testo esce tagliato sui nomi lunghi o la texture e' sprecata su quelli corti
  const font = '600 34px system-ui, Segoe UI, Roboto, sans-serif';
  g.font = font;
  const largo = Math.ceil(g.measureText(nome).width) + 34;
  c.width = Math.max(64, largo);
  c.height = ALTEZZA_PX;

  const g2 = c.getContext('2d');
  g2.font = font;
  g2.textAlign = 'center';
  g2.textBaseline = 'middle';

  // la pillola: scura e semitrasparente, cosi' il nome si legge sopra il cielo
  // chiaro E sopra l'erba scura senza cambiare colore a seconda di dove sta
  const r = 16;
  g2.fillStyle = 'rgba(10,16,32,.72)';
  g2.beginPath();
  g2.roundRect(1, 8, c.width - 2, c.height - 16, r);
  g2.fill();
  g2.strokeStyle = colore || '#8ab';
  g2.lineWidth = 3;
  g2.stroke();

  g2.fillStyle = '#eaf3ff';
  g2.fillText(nome, c.width / 2, c.height / 2);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;        // niente mipmap: e' sempre di fronte
  tex.generateMipmaps = false;
  return { tex, rapporto: c.width / c.height };
}

export class Targhetta {
  /** @param sopra il gruppo del gatto: la targhetta gli va appesa, e lo segue */
  constructor(sopra) {
    this.gruppo = sopra;
    this.sprite = null;
    this.nome = null;
    this.colore = null;
  }

  /** Cambia (o mette) il nome. Ridisegna SOLO se e' cambiato qualcosa. */
  imposta(nome, colore, altezzaGatto = 0.9) {
    const n = String(nome || '').slice(0, 20);
    if (!n) { this.via(); return; }
    if (n === this.nome && colore === this.colore) return;
    this.via();
    this.nome = n; this.colore = colore;

    const { tex, rapporto } = disegna(n, colore);
    const mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      // ⚠ SI VEDE ANCHE ATTRAVERSO IL TERRENO, ed e' voluto: serve a sapere che
      // c'e' qualcuno dietro la collina. Un nome che sparisce dietro un albero
      // fa perdere di vista le persone, che e' il contrario di quel che deve fare.
      depthTest: false,
    });
    this.sprite = new THREE.Sprite(mat);
    const h = 0.30;                                  // altezza in blocchi
    this.sprite.scale.set(h * rapporto, h, 1);
    this.sprite.position.set(0, altezzaGatto + SU, 0);
    this.sprite.renderOrder = 950;
    this.gruppo.add(this.sprite);
  }

  via() {
    if (!this.sprite) return;
    this.gruppo.remove(this.sprite);
    this.sprite.material.map.dispose();
    this.sprite.material.dispose();
    this.sprite = null;
    this.nome = null;
  }
}
