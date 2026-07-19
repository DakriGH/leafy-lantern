// Renderer + camera orbitale da diorama (segue il player con dolcezza).
// Post-processing TILT-SHIFT: sfoca sopra e sotto la banda a fuoco (che segue
// il gatto) per l'effetto miniatura — due passate gaussiane direzionali.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CAMERA } from '../config.js?v=mrsf4ny9';

/**
 * Il browser sta disegnando via SOFTWARE (niente GPU)?
 *
 * ATTENZIONE a "mesa": Mesa è il DRIVER open source di quasi tutte le GPU
 * Intel/AMD su Linux e ChromeOS — cercarlo qui dentro segnalava come "software"
 * dei Chromebook con GPU vera ("Mesa DRI Intel(R) HD Graphics 400"). I renderer
 * software veri sono SwiftShader (Chrome), llvmpipe/softpipe/swrast (Mesa) e i
 * "basic/software adapter" di Windows.
 */
export function disegnaInSoftware(gpu) {
  const s = String(gpu || '');
  if (/llvmpipe|softpipe|swrast|swiftshader/i.test(s)) return true;
  // "software"/"basic render" solo come parole a sé: mai dentro un nome di GPU
  return /\bsoftware\b|basic render/i.test(s);
}

// Gaussiana 5 tap (campionamento lineare) pesata dalla distanza dalla banda a fuoco.
const ShaderTiltShift = {
  name: 'TiltShiftLantern',
  uniforms: {
    tDiffuse: { value: null },
    risoluzione: { value: new THREE.Vector2(1, 1) },
    direzione: { value: new THREE.Vector2(1, 0) },
    fuoco: { value: 0.45 },      // centro banda (0..1 in verticale schermo)
    banda: { value: 0.13 },      // semi-ampiezza nitida
    sfuma: { value: 0.32 },      // transizione
    quantita: { value: 2.2 },    // pixel di blur massimo
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 risoluzione, direzione;
    uniform float fuoco, banda, sfuma, quantita;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - fuoco);
      float f = smoothstep(banda, banda + sfuma, d) * quantita;
      vec2 passo = direzione / risoluzione * f;
      vec4 c = texture2D(tDiffuse, vUv) * 0.2270270;
      c += (texture2D(tDiffuse, vUv + passo * 1.3846154) + texture2D(tDiffuse, vUv - passo * 1.3846154)) * 0.3162162;
      c += (texture2D(tDiffuse, vUv + passo * 3.2307692) + texture2D(tDiffuse, vUv - passo * 3.2307692)) * 0.0702703;
      gl_FragColor = c;
    }`,
};

export class Rig {
  constructor(contenitore) {
    // mobile = touch primario: i telefoni hanno DPR 2.5–3.5 → un canvas full-screen
    // WebGL costa 6–12× i pixel di un desktop. Il cap del pixel ratio è il singolo
    // fattore che pesa di più sui fps (niente antialias MSAA su mobile).
    this.mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.mobile, stencil: false, powerPreference: 'high-performance' });
    this.dprMax = this.mobile ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.dprMax));
    contenitore.appendChild(this.renderer.domElement);

    // PERDITA DEL CONTESTO WebGL: su GPU deboli o in software il browser può
    // resettare la grafica. Senza gestirlo il canvas resta NERO per sempre e
    // non si capisce perché (segnalati "flash neri" su Chromebook). Chiamare
    // preventDefault() è ciò che permette al browser di ripristinarlo.
    this.contestoPerso = false;
    this.onContesto = null;              // (perso: boolean) → lo mostra la GUI
    const tela = this.renderer.domElement;
    tela.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();                // senza questo il contesto NON torna
      this.contestoPerso = true;
      console.warn('[lantern] contesto WebGL perso');
      if (this.onContesto) this.onContesto(true);
    });
    tela.addEventListener('webglcontextrestored', () => {
      this.contestoPerso = false;
      console.warn('[lantern] contesto WebGL ripristinato');
      if (this.onContesto) this.onContesto(false);
    });

    // ACCELERAZIONE HARDWARE: se il WebView è caduto sul renderer SOFTWARE
    // gli fps crollano — lo si sa subito invece di indagare a caso
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'sconosciuta';
      this.software = disegnaInSoftware(this.gpu);
    } catch { this.gpu = 'sconosciuta'; this.software = false; }

    this.scena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, CAMERA.lontano);

    this.bersaglio = new THREE.Vector3(0, 4, 0);  // dove guarda (insegue il player)
    this.yaw = CAMERA.yaw;
    this.pitch = CAMERA.pitch;
    this.distanza = CAMERA.distanza;

    // la catena tilt-shift si costruisce SOLO alla prima attivazione: su mobile
    // (dove parte spento) non si allocano nemmeno i 2 render target full-res
    this.composer = null;
    this._tsH = null;
    this._tsV = null;
    this.tiltShift = false;
    this._fuoco = 0.45;

    // collisione della camera coi muri (spenta col settaggio "camera fantasma")
    this.solido = null;          // (x,y,z) => bool, iniettato da main
    this.fantasma = false;

    this._ridimensiona = this._ridimensiona.bind(this);
    addEventListener('resize', this._ridimensiona);
    document.addEventListener('visibilitychange', this._ridimensiona);
    this._ridimensiona();
  }

  _ridimensiona() {
    // se la pagina parte in una tab nascosta la finestra può misurare 0×0
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /** Dimensiona TUTTO (renderer, composer se esiste, uniform del blur, camera). */
  dimensiona(w, h) {
    this.renderer.setSize(w, h, w === innerWidth && h === innerHeight);
    if (this.composer) {
      this.composer.setSize(w, h);
      const dpr = this.renderer.getPixelRatio();
      this._tsH.uniforms.risoluzione.value.set(w * dpr, h * dpr);
      this._tsV.uniforms.risoluzione.value.set(w * dpr, h * dpr);
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _creaComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scena, this.camera));
    this._tsH = new ShaderPass(ShaderTiltShift);
    this._tsV = new ShaderPass(ShaderTiltShift);
    this._tsV.uniforms.direzione.value.set(0, 1);
    this.composer.addPass(this._tsH);
    this.composer.addPass(this._tsV);
    this.composer.addPass(new OutputPass());
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /** Intensità del tilt-shift (0 = spento). */
  impostaTiltShift(quantita) {
    this.tiltShift = quantita > 0;
    if (this.tiltShift && !this.composer) this._creaComposer();
    if (!this.composer) return;
    this._tsH.uniforms.quantita.value = quantita;
    this._tsV.uniforms.quantita.value = quantita;
  }

  /** Scala la risoluzione di rendering (qualità adattiva): 1 = nativa capata. */
  setScalaRender(f) {
    const dpr = Math.max(0.5, Math.min(devicePixelRatio, this.dprMax) * f);
    if (Math.abs(dpr - this.renderer.getPixelRatio()) < 0.02) return;
    this.renderer.setPixelRatio(dpr);
    this.dimensiona(Math.max(1, innerWidth), Math.max(1, innerHeight));
  }

  /** La banda a fuoco insegue un punto del mondo (il gatto), con dolcezza. */
  fuocoSu(puntoMondo, dt) {
    if (!this.tiltShift || !this.composer) return;   // niente lavoro se il blur è spento
    const p = puntoMondo.clone().project(this.camera);
    if (p.z < 1) {
      const y = THREE.MathUtils.clamp((p.y + 1) / 2, 0.12, 0.88);
      this._fuoco += (y - this._fuoco) * Math.min(1, dt * 5);
    }
    this._tsH.uniforms.fuoco.value = this._fuoco;
    this._tsV.uniforms.fuoco.value = this._fuoco;
  }

  orbita(dx, dy) {
    this.yaw -= dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, CAMERA.pitchMin, CAMERA.pitchMax);
  }

  zoom(fattore) {
    this.distanza = THREE.MathUtils.clamp(this.distanza * fattore, CAMERA.distMin, CAMERA.distMax);
  }

  segui(punto, dt) {
    const k = 1 - Math.exp(-CAMERA.inseguimento * dt);
    this.bersaglio.lerp(punto, k);
  }

  aggiorna() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.bersaglio.x + this.distanza * cp * Math.sin(this.yaw),
      this.bersaglio.y + this.distanza * sp,
      this.bersaglio.z + this.distanza * cp * Math.cos(this.yaw),
    );
    // la camera NON attraversa i muri (solo BLOCCHI: i furni non contano, sono
    // esili — e col clamp secco facevano VIBRARE la camera). La distanza è
    // AMMORTIZZATA: rientra svelta davanti a un muro, si riallunga piano.
    if (this.solido && !this.fantasma) {
      const b = this.bersaglio, c = this.camera.position;
      const dx = c.x - b.x, dy = c.y - b.y, dz = c.z - b.z;
      const dist = Math.hypot(dx, dy, dz);
      const passi = Math.ceil(dist / 0.4);
      let voluta = dist;
      for (let i = 3; i <= passi; i++) {
        const t = i / passi;
        if (this.solido(Math.floor(b.x + dx * t), Math.floor(b.y + dy * t), Math.floor(b.z + dz * t))) {
          voluta = Math.max(2, dist * (i - 1.2) / passi);
          break;
        }
      }
      if (this._distCam === undefined || this._distCam === null) this._distCam = voluta;
      this._distCam += (voluta - this._distCam) * (voluta < this._distCam ? 0.55 : 0.07);
      const f = this._distCam / dist;
      this.camera.position.set(b.x + dx * f, b.y + dy * f, b.z + dz * f);
    }
    this.camera.lookAt(this.bersaglio);
  }

  // (qui viveva passProfondita(): rendeva la profondità della scena senza
  // trasparenti per una schiuma di bordo calcolata per confronto. Il consumatore
  // — impostaProfondita/uProfondita nello shader dell'acqua — è stato sostituito
  // dal gradiente aRiva del mesher, che conosce la geometria vera invece di
  // indovinarla dai pixel. Restava solo il PRODUTTORE: un metodo senza chiamanti
  // in tutto src/, più un render target ridimensionato a metà canvas a ogni
  // resize. Via anche quello.)

  render() {
    if (this.tiltShift && this.composer) this.composer.render();
    else this.renderer.render(this.scena, this.camera);
  }
}
