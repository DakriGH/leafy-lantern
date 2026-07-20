// Modalità AR (M7): il diorama appare sul MARKER (AR-Marker/marker-lanterna.png)
// inquadrato con la camera. Stesso identico gioco — mondo, sim, multiplayer
// continuano — è solo un altro modo di guardarlo.
//
// Dal 2026-07-17 si usa il binario UFFICIALE di MindAR (MindARThree): camera,
// video a schermo, tracking, anchor e resize li gestisce la libreria come in
// tutti i suoi esempi. La build three della dist importava sRGBEncoding
// (rimosso da three r162): la copia in vendor/ è patchata da
// scripts/patcha-mindar.mjs (SRGBColorSpace / outputColorSpace).
//
// Il mondo intero viene spostato in un PIVOT dentro anchor.group: MindAR
// mostra/nasconde il gruppo quando il marker si aggancia/perde. In AR il
// nostro renderer si spegne e disegna quello di MindAR (video dietro, scena
// trasparente davanti). Il .mind si compila dal PNG la prima volta e resta
// in cache (Cache API).

import * as THREE from 'three';
import { impostaMondoInv } from '../fx/materials.js?v=mrsh3dhg';

const URL_MIND = './AR-Marker/marker-lanterna.mind';
const URL_MARKER = './AR-Marker/marker-lanterna.png';
const VERSIONE_MARKER = 4;      // da ALZARE a ogni rigenerazione del PNG (invalida la cache)
const SCALA_CELLE = 24;         // quante celle di mondo coprono la larghezza del marker

export class ModalitaAR {
  constructor(rig) {
    this.rig = rig;
    this.attiva = false;
    this.inAvvio = false;
    this.mindar = null;
    this.pivot = new THREE.Group();
    this.pivot.matrixAutoUpdate = false;
    this._cameraRiposo = new THREE.PerspectiveCamera();   // quando l'AR è spenta
    this._fit = new THREE.Matrix4();         // mondo → spazio marker (adagia/scala/centra)
    this._inv = new THREE.Matrix4();
    this._figli = [];
    this._contenitore = null;
    this.onStato = null;                     // (testo) per i toast
    this.onCambio = null;                    // (attiva:boolean) → main applica/toglie il profilo AR
  }

  get camera() { return this.mindar ? this.mindar.camera : this._cameraRiposo; }

  get disponibile() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /** Stato SEMPRE visibile a schermo (i toast svaniscono e sul telefono non
   *  c'è console): un chip fisso racconta a che punto è l'AR. `fine` = si
   *  dissolve da solo dopo qualche secondo. */
  _stato(t, fine = false) {
    if (this.onStato) this.onStato(t);
    if (!this._chip) {
      this._chip = document.createElement('div');
      this._chip.style.cssText =
        'position:fixed;top:calc(env(safe-area-inset-top, 0px) + 58px);left:50%;transform:translateX(-50%);' +
        'z-index:60;padding:8px 16px;border-radius:999px;font:700 12px system-ui;' +
        'background:rgba(18,23,44,.95);color:#f7f3e9;border:2px solid rgba(255,211,144,.55);' +
        'box-shadow:0 3px 0 rgba(4,6,14,.5);max-width:88vw;text-align:center;pointer-events:none';
      document.body.appendChild(this._chip);
    }
    clearTimeout(this._chipTimer);
    this._chip.textContent = t;
    this._chip.style.display = 'block';
    if (fine) this._chipTimer = setTimeout(() => { this._chip.style.display = 'none'; }, 5000);
  }

  _nascondiChip() {
    clearTimeout(this._chipTimer);
    if (this._chip) this._chip.style.display = 'none';
  }

  /** Nessun passo dell'avvio può restare APPESO: o riesce, o dice dove muore. */
  _conTimeout(promessa, ms, dove) {
    return Promise.race([
      promessa,
      new Promise((_, no) => setTimeout(() => no(new Error('bloccato su: ' + dove)), ms)),
    ]);
  }

