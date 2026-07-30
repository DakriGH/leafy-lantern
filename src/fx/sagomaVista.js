// LA SAGOMA CHE SI VEDE ATTRAVERSO — «preferisco vedere un cono in trasparenza
// che fa vedere il player attraverso, ma senza bucare le mesh degli oggetti».
//
// IL PROBLEMA. La camera oggi rientra quando incontra un muro (renderer.js,
// `solido`): non perdi mai di vista il gatto, ma l'inquadratura si stringe da
// sola e la scena ti salta addosso. L'alternativa ovvia — camera fantasma che
// attraversa tutto — ti lascia col gatto SPARITO dietro una collina.
//
// LA SOLUZIONE che usano i giochi in terza persona da vent'anni: la camera non
// si muove, e del personaggio si disegna una SECONDA volta la sagoma, ma solo
// dove qualcosa lo copre. Non è una trasparenza applicata al mondo: il mondo
// resta pieno e opaco. È il personaggio che viene ridisegnato SOPRA, e solo lì.
//
// COME, in una riga di stato OpenGL: `depthFunc = GreaterDepth`. Il test di
// profondità viene ROVESCIATO — passa dove il frammento è PIÙ LONTANO di quello
// che c'è già nel buffer, cioè esattamente dove il personaggio è nascosto.
// Dove invece è visibile il test fallisce e non si disegna niente, quindi la
// sagoma non si somma mai al personaggio vero (niente alone, niente doppio).
//   · `depthWrite: false` — la sagoma non deve occludere nulla, nemmeno sé stessa;
//   · `transparent` con opacità bassa e `fog: false` — è un aiuto di lettura,
//     non un oggetto in scena, e la nebbia non deve mangiarselo;
//   · `renderOrder` alto — dopo il mondo, se no il buffer non è ancora pieno.
//
// NON BUCA NIENTE, ed è la richiesta esplicita: si vede il gatto, non attraverso
// il gatto. Il muro davanti resta lì, con la sua faccia, il suo colore e la sua
// ombra; sopra ci passa la sua sagoma azzurrina.

import * as THREE from 'three';

// materiali condivisi per colore: i gatti in rete hanno il loro, e una mappa
// evita di crearne uno per frame o uno per gatto
const _materiali = new Map();

function materialeSagoma(colore) {
  let m = _materiali.get(colore);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: colore,
      transparent: true,
      opacity: 0.42,
      // IL ROVESCIO DEL TEST: si disegna SOLO dove qualcosa sta davanti
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    _materiali.set(colore, m);
  }
  return m;
}

/**
 * La sagoma di un personaggio, visibile solo quando è coperto.
 *
 * Si costruisce CLONANDO il gruppo del gatto e sostituendo i materiali: così
 * segue da sola la forma vera (orecchie, coda, la posa che si stira saltando) e
 * non c'è una seconda geometria da tenere in pari a mano. Le mesh sono poche —
 * un gatto sono nove scatole — quindi il clone costa una volta sola.
 */
export class SagomaVista {
  /** @param gruppo il Group del personaggio (Gatto.gruppo) */
  constructor(scena, gruppo, colore = 0x8fd3ff) {
    this.origine = gruppo;
    this.clone = gruppo.clone(true);
    const mat = materialeSagoma(colore);
    this.clone.traverse((o) => {
      if (!o.isMesh) return;
      o.material = mat;
      o.renderOrder = 900;
      o.castShadow = false;
      o.frustumCulled = false;
    });
    this.clone.visible = false;
    scena.add(this.clone);
    this.attiva = false;
  }

  /** Da chiamare nel loop: ricopia posa e scala dall'originale. Costa quanto
   *  copiare tre vettori — la gerarchia è la stessa, quindi si scorrono in
   *  parallelo senza cercare niente per nome. */
  aggiorna() {
    if (!this.attiva) return;
    const a = this.origine, b = this.clone;
    b.position.copy(a.position);
    b.quaternion.copy(a.quaternion);
    b.scale.copy(a.scale);
    const ia = a.children, ib = b.children;
    for (let i = 0; i < ia.length && i < ib.length; i++) {
      ib[i].position.copy(ia[i].position);
      ib[i].quaternion.copy(ia[i].quaternion);
      ib[i].scale.copy(ia[i].scale);
      const ja = ia[i].children, jb = ib[i].children;
      for (let j = 0; j < ja.length && j < jb.length; j++) {
        jb[j].position.copy(ja[j].position);
        jb[j].quaternion.copy(ja[j].quaternion);
        jb[j].scale.copy(ja[j].scale);
      }
    }
  }

  imposta(on) {
    this.attiva = !!on;
    this.clone.visible = this.attiva;
    if (this.attiva) this.aggiorna();
  }

  smonta(scena) {
    scena.remove(this.clone);
    this.clone.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
}
