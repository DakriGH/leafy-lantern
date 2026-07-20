// AR AVANZATA senza marker (WebXR / ARCore) — la migliore tecnologia AR che
// esista sul web: il telefono fa SLAM, mappa lo spazio vero e il diorama
// resta ANCORATO dove lo appoggi anche girandogli attorno. Niente QR:
// punti una superficie (il reticolo la mostra), tocchi, e il mondo è lì.
//
// Richiede WebXR immersive-ar (Chrome/WebView Android con ARCore): dove non
// c'è, il bottone non compare e resta la modalità marker. La camera la
// composita il SISTEMA (passthrough), il gioco disegna sul layer XR
// trasparente; la GUI resta viva via dom-overlay.

import * as THREE from 'three';
import { impostaMondoInv } from '../fx/materials.js?v=mrsjdrr0';

const SCALA_CELLE = 24;

export class ModalitaXR {
  constructor(rig) {
    this.rig = rig;
    this.attiva = false;
    this.inAvvio = false;
    this.piazzato = false;
    this.sessione = null;
    this.pivot = new THREE.Group();
    this.pivot.matrixAutoUpdate = false;
    this.pivot.visible = false;
    this._fit = new THREE.Matrix4();
    this._posa = new THREE.Matrix4();       // dove l'hai appoggiato (dal reticolo)
    this._inv = new THREE.Matrix4();
    this._figli = [];
    this._rot = 0; this._scala = 1;
    this._fuoco = { x: 0, y: 0, z: 0 };
    this.onStato = null;

    // reticolo: anello che scivola sulle superfici trovate dall'hit-test
    this.reticolo = new THREE.Mesh(
      new THREE.RingGeometry(0.07, 0.09, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc86e, transparent: true, opacity: 0.9 }),
    );
    this.reticolo.matrixAutoUpdate = false;
    this.reticolo.visible = false;