  async avvia(fuoco) {
    if (this.attiva || this.inAvvio) return this.attiva;
    this.inAvvio = true;
    try {
      const [{ MindARThree }, { Compiler }] = await Promise.all([
        import('./vendor/mindar-image-three.js?v=mrsh3dhg'),
        import('../../node_modules/mind-ar/dist/mindar-image.prod.js'),
      ]);

      // Il permesso camera lo chiede getUserMedia qui sotto: nel browser è il
      // percorso normale e vale su ogni dispositivo. Serve però un contesto
      // sicuro — https:// oppure localhost — altrimenti il browser lo nega.

      // dati del marker (precompilato → cache → compilazione dal PNG)
      const buffer = await this._conTimeout(this._datiMarker(Compiler), 240000, 'dati del marker');
      const urlMind = URL.createObjectURL(new Blob([buffer]));

      // contenitore a schermo pieno per video+canvas di MindAR (sotto la GUI).
      // pointer-events:none: i click ATTRAVERSANO e arrivano a #scena, dove
      // vive l'input del gioco — così in AR ci si muove e si costruisce
      const cont = this._contenitore = document.createElement('div');
      cont.style.cssText = 'position:fixed;inset:0;z-index:4;overflow:hidden;background:#000;pointer-events:none';
      document.body.appendChild(cont);

      this.mindar = new MindARThree({
        container: cont,
        imageTargetSrc: urlMind,
        uiLoading: 'no', uiScanning: 'no', uiError: 'no',
        warmupTolerance: 2,        // aggancio rapido…
        missTolerance: 8,          // …ma non mollare al primo frame perso
        filterMinCF: 0.0001,       // diorama da tavolo: stabilità > reattività
        filterBeta: 100,           //   (senza, il mondo TREMOLAVA sul marker)
      });
      // in AR il telefono paga ANCHE il tracking: risoluzione render più bassa
      this.mindar.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.rig.mobile ? 1.15 : 2));

      // mondo → marker: adagiato sul piano, in scala, centrato sul gatto
      this._fuoco = { x: Math.round(fuoco.x), y: Math.round(fuoco.y), z: Math.round(fuoco.z) };
      this._aggiornaFit();

      const anchor = this.mindar.addAnchor(0);
      anchor.group.add(this.pivot);
      anchor.onTargetFound = () => this._stato('🎯 Marker agganciato!', true);
      anchor.onTargetLost = () => {
        // il diorama NON sparisce: resta CONGELATO all'ultima posa buona e al
        // riaggancio si riallinea da solo — perdere il marker non è un dramma
        anchor.group.visible = true;
        this._stato('👀 Marker perso: resto fermo qui finché non lo rivedo', true);
      };

      // il MONDO trasloca nel pivot (torna a casa in ferma())
      const scena = this.rig.scena;
      this._figli = [...scena.children];
      for (const f of this._figli) this.pivot.add(f);

