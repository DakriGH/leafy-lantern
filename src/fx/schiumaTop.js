// Silhouette dall'alto per la SCHIUMA: una camera ortografica guarda in giù e
// renderizza (bianco, in un RT) SOLO la fetta di geometria che attraversa il
// pelo dell'acqua. Lo shader dell'acqua la campiona e mette la schiuma attorno
// alla FORMA VERA di qualsiasi cosa — furni di ogni forma, gatti, palle, NPC
// futuri — senza codice per-oggetto.
//
// Il RT NON si azzera a ogni frame: si SFUMA (quad nero semitrasparente) e la
// silhouette fresca si ridisegna sopra → chi si muove lascia una SCIA di
// schiuma che si dissolve, come una vera scia nell'acqua. Texel da 0.125
// unità (512² su 64u): niente scatti a blocchi. L'ondeggiare del contorno e
// la rottura in chiazze vive li fa lo shader (materials.js).

import * as THREE from 'three';

/** Layer dedicato: la camera della schiuma vede solo chi ce l'ha acceso. */
export const LAYER_SCHIUMA = 3;

const ESTENSIONE = 64;           // unità di mondo coperte, centrate sul fuoco
const GRIGLIA_CENTRO = 16;       // il centro salta di 16u: la scia resta allineata
const SOPRA = 0.25, SOTTO = 0.3; // fetta stretta attorno al pelo
const DISSOLVENZA = 0.025;       // quanto svanisce la scia a ogni frame (~mezzo secondo)

export class SchiumaTop {
  constructor(renderer, mobile = false) {
    this.renderer = renderer;
    // su mobile: metà risoluzione (texel 0.25u, comunque fine) — e main la
    // aggiorna a frame alterni
    const DIM_RT = mobile ? 256 : 512;
    this.rt = new THREE.WebGLRenderTarget(DIM_RT, DIM_RT, { depthBuffer: false });
    this.rt.texture.magFilter = THREE.LinearFilter;
    this.rt.texture.minFilter = THREE.LinearFilter;
    this.rt.texture.generateMipmaps = false;
    const m = ESTENSIONE / 2;
    // guardando in giù con up=(0,0,1) il "right" della camera è −X: si
    // scambiano left/right nel frustum così u cresce con la x del mondo
    this.cam = new THREE.OrthographicCamera(m, -m, m, -m, 0, SOPRA + SOTTO);
    this.cam.up.set(0, 0, 1);            // NDC y+ = mondo z+ (uv dritta nello shader)
    this.bianco = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false });
    this.info = new THREE.Vector4(0, 0, 1 / ESTENSIONE, 0);   // minX, minZ, 1/est, attivo
    this._colorePrec = new THREE.Color();
    this._cx = null; this._cz = null;

    // quad a tutto schermo che "sbianca via" la scia un po' per frame
    this._camFade = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    this._scenaFade = new THREE.Scene();
    this._scenaFade.add(new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: DISSOLVENZA, depthTest: false, depthWrite: false }),
    ));
  }

  /** Renderizza la fetta al pelo `pelo`, centrata sul fuoco. */
  aggiorna(scena, fuoco, pelo) {
    const cx = Math.round(fuoco.x / GRIGLIA_CENTRO) * GRIGLIA_CENTRO;
    const cz = Math.round(fuoco.z / GRIGLIA_CENTRO) * GRIGLIA_CENTRO;
    const ricentrato = cx !== this._cx || cz !== this._cz;
    this._cx = cx; this._cz = cz;
    this.cam.position.set(cx, pelo + SOPRA, cz);
    this.cam.lookAt(cx, pelo - SOTTO - 1, cz);
    this.cam.layers.set(LAYER_SCHIUMA);
    this.cam.updateMatrixWorld();

    // render-to-texture a metà frame: si salva e ripristina TUTTO lo stato
    const rtPrima = this.renderer.getRenderTarget();
    this.renderer.getClearColor(this._colorePrec);
    const alphaPrec = this.renderer.getClearAlpha();
    const autoPrec = this.renderer.autoClear;
    const overPrec = scena.overrideMaterial;
    const fogPrec = scena.fog, bgPrec = scena.background;
    scena.overrideMaterial = this.bianco;
    scena.fog = null; scena.background = null;
    this.renderer.setRenderTarget(this.rt);
    if (ricentrato) {                       // la regione è saltata: scia da capo
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear();
    }
    this.renderer.autoClear = false;
    this.renderer.render(this._scenaFade, this._camFade);   // dissolve la scia
    this.renderer.render(scena, this.cam);                  // silhouette fresca
    this.renderer.autoClear = autoPrec;
    this.renderer.setRenderTarget(rtPrima);
    this.renderer.setClearColor(this._colorePrec, alphaPrec);
    scena.overrideMaterial = overPrec;
    scena.fog = fogPrec; scena.background = bgPrec;

    this.info.set(cx - ESTENSIONE / 2, cz - ESTENSIONE / 2, 1 / ESTENSIONE, 1);
  }

  spegni() { this.info.w = 0; }
}