    // PALLINI di tracciamento: nascono attorno ai punti che il telefono sta
    // mappando e SFUMANO — il feedback visivo che lo SLAM sta lavorando
    this._pallini = [];
    this._palliniGruppo = new THREE.Group();
    this._geoPallino = new THREE.CircleGeometry(0.006, 8).rotateX(-Math.PI / 2);
    this._tPallino = 0;
    this.onAssetto = null;              // (rotGradi, scala) per persistere le regolazioni
  }

  /** C'è WebXR immersive-ar su questo dispositivo? */
  static async disponibile() {
    try {
      return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'));
    } catch { return false; }
  }

  _stato(t, fine = false) { if (this.onStato) this.onStato(t, fine); }

  impostaAssetto(rotGradi = 0, scala = 1) {
    this._rot = rotGradi; this._scala = scala;
    if (this.piazzato) this._aggiornaPivot();
  }

  async avvia(fuoco) {
    if (this.attiva || this.inAvvio) return this.attiva;
    this.inAvvio = true;
    try {
      this._fuoco = { x: Math.round(fuoco.x), y: Math.round(fuoco.y), z: Math.round(fuoco.z) };
      this.sessione = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'anchors', 'local-floor'],
        domOverlay: { root: document.body },
      });
      const r = this.rig.renderer;
      r.xr.enabled = true;
      r.xr.setReferenceSpaceType('local');
      await r.xr.setSession(this.sessione);
      const viewer = await this.sessione.requestReferenceSpace('viewer');
      this._hit = await this.sessione.requestHitTestSource({ space: viewer });

      // il mondo trasloca nel pivot; cielo e nebbia si spengono (passthrough).
      // ESCLUDI i nostri stessi oggetti: se un tentativo precedente aveva
      // lasciato il pivot in scena, `pivot.add(pivot)` fa esplodere three con
      // "object can't be added as a child of itself" — errore grave a schermo.
      const scena = this.rig.scena;
      const miei = new Set([this.pivot, this.reticolo, this._palliniGruppo]);
      this._figli = scena.children.filter((f) => !miei.has(f));
      for (const f of this._figli) this.pivot.add(f);
      this.pivot.visible = false;
      this.piazzato = false;
      scena.add(this.pivot, this.reticolo, this._palliniGruppo);
      this._creaToolbar();
      this._sfondoPrec = scena.background;
      this._fogPrec = scena.fog;
      scena.background = null;
      scena.fog = null;

      this.sessione.addEventListener('end', () => this._pulisci());
      this.attiva = true;
      this._stato('🪄 Muovi il telefono per mappare — punta una superficie e TOCCA per appoggiare il diorama');
      return true;
    } catch (e) {
      console.warn('[lantern] XR non avviata', e);
      this._stato(`AR avanzata non parte 😿 — ${e && e.message ? e.message : e}`);
      // Se la sessione era GIÀ nata e il guaio è arrivato dopo (tipico su
      // Android quando l'hit-test non è disponibile), va CHIUSA: altrimenti il
      // telefono resta in modalità AR con niente che disegna.
      if (this.sessione) {
        try { await this.sessione.end(); } catch { /* già chiusa */ }
      }
      this._pulisci();
      return false;
    } finally {
      this.inAvvio = false;
    }
  }

  /** Dal loop, con il frame XR: reticolo sulle superfici + pallini che sfumano. */
  aggiorna(frame) {
    if (!this.attiva || !frame || !this._hit) return;
    // i pallini vivono ~1.2s poi svaniscono (anche da piazzato: mappa viva)
    for (let i = this._pallini.length - 1; i >= 0; i--) {
      const p = this._pallini[i];
      p.vita -= 0.016;
      p.mesh.material.opacity = Math.max(0, p.vita) * 0.7;
      if (p.vita <= 0) { this._palliniGruppo.remove(p.mesh); p.mesh.material.dispose(); this._pallini.splice(i, 1); }
    }
    const spazio = this.rig.renderer.xr.getReferenceSpace();
    const colpi = frame.getHitTestResults(this._hit);
    if (colpi.length === 0) { this.reticolo.visible = false; return; }
    const posa = colpi[0].getPose(spazio);
    if (!posa) return;
    this.reticolo.matrix.fromArray(posa.transform.matrix);
    this.reticolo.visible = !this.piazzato;
    this._ultimoColpo = posa.transform.matrix;
    // semina un pallino ogni ~7 frame attorno al punto mappato
    if (++this._tPallino % 7 === 0 && this._pallini.length < 36) {
      const m = new THREE.Mesh(this._geoPallino,
        new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0.7 }));
      const t = posa.transform.position;
      m.position.set(t.x + (Math.random() - 0.5) * 0.22, t.y + 0.002, t.z + (Math.random() - 0.5) * 0.22);
      this._palliniGruppo.add(m);
      this._pallini.push({ mesh: m, vita: 1.2 });
    }
  }

  /** Tocca: appoggia (o riappoggia) il diorama sull'ultima superficie puntata. */
  piazzaAlReticolo() {
    if (!this.attiva || !this._ultimoColpo) return false;
    this._posa.fromArray(this._ultimoColpo);
    this.piazzato = true;
    this.reticolo.visible = false;
    this._aggiornaPivot();
    this.pivot.visible = true;
    this._stato('🎯 Appoggiato! Giragli attorno: resta lì. Coi tasti in basso lo regoli.', true);
    return true;
  }

  /** Barra AR (dom-overlay): riposiziona · ruota · scala · esci. */
  _creaToolbar() {
    if (this._barra) { this._barra.style.display = 'flex'; return; }
    const b = this._barra = document.createElement('div');
    b.style.cssText =
      'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 148px);transform:translateX(-50%);' +
      'z-index:60;display:flex;gap:6px;padding:6px 8px;border-radius:999px;' +
      'background:rgba(18,23,44,.95);border:2px solid rgba(255,211,144,.4);box-shadow:0 3px 0 rgba(4,6,14,.5)';
    const tasto = (testo, titolo, azione) => {
      const t = document.createElement('button');
      t.textContent = testo;
      t.title = titolo;
      t.style.cssText =
        'background:rgba(255,255,255,.08);color:#f7f3e9;border:1px solid rgba(255,211,144,.3);' +
        'border-radius:999px;padding:7px 11px;font:700 13px system-ui;cursor:pointer';
      t.addEventListener('click', (e) => { e.stopPropagation(); azione(); });
      b.appendChild(t);
      return t;
    };
    tasto('📍', 'Riposiziona: punta un’altra superficie e tocca', () => {
      this.piazzato = false;
      this.pivot.visible = false;
      this._stato('📍 Punta la nuova superficie e TOCCA per riappoggiare');
    });
    tasto('⟲', 'Ruota di −15°', () => this._regola(-15, 1));
    tasto('⟳', 'Ruota di +15°', () => this._regola(15, 1));
    tasto('➖', 'Rimpicciolisci', () => this._regola(0, 1 / 1.15));
    tasto('➕', 'Allarga', () => this._regola(0, 1.15));
    tasto('✕', 'Esci dall’AR', () => this.ferma());
    document.body.appendChild(b);
  }

  _regola(dRot, fScala) {
    this._rot = ((this._rot || 0) + dRot + 360) % 360;
    this._scala = Math.min(4, Math.max(0.2, (this._scala || 1) * fScala));
    if (this.piazzato) this._aggiornaPivot();
    if (this.onAssetto) this.onAssetto(this._rot, this._scala);
  }

  _aggiornaPivot() {
    const s = (1 / SCALA_CELLE) * (this._scala || 1);
    const f = this._fuoco;
    this._fit.identity()
      .multiply(new THREE.Matrix4().makeRotationY(((this._rot || 0) * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(-f.x, -f.y, -f.z));
    // niente rotX: il piano XR è già orizzontale (y in su nello spazio locale)
    this.pivot.matrix.copy(this._posa).multiply(this._fit);
  }

  get camera() {
    return this.rig.renderer.xr.getCamera();
  }

  /** Porta un raggio (spazio XR) nello spazio CELLE del mondo. */
  trasformaRaggio(origine, direzione) {
    this.pivot.updateWorldMatrix(true, false);
    this._inv.copy(this.pivot.matrixWorld).invert();
    origine.applyMatrix4(this._inv);
    direzione.transformDirection(this._inv);
  }

  render() {
    // luci/ombre/schiuma in coordinate mondo anche qui
    if (this.piazzato) {
      this.pivot.updateWorldMatrix(true, false);
      this._inv.copy(this.pivot.matrixWorld).invert();
      impostaMondoInv(this._inv);
    }
    this.rig.renderer.render(this.rig.scena, this.rig.camera);   // three usa la camera XR
  }

  ferma() {
    if (this.sessione) { try { this.sessione.end(); } catch { /* già chiusa */ } }
  }

  _pulisci() {
    const scena = this.rig.scena;
    if (this._figli.length) {
      for (const f of this._figli) scena.add(f);
      this._figli = [];
    }
    if (this.pivot.parent) scena.remove(this.pivot);
    if (this.reticolo.parent) scena.remove(this.reticolo);
    if (this._palliniGruppo.parent) scena.remove(this._palliniGruppo);
    if (this._barra) this._barra.style.display = 'none';
    if (this._sfondoPrec) { scena.background = this._sfondoPrec; this._sfondoPrec = null; }
    if (this._fogPrec) { scena.fog = this._fogPrec; this._fogPrec = null; }
    this.rig.renderer.xr.enabled = false;
    impostaMondoInv(null);
    this._hit = null;
    this.sessione = null;
    this.attiva = false;
    this.piazzato = false;
    this._stato('🏡 Torni alla vista normale', true);
    if (this.onFine) this.onFine();
  }
}