      // start() = camera + compilazione shader del tracking: il freeze di
      // qualche secondo è normale — si dice PRIMA, con paint garantito
      this._stato('🔥 Accendo camera e tracking… l’immagine si ferma qualche secondo, è normale');
      await Promise.race([
        new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))),
        new Promise((ok) => setTimeout(ok, 400)),
      ]);
      await this._conTimeout(this.mindar.start(), 120000, 'avvio camera/tracking');

      // telemetria: conta gli aggiornamenti del tracker per il chip
      const controller = this.mindar.controller;
      if (controller && controller.onUpdate) {
        const cb = controller.onUpdate;
        this._analisi = 0;
        controller.onUpdate = (d) => { this._analisi++; cb(d); };
      }
      this._avviaTelemetria();

      this.rig.renderer.domElement.style.display = 'none';   // disegna MindAR
      this.attiva = true;
      if (this.onCambio) this.onCambio(true);   // profilo AR "minimo": ombre off, scala bassa
      this._stato('🔍 Pronto! Inquadra il marker', true);
      return true;
    } catch (e) {
      console.warn('[lantern] AR non avviata', e);
      this._stato(`AR non parte 😿 — ${e && e.message ? e.message : e}`);
      this._pulisci();
      return false;
    } finally {
      this.inAvvio = false;
    }
  }

  /** Ogni 4s, se il marker non è agganciato, il chip dice se il tracker STA
   *  lavorando (analisi/s) o se non riceve immagini — diagnosi a schermo. */
  _avviaTelemetria() {
    clearInterval(this._telemetria);
    this._analisi = 0;
    let prec = 0;
    this._telemetria = setInterval(() => {
      if (!this.attiva) return;
      const rate = (this._analisi - prec) / 4;
      prec = this._analisi;
      const agganciato = this.mindar && this.mindar.anchors && this.mindar.anchors[0] &&
        this.mindar.anchors[0].group.visible;
      if (agganciato) return;              // aggancio: nessun disturbo
      this._stato(rate > 0.2
        ? `👀 Cerco il marker… (tracker attivo, ${rate.toFixed(0)} analisi/s)`
        : '⚠️ Il tracker non riceve immagini dalla camera — segnalami questo messaggio');
    }, 4000);
  }

  /** .mind precompilato, o compilazione al volo dal PNG (una tantum, in cache). */
  async _datiMarker(Compiler) {
    try {
      const r = await fetch(URL_MIND);
      if (r.ok) return await r.arrayBuffer();
    } catch { /* si compila */ }
    // la chiave porta la VERSIONE del marker: un PNG rigenerato non deve mai
    // riusare la compilazione del disegno vecchio
    const chiave = `${URL_MARKER}.v${VERSIONE_MARKER}.mind`;
    let cache = null;
    try {
      cache = await caches.open('lantern-ar-v1');
      const salvato = await cache.match(chiave);
      if (salvato) return await salvato.arrayBuffer();
    } catch { /* Cache API non disponibile: pazienza */ }
    this._stato('🛠 Preparo il marker (solo la prima volta, ~1 minuto)…');
    const risp = await fetch(URL_MARKER);
    const img = await createImageBitmap(await risp.blob());
    const compiler = new Compiler();
    await compiler.compileImageTargets([img], () => {});
    const dati = await compiler.exportData();
    try { if (cache) await cache.put(chiave, new Response(dati.slice(0))); } catch { /* ok lo stesso */ }
    return dati;
  }

  /** Assetto del diorama sul marker: rotazione (gradi) e scala (1 = base).
   *  Regolabile dalle Impostazioni per orientarlo/dimensionarlo a piacere. */
  impostaAssetto(rotGradi = 0, scala = 1) {
    this._rot = rotGradi;
    this._scala = scala;
    if (this.mindar) this._aggiornaFit();
  }

  _aggiornaFit() {
    const s = (1 / SCALA_CELLE) * (this._scala || 1);
    const f = this._fuoco || { x: 0, y: 0, z: 0 };
    // rotX +90°: l'ALTO del mondo (+Y) esce dal marker VERSO chi guarda —
    // con −90° l'isola finiva sotto il piano e si vedeva il suo "sedere"
    this._fit.identity()
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY(((this._rot || 0) * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeScale(s, s, s))
      .multiply(new THREE.Matrix4().makeTranslation(-f.x, -f.y, -f.z));
    this.pivot.matrix.copy(this._fit);
  }

  _traccia() {
    const video = this.mindar && this.mindar.video;
    return (video && video.srcObject && video.srcObject.getVideoTracks()[0]) || null;
  }

  /** Esposizione della camera (0..1, 0 = più BUIA possibile): prima si prova
   *  il TEMPO di esposizione manuale (il controllo vero, scende davvero),
   *  poi la compensazione, poi la luminosità. Webcam scarse riconoscono
   *  meglio il marker con l'esposizione bassa (meno blur, più contrasto). */
  async regolaEsposizione(v) {
    try {
      const traccia = this._traccia();
      if (!traccia || !traccia.getCapabilities) return 'il browser non lo permette';
      const cap = traccia.getCapabilities();
      if (cap.exposureTime) {
        const { min, max } = cap.exposureTime;
        // scala logaritmica: metà slider = via di mezzo geometrica
        const t = min * Math.pow(max / min, Math.max(0.0001, v));
        await traccia.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureTime: t }] });
        return `tempo di esposizione ${t.toFixed(0)}`;
      }
      if (cap.exposureCompensation) {
        const { min, max } = cap.exposureCompensation;
        await traccia.applyConstraints({ advanced: [{ exposureMode: 'manual', exposureCompensation: min + (max - min) * v }] });
        return `esposizione ${(min + (max - min) * v).toFixed(1)} (range ${min}..${max})`;
      }
      if (cap.brightness) {
        const { min, max } = cap.brightness;
        await traccia.applyConstraints({ advanced: [{ brightness: min + (max - min) * v }] });
        return 'luminosità applicata';
      }
      return 'questa camera non ha regolazioni di esposizione';
    } catch (e) {
      return 'regolazione rifiutata: ' + (e.message || e);
    }
  }

  /** Messa a FUOCO (0..1 = vicino..lontano); 'auto' se v è null. */
  async regolaFuoco(v) {
    try {
      const traccia = this._traccia();
      if (!traccia || !traccia.getCapabilities) return 'il browser non lo permette';
      const cap = traccia.getCapabilities();
      if (v === null) {
        await traccia.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        return 'fuoco automatico';
      }
      if (cap.focusDistance) {
        const { min, max } = cap.focusDistance;
        await traccia.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: min + (max - min) * v }] });
        return 'fuoco manuale applicato';
      }
      return 'questa camera non ha il fuoco regolabile';
    } catch (e) {
      return 'fuoco rifiutato: ' + (e.message || e);
    }
  }

  /** Porta un raggio (spazio camera AR) nello spazio CELLE del mondo. */
  trasformaRaggio(origine, direzione) {
    this.pivot.updateWorldMatrix(true, false);
    this._inv.copy(this.pivot.matrixWorld).invert();
    origine.applyMatrix4(this._inv);
    direzione.transformDirection(this._inv);
  }

  render() {
    if (!this.mindar) return;
    // l'inversa del pivot riporta vPosMondo in coordinate MONDO: luci dei
    // lampioni, ombre di nuvole/gatto e schiuma funzionano anche sul diorama
    this.pivot.updateWorldMatrix(true, false);
    this._inv.copy(this.pivot.matrixWorld).invert();
    impostaMondoInv(this._inv);
    this.mindar.renderer.render(this.mindar.scene, this.mindar.camera);
  }

  ferma() {
    if (!this.attiva && !this.mindar) return;
    this._pulisci();
    this._stato('🏡 Torni alla vista normale', true);
  }

  _pulisci() {
    clearInterval(this._telemetria);
    try { if (this.mindar) this.mindar.stop(); } catch { /* pazienza */ }
    try { if (this.mindar) this.mindar.renderer.dispose(); } catch { /* pazienza */ }
    // il mondo torna nella scena di gioco
    const scena = this.rig.scena;
    if (this._figli.length) {
      for (const f of this._figli) scena.add(f);
      this._figli = [];
    }
    if (this.pivot.parent) this.pivot.parent.remove(this.pivot);
    if (this._contenitore) { this._contenitore.remove(); this._contenitore = null; }
    this.mindar = null;
    impostaMondoInv(null);
    this.rig.renderer.domElement.style.display = '';
    this.attiva = false;
    if (this.onCambio) this.onCambio(false);   // torna al profilo normale (ombre ripristinate)
    this._nascondiChip();
  }
}
