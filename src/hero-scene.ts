import {
  ACESFilmicToneMapping,
  Box3,
  BufferGeometry,
  Color,
  FrontSide,
  Group,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const ASSETS = "https://storage.getlayers.ai/assets/kimi-04a9449ab2/hero/scene";

export type TierName = "mobile" | "tablet" | "desktop";

export interface SceneTier {
  name: TierName;
  mobile: boolean;
  coarsePointer: boolean;
  reducedMotion: boolean;
  maxDpr: number;
  frameInterval: number;
  pointerEnabled: boolean;
  antialias: boolean;
  trailSamples: number;
  outline: boolean;
  reveal: boolean;
  freeze: boolean;
}

const CAP_60 = 1000 / 60 - 2;

const isEnergySaver = (): boolean => {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  return Boolean(nav.connection?.saveData) || (nav.deviceMemory ?? 8) <= 2;
};

export const getSceneTier = (): SceneTier => {
  const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const width = window.innerWidth;
  const name: TierName =
    width < 768 || (coarse && width < 1024)
      ? "mobile"
      : coarse || width < 1280
        ? "tablet"
        : "desktop";

  const mobile = name === "mobile";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saver = isEnergySaver();

  return {
    name,
    mobile,
    coarsePointer: coarse,
    reducedMotion,
    maxDpr: mobile ? 1 : name === "tablet" ? 1.25 : 1.5,
    frameInterval: name === "desktop" ? 0 : CAP_60,
    pointerEnabled: !coarse && !reducedMotion,
    antialias: name === "desktop",
    trailSamples: mobile ? 28 : name === "tablet" ? 44 : 72,
    outline: !mobile,
    reveal: !mobile,
    freeze: reducedMotion || (mobile && saver),
  };
};

const readToken = (token: string): string => {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${token})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
};

const HEAD_HEIGHT = 5.4;
const DEG = Math.PI / 180;

const swing = (v: number, ampDeg: number, curve: number) => {
  const amp = ampDeg * DEG;
  if (curve < 1e-3) return amp * v;
  return (amp * Math.tanh(curve * v)) / Math.tanh(curve);
};

const HELMET_WORN_OFFSET = new Vector3(0, -0.56, 0.35);
const HEAD_EXTEND = 0.14;
const STATIC_POSE = { x: 0.3, y: 0.1 };

export const CAMERA_FOV = 35;
export const CAMERA_Y = 0.1;

export const visibleWorldHeight = (cameraZ: number) =>
  2 * cameraZ * Math.tan((CAMERA_FOV * Math.PI) / 360);

export const fitSubjectToBox = (
  params: { subjectScale: number; subjectY: number; cameraZ: number },
  box: { top: number; height: number },
  canvasHeight: number
) => {
  if (canvasHeight <= 0 || box.height <= 0) {
    return { subjectScale: params.subjectScale, subjectY: params.subjectY };
  }
  const ratio = box.height / canvasHeight;
  const world = visibleWorldHeight(params.cameraZ);
  const centreShift = canvasHeight / 2 - (box.top + box.height / 2);
  return {
    subjectScale: params.subjectScale * ratio,
    subjectY:
      CAMERA_Y +
      (params.subjectY - CAMERA_Y) * ratio +
      (centreShift * world) / canvasHeight,
  };
};

const OUTLINE_MAX_WAVES = 8;
const BACKDROP_Z = -3;
const REFERENCE_ASPECT = 1.778;
const PORT_WIDTH = 1440;
const MIN_FIT = 0.9;
const NARROW_STEP = 0.25;
const STEP_UNDER = 1280;

const AUTO_SWEEP_PATH = [
  { x: -0.85, y: -0.62 },
  { x: 0.78, y: -0.2 },
  { x: -0.7, y: 0.2 },
  { x: 0.82, y: 0.6 },
] as const;

const revealTrailFunction = (
  name: string,
  trail: string,
  boundsMin: string,
  boundsMax: string,
  pace: string,
  warp: string,
  length: string,
  radius: string,
  samples: number
) => `
  float ${name}(vec2 ndc) {
    float gate = smoothstep(uGateStart, uGateStart + uGateWidth, ${pace});
    if (gate <= 0.0) return 0.0;

    vec2 bounded = vec2(ndc.x * uAspect, ndc.y);
    if (any(lessThan(bounded, ${boundsMin})) || any(greaterThan(bounded, ${boundsMax}))) {
      return 0.0;
    }

    vec2 point = bounded;
    if (${warp} > 0.001) {
      vec2 noiseUv = ndc * 0.5 + 0.5;
      float nx = texture2D(uNoiseTex, noiseUv * uWarpScale + vec2(uTime * 0.07, uTime * 0.05)).r;
      float ny = texture2D(uNoiseTex, noiseUv * uWarpScale * 1.4 - vec2(uTime * 0.06, uTime * 0.09)).r;
      point += (vec2(nx, ny) - 0.5) * ${warp} * 0.22;
    }

    float radius = ${radius} * mix(uIdleScale, 1.0, ${pace});
    float taper = uTaper * mix(uTaperIdle, uTaperFast, ${pace});

    float span = max(${length} * float(${samples} - 1), 1.0);
    float ceiling = uThreshold + uEdge;
    float trail = 0.0;
    for (int i = 0; i < ${samples} - 1; i++) {
      if (float(i) >= span) break;
      float weight = pow(1.0 - float(i) / span, taper);
      if (weight <= trail) break;

      vec2 a = vec2(${trail}[i].x * uAspect, ${trail}[i].y);
      vec2 b = vec2(${trail}[i + 1].x * uAspect, ${trail}[i + 1].y);
      float r = radius * weight;
      trail = max(trail, weight * smoothstep(r, r * 0.35, revealSegment(point, a, b)));
      if (trail >= ceiling) break;
    }

    return smoothstep(uThreshold - uEdge, uThreshold + uEdge, trail) * gate;
  }
`;

const buildRevealDeclarations = (samples: number) => `
  uniform vec2 uTrail[${samples}];
  uniform vec2 uTrailMin;
  uniform vec2 uTrailMax;
  uniform float uPace;
  uniform vec2 uSweep[${samples}];
  uniform vec2 uSweepMin;
  uniform vec2 uSweepMax;
  uniform float uSweepPace;
  uniform float uSweepWarp;
  uniform float uSweepLength;
  uniform float uSweepRadius;
  uniform float uAspect;
  uniform float uRadius;
  uniform float uIdleScale;
  uniform float uTaper;
  uniform float uTaperIdle;
  uniform float uTaperFast;
  uniform float uLength;
  uniform float uGateStart;
  uniform float uGateWidth;
  uniform float uWarpScale;
  uniform float uTime;
  uniform float uEdge;
  uniform float uThreshold;
  uniform float uWarp;
  uniform float uRevealMix;
  uniform sampler2D uNoiseTex;

  float revealSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
  }

  ${revealTrailFunction("revealCursorTrail", "uTrail", "uTrailMin", "uTrailMax", "uPace", "uWarp", "uLength", "uRadius", samples)}
  ${revealTrailFunction("revealSweepTrail", "uSweep", "uSweepMin", "uSweepMax", "uSweepPace", "uSweepWarp", "uSweepLength", "uSweepRadius", samples)}

  float revealTrail(vec2 ndc) {
    float cursor = revealCursorTrail(ndc);
    if (cursor >= 1.0) return 1.0;
    return max(cursor, revealSweepTrail(ndc));
  }
`;

export interface HeroSceneParams {
  cameraZ: number;
  subjectScale: number;
  subjectX: number;
  subjectY: number;
  subjectParallax: number;
  riseDistance: number;
  riseDuration: number;
  headScale: number;
  headY: number;
  headParallax: number;
  headRelight: number;
  helmetScale: number;
  helmetX: number;
  helmetY: number;
  helmetZ: number;
  helmetFollow: number;
  helmetAmpX: number;
  helmetCurveX: number;
  helmetAmpY: number;
  helmetCurveY: number;
  helmetBrightness: number;
  trailRadius: number;
  trailIdleScale: number;
  trailTaper: number;
  trailTaperIdle: number;
  trailTaperFast: number;
  trailLength: number;
  revealThreshold: number;
  revealEdge: number;
  revealWarp: number;
  revealWarpScale: number;
  revealSpeed: number;
  pointerLerp: number;
  pacePeak: number;
  paceAttack: number;
  paceRelease: number;
  paceThreshold: number;
  paceRamp: number;
  outlinePeriod: number;
  sweepWarp: number;
  sweepLength: number;
  sweepRadius: number;
  outlineStagger: number;
  outlineOpacity: number;
  outlineWidth: number;
  outlineBase: number;
  outlineLightness: number;
  bgLineScale: number;
  bgLineCount: number;
  bgLineThickness: number;
  bgLineOpacity: number;
  bgWaveAmount: number;
  bgWaveSpeed: number;
  bgRevealLightness: number;
  bgRevealLightnessAlt: number;
  bgRevealOpacity: number;
  introDuration: number;
  burnStart: number;
  burnSoftness: number;
  burnGlow: number;
  autoSweepAmount: number;
  autoSweepPeriod: number;
  autoSweepStroke: number;
  autoSweepHold: number;
}

export const DEFAULT_PARAMS: HeroSceneParams = {
  cameraZ: 6.5,
  subjectScale: 1.15,
  subjectX: 0,
  subjectY: 0.42,
  subjectParallax: 0.02,
  riseDistance: 200,
  riseDuration: 2,
  headScale: 0.8,
  headY: 0.58,
  headParallax: 0.005,
  headRelight: 0.32,
  helmetScale: 0.69,
  helmetX: -0.08,
  helmetY: 0.45,
  helmetZ: 0,
  helmetFollow: 0.01,
  helmetAmpX: 2.5,
  helmetCurveX: 0,
  helmetAmpY: 2.1,
  helmetCurveY: 0,
  helmetBrightness: 1,
  trailRadius: 0.46,
  trailIdleScale: 0.28,
  trailTaper: 1.9,
  trailTaperIdle: 1.6,
  trailTaperFast: 1.25,
  trailLength: 0.64,
  revealThreshold: 0.08,
  revealEdge: 0.005,
  revealWarp: 1.29,
  revealWarpScale: 2.9,
  revealSpeed: 1.25,
  pointerLerp: 0.17,
  pacePeak: 0.029,
  paceAttack: 0.09,
  paceRelease: 0.205,
  paceThreshold: 0.06,
  paceRamp: 0.15,
  outlinePeriod: 3.1,
  sweepWarp: 0.86,
  sweepLength: 0.67,
  sweepRadius: 0.33,
  outlineStagger: 1.2,
  outlineOpacity: 0.09,
  outlineWidth: 0.15,
  outlineBase: 0,
  outlineLightness: 0.64,
  bgLineScale: 3.8,
  bgLineCount: 2.5,
  bgLineThickness: 1.4,
  bgLineOpacity: 0.85,
  bgWaveAmount: 0.37,
  bgWaveSpeed: 1.66,
  bgRevealLightness: 0.62,
  bgRevealLightnessAlt: 0.44,
  bgRevealOpacity: 1,
  introDuration: 4,
  burnStart: 0.14,
  burnSoftness: 0.02,
  burnGlow: 4,
  autoSweepAmount: 0,
  autoSweepPeriod: 5,
  autoSweepStroke: 0.45,
  autoSweepHold: 0,
};

const outlineVertex = `
  varying float vHeight;
  uniform float uMinY;
  uniform float uRangeY;
  void main() {
    vHeight = (position.y - uMinY) / max(uRangeY, 0.0001);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const outlineFragment = `
  varying float vHeight;
  uniform float uTime;
  uniform float uPeriod;
  uniform float uStagger;
  uniform float uOpacity;
  uniform float uBase;
  uniform float uWidth;
  uniform float uLightness;
  uniform float uRevealMix;
  uniform vec3 uColor;

  void main() {
    float width = max(uWidth, 0.0001);
    float period = max(uPeriod, 0.0001);
    float stagger = max(uStagger, 0.0001);
    float start = 1.0 + width * 3.0;
    float travel = 1.0 + width * 6.0;

    float wave = 0.0;
    for (int i = 0; i < ${OUTLINE_MAX_WAVES}; i++) {
      float age = mod(uTime, stagger) + float(i) * stagger;
      if (age > period) break;
      float centre = start - (age / period) * travel;
      float d = (vHeight - centre) / width;
      wave = max(wave, exp(-d * d));
    }

    vec3 stroke = mix(uColor, vec3(1.0), uLightness);
    gl_FragColor = vec4(stroke, (uBase + wave * uOpacity) * uRevealMix);
  }
`;

const backdropVertex = `
  varying vec4 vBackdropClip;
  void main() {
    vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vBackdropClip = clip;
    gl_Position = clip;
  }
`;

const buildBackdropFragment = (samples: number) => `
  varying vec4 vBackdropClip;
  uniform vec3 uBackground;
  uniform vec3 uLineColor;
  uniform vec3 uRevealColor;
  uniform vec3 uRevealColorAlt;
  uniform float uLineScale;
  uniform float uLineCount;
  uniform float uLineThickness;
  uniform float uLineOpacity;
  uniform float uWaveAmount;
  uniform float uWaveSpeed;
  uniform float uRevealOpacity;
  ${buildRevealDeclarations(samples)}

  float backdropField(vec2 p, float t) {
    float f = sin(p.x * 1.00 + t * 0.60) * 0.50;
    f += sin(p.y * 0.85 - t * 0.45) * 0.45;
    f += sin((p.x + p.y) * 0.65 + t * 0.35) * 0.35;
    f += sin((p.x - p.y) * 0.95 - t * 0.55) * 0.25;
    return f * 0.5 + 0.5;
  }

  void main() {
    vec2 ndc = vBackdropClip.xy / vBackdropClip.w;
    vec2 p = vec2(ndc.x * uAspect, ndc.y) * uLineScale;

    float t = uTime * uWaveSpeed;
    vec2 q = p;
    q.x += sin(p.y * 0.8 + t * 0.7) * uWaveAmount;
    q.y += cos(p.x * 0.7 - t * 0.6) * uWaveAmount;

    float scaled = backdropField(q, t) * uLineCount;
    float w = max(fwidth(scaled) * uLineThickness, 1e-5);
    float line = 1.0 - smoothstep(0.0, w, abs(fract(scaled) - 0.5));

    vec3 color = mix(uBackground, uLineColor, line * uLineOpacity * uRevealMix);
    float parity = mod(floor(scaled + 0.5), 2.0);
    vec3 revealShade = mix(uRevealColor, uRevealColorAlt, parity);

    if (uRevealOpacity > 0.001) {
      color = mix(
        color,
        revealShade,
        revealTrail(ndc) * uRevealMix * uRevealOpacity
      );
    }

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const headVertex = `
  uniform float uExtend;
  varying vec2 vUv;
  void main() {
    vUv = vec2(uv.x, 1.0 - (1.0 - uv.y) * (1.0 + uExtend));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const headFragment = `
  uniform sampler2D uDiffuse;
  uniform sampler2D uDepth;
  uniform sampler2D uAlpha;
  uniform sampler2D uNormal;
  uniform vec2 uParallax;
  uniform float uReveal;
  uniform float uDepthScale;
  uniform float uRelight;
  varying vec2 vUv;
  void main() {
    float depth = texture2D(uDepth, vUv).r;
    vec2 offset = uParallax * (depth - 0.5) * uDepthScale;
    vec2 uv = vUv + offset;
    vec4 color = texture2D(uDiffuse, uv);
    float alpha = texture2D(uAlpha, uv).r;

    vec3 normal = normalize(texture2D(uNormal, uv).rgb * 2.0 - 1.0);
    vec3 lightDir = normalize(vec3(uParallax * 1.6, 1.0));
    float lambert = max(dot(normal, lightDir), 0.0) - 0.72;
    vec3 lit = color.rgb * (1.0 + lambert * uRelight);

    gl_FragColor = vec4(clamp(lit, 0.0, 1.0), alpha * uReveal);
    #include <colorspace_fragment>
  }
`;

export class HeroScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
  private headMaterial: ShaderMaterial | null = null;
  private headMesh: Mesh | null = null;
  private shellMaterial: MeshStandardMaterial | null = null;
  private helmetTextures: Texture[] = [];
  private revealUniforms: any = null;
  private outlineMaterial: ShaderMaterial | null = null;
  private outlineMesh: Mesh | null = null;
  private readonly samples: number;
  private readonly trail: Vector2[];
  private helmetGroup = new Group();
  private helmetPivot = new Group();
  private subjectGroup = new Group();
  private backdropMesh: Mesh | null = null;
  private backdropMaterial: ShaderMaterial | null = null;
  private params: HeroSceneParams = { ...DEFAULT_PARAMS };
  private pointer = { x: 0, y: 0 };
  private smoothed = { x: 0, y: 0 };
  private lastSmoothed = { x: 0, y: 0 };
  private pointerSeen = false;
  private tilt = 0;
  private yaw = 0;
  private pace = 0;
  private readyAt: number | null = null;
  private intro = 0;
  private viewportHeight = 1;
  private viewportWidth = 1;
  private riseStarted = false;
  private riseAt: number | null = null;
  private sweepPointer: { x: number; y: number } = { x: AUTO_SWEEP_PATH[0].x, y: AUTO_SWEEP_PATH[0].y };
  private sweepSmoothed = { ...this.sweepPointer };
  private sweepLast = { ...this.sweepPointer };
  private sweepPace = 0;
  private sweepCycle = 0;
  private readonly sweepTrail: Vector2[];
  private aspect = 1;
  private reveal = 0;
  private settled = false;
  private disposed = false;
  private startTime: number | null = null;

  private _tier: SceneTier;
  get tier(): SceneTier {
    return this._tier;
  }

  ready = false;
  onReady: (() => void) | null = null;
  onError: ((url: string) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this._tier = getSceneTier();
    this.samples = this._tier.trailSamples;
    this.trail = Array.from({ length: this.samples }, () => new Vector2(STATIC_POSE.x, -STATIC_POSE.y));
    this.sweepTrail = Array.from({ length: this.samples }, () => new Vector2(AUTO_SWEEP_PATH[0].x, -AUTO_SWEEP_PATH[0].y));
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: false,
      antialias: this._tier.antialias,
      stencil: false,
      powerPreference: this._tier.mobile ? "default" : "high-performance",
    });
    this.renderer.setClearColor(new Color("#f7fafb"));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this._tier.maxDpr));
    this.renderer.toneMapping = ACESFilmicToneMapping;

    if (!this._tier.pointerEnabled) this.parkPointer();

    this.camera.position.set(0, CAMERA_Y, 6.5);
    this.helmetGroup.add(this.helmetPivot);
    this.subjectGroup.add(this.helmetGroup);
    this.scene.add(this.subjectGroup);

    void this.load();
  }

  retune(): SceneTier {
    const fresh = getSceneTier();
    const previous = this._tier;
    const tier: SceneTier = {
      ...fresh,
      antialias: previous.antialias,
      trailSamples: previous.trailSamples,
    };
    this._tier = tier;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier.maxDpr));
    if (this.outlineMesh) this.outlineMesh.visible = tier.outline;
    if (!tier.pointerEnabled) this.parkPointer();
    else if (!previous.pointerEnabled) this.pointerSeen = false;
    if (!tier.freeze) this.settled = false;
    return tier;
  }

  private parkPointer() {
    this.pointer = { ...STATIC_POSE };
    this.smoothed = { ...STATIC_POSE };
    this.lastSmoothed = { ...STATIC_POSE };
    this.tilt = this.pitchFor(STATIC_POSE.y);
    this.yaw = this.yawFor(STATIC_POSE.x);
    this.pointerSeen = false;
  }

  beginRise() {
    this.riseStarted = true;
  }

  setPointer(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
    if (!this.pointerSeen) {
      this.pointerSeen = true;
      this.smoothed.x = x;
      this.smoothed.y = y;
      this.lastSmoothed.x = x;
      this.lastSmoothed.y = y;
      this.tilt = this.pitchFor(y);
      this.yaw = this.yawFor(x);
    }
  }

  private pitchFor(y: number) {
    return swing(y, this.params.helmetAmpX, this.params.helmetCurveX);
  }

  private yawFor(x: number) {
    return swing(x, this.params.helmetAmpY, this.params.helmetCurveY);
  }

  setParams(partial: Partial<HeroSceneParams>) {
    Object.assign(this.params, partial);
    this.settled = false;
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.viewportHeight = Math.max(height, 1);
    this.viewportWidth = Math.max(width, 1);
    this.aspect = width / height;
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    if (this.revealUniforms) this.revealUniforms.uAspect.value = this.aspect;
  }

  update(time: number) {
    if (this.disposed || this.settled) return;
    if (this.startTime === null) this.startTime = time;
    const t = (time - this.startTime) / 1000;
    const p = this.params;

    if (this._tier.freeze && this.reveal > 0.995 && this.intro >= 1) {
      this.settled = true;
    }

    const autoEnabled = p.autoSweepAmount > 0 && !this._tier.freeze && this.intro >= 1;
    if (autoEnabled) {
      const cycle = t % Math.max(p.autoSweepPeriod, 0.001);
      if (cycle < this.sweepCycle) this.resetSweep();
      this.sweepCycle = cycle;

      const legs = AUTO_SWEEP_PATH.length - 1;
      const stroke = Math.max(p.autoSweepStroke, 0.05);
      const slot = stroke + Math.max(p.autoSweepHold, 0);
      const leg = Math.floor(cycle / slot);

      if (leg < legs) {
        const local = Math.min(1, (cycle - leg * slot) / stroke);
        const eased = 1 - (1 - local) * (1 - local);
        const from = AUTO_SWEEP_PATH[leg];
        const to = AUTO_SWEEP_PATH[leg + 1];
        this.sweepPointer.x = (from.x + (to.x - from.x) * eased) * p.autoSweepAmount;
        this.sweepPointer.y = (from.y + (to.y - from.y) * eased) * p.autoSweepAmount;
      }
    }

    this.sweepSmoothed.x += (this.sweepPointer.x - this.sweepSmoothed.x) * p.pointerLerp;
    this.sweepSmoothed.y += (this.sweepPointer.y - this.sweepSmoothed.y) * p.pointerLerp;

    const sweepStep = Math.hypot(
      this.sweepSmoothed.x - this.sweepLast.x,
      this.sweepSmoothed.y - this.sweepLast.y
    );
    const sweepTarget = autoEnabled ? Math.min(1, sweepStep / Math.max(p.pacePeak, 1e-5)) : 0;
    this.sweepPace += (sweepTarget - this.sweepPace) * (sweepTarget > this.sweepPace ? p.paceAttack : p.paceRelease);
    this.sweepLast.x = this.sweepSmoothed.x;
    this.sweepLast.y = this.sweepSmoothed.y;

    const oldestSweep = this.sweepTrail.pop();
    if (oldestSweep) {
      oldestSweep.set(this.sweepSmoothed.x, -this.sweepSmoothed.y);
      this.sweepTrail.unshift(oldestSweep);
    }

    this.smoothed.x += (this.pointer.x - this.smoothed.x) * p.pointerLerp;
    this.smoothed.y += (this.pointer.y - this.smoothed.y) * p.pointerLerp;

    if (this.ready) {
      if (this.readyAt === null) this.readyAt = t;
      this.intro = Math.min(1, (t - this.readyAt) / Math.max(p.introDuration, 0.001));
      if (this._tier.freeze) this.intro = 1;
    }

    this.camera.position.z = p.cameraZ;
    this.subjectGroup.scale.setScalar(p.subjectScale * this.narrowFit());
    this.subjectGroup.position.x =
      p.subjectX +
      (this.viewportWidth < STEP_UNDER && this.aspect >= 1.2 ? NARROW_STEP : 0) +
      this.smoothed.x * p.subjectParallax;
    this.subjectGroup.position.y =
      p.subjectY - this.smoothed.y * p.subjectParallax - this.riseOffset(t, p);

    if (this.headMaterial) {
      this.headMaterial.uniforms.uParallax.value.set(this.smoothed.x, -this.smoothed.y);
      this.headMaterial.uniforms.uReveal.value = this.reveal;
      this.headMaterial.uniforms.uDepthScale.value = p.headParallax;
      this.headMaterial.uniforms.uRelight.value = p.headRelight;
    }
    if (this.headMesh) {
      this.headMesh.scale.setScalar(p.headScale);
      this.headMesh.position.y = -0.55 + p.headY - (HEAD_HEIGHT * HEAD_EXTEND * p.headScale) / 2;
    }

    this.tilt += (this.pitchFor(this.smoothed.y) - this.tilt) * p.pointerLerp;
    this.yaw += (this.yawFor(this.smoothed.x) - this.yaw) * p.pointerLerp;
    this.helmetPivot.rotation.x = this.tilt;
    this.helmetPivot.rotation.y = this.yaw;
    this.helmetGroup.position.x = p.helmetX + this.smoothed.x * p.helmetFollow;
    this.helmetGroup.position.y = p.helmetY - this.smoothed.y * p.helmetFollow * 0.8;
    this.helmetGroup.position.z = p.helmetZ;
    this.helmetGroup.scale.setScalar(p.helmetScale);

    const step = Math.hypot(
      this.smoothed.x - this.lastSmoothed.x,
      this.smoothed.y - this.lastSmoothed.y
    );
    if (this._tier.pointerEnabled) {
      const target = Math.min(1, step / Math.max(p.pacePeak, 1e-5));
      this.pace += (target - this.pace) * (target > this.pace ? p.paceAttack : p.paceRelease);
    } else if (!autoEnabled && this.intro >= 1 && this._tier.reveal) {
      this.pace = 1;
    }
    this.lastSmoothed.x = this.smoothed.x;
    this.lastSmoothed.y = this.smoothed.y;

    const oldest = this.trail.pop();
    if (oldest) {
      oldest.set(this.smoothed.x, -this.smoothed.y);
      this.trail.unshift(oldest);
    }

    if (this.revealUniforms) {
      this.revealUniforms.uAspect.value = this.aspect;
      this.revealUniforms.uRadius.value = p.trailRadius;
      this.revealUniforms.uIdleScale.value = p.trailIdleScale;
      this.revealUniforms.uTaper.value = p.trailTaper;
      this.revealUniforms.uTaperIdle.value = p.trailTaperIdle;
      this.revealUniforms.uTaperFast.value = p.trailTaperFast;
      this.revealUniforms.uLength.value = p.trailLength;
      this.revealUniforms.uPace.value = this.pace;
      this.revealUniforms.uGateStart.value = p.paceThreshold;
      this.revealUniforms.uGateWidth.value = p.paceRamp;
      this.revealUniforms.uWarpScale.value = p.revealWarpScale;
      this.revealUniforms.uTime.value = t * p.revealSpeed;
      this.revealUniforms.uRevealMix.value = this.reveal;
      this.revealUniforms.uThreshold.value = p.revealThreshold;
      this.revealUniforms.uEdge.value = p.revealEdge;
      this.revealUniforms.uWarp.value = p.revealWarp;
      this.revealUniforms.uIntro.value = this.intro;
      this.revealUniforms.uBurnStart.value = p.burnStart;
      this.revealUniforms.uBurnSoft.value = p.burnSoftness;
      this.revealUniforms.uBurnGlow.value = p.burnGlow;

      this.revealUniforms.uSweepPace.value = this.sweepPace;
      this.revealUniforms.uSweepWarp.value = p.sweepWarp;
      this.revealUniforms.uSweepLength.value = p.sweepLength;
      this.revealUniforms.uSweepRadius.value = p.sweepRadius;

      this.writeTrailBounds(
        this.trail,
        p.trailLength,
        p.revealWarp,
        p.trailRadius,
        this.revealUniforms.uTrailMin.value,
        this.revealUniforms.uTrailMax.value
      );
      this.writeTrailBounds(
        this.sweepTrail,
        p.sweepLength,
        p.sweepWarp,
        p.sweepRadius,
        this.revealUniforms.uSweepMin.value,
        this.revealUniforms.uSweepMax.value
      );
    }

    if (this.backdropMesh && this.backdropMaterial) {
      const distance = this.camera.position.z - BACKDROP_Z;
      const height = 2 * distance * Math.tan((this.camera.fov * Math.PI) / 360) * 1.06;
      this.backdropMesh.scale.set(height * this.aspect, height, 1);

      const bg = this.backdropMaterial.uniforms;
      bg.uLineScale.value = p.bgLineScale;
      bg.uLineCount.value = p.bgLineCount;
      bg.uLineThickness.value = p.bgLineThickness;
      bg.uLineOpacity.value = p.bgLineOpacity;
      bg.uWaveAmount.value = p.bgWaveAmount;
      bg.uWaveSpeed.value = p.bgWaveSpeed;
      bg.uRevealOpacity.value = p.bgRevealOpacity;
      (bg.uRevealColor.value as Color).setScalar(p.bgRevealLightness);
      (bg.uRevealColorAlt.value as Color).setScalar(p.bgRevealLightnessAlt);
    }

    if (this.outlineMaterial) {
      const outline = this.outlineMaterial.uniforms;
      outline.uTime.value = t;
      outline.uPeriod.value = p.outlinePeriod;
      outline.uStagger.value = p.outlineStagger;
      outline.uOpacity.value = p.outlineOpacity;
      outline.uWidth.value = p.outlineWidth;
      outline.uLightness.value = p.outlineLightness;
      outline.uBase.value = p.outlineBase;
      outline.uRevealMix.value = this.reveal * this.burnProgress(p);
    }

    this.shellMaterial?.color.setScalar(p.helmetBrightness);
    this.renderer.render(this.scene, this.camera);
  }

  private riseOffset(t: number, p: HeroSceneParams): number {
    if (this._tier.freeze || p.riseDistance === 0) return 0;
    let remaining = 1;
    if (this.riseStarted) {
      if (this.riseAt === null) this.riseAt = t;
      const u = Math.min(1, (t - this.riseAt) / Math.max(p.riseDuration, 0.001));
      remaining = 1 - (1 - (1 - u) * (1 - u));
    }
    if (remaining <= 0) return 0;
    const visible = 2 * p.cameraZ * Math.tan((this.camera.fov * Math.PI) / 360);
    return remaining * p.riseDistance * (visible / this.viewportHeight);
  }

  private burnProgress(p: HeroSceneParams): number {
    const span = Math.max(1 - p.burnStart, 1e-4);
    const x = Math.min(1, Math.max(0, (this.intro - p.burnStart) / span));
    return x * x * (3 - 2 * x);
  }

  private resetSweep() {
    const start = AUTO_SWEEP_PATH[0];
    const amount = this.params.autoSweepAmount;
    const x = start.x * amount;
    const y = start.y * amount;
    this.sweepPointer.x = x;
    this.sweepPointer.y = y;
    this.sweepSmoothed.x = x;
    this.sweepSmoothed.y = y;
    this.sweepLast.x = x;
    this.sweepLast.y = y;
    this.sweepPace = 0;
    for (const sample of this.sweepTrail) sample.set(x, -y);
  }

  private narrowFit() {
    if (this.viewportWidth >= PORT_WIDTH) return 1;
    if (this.aspect < 1.2) return 1;
    return Math.max(MIN_FIT, Math.min(1, this.aspect / REFERENCE_ASPECT));
  }

  private writeTrailBounds(
    trail: Vector2[],
    length: number,
    warp: number,
    radius: number,
    min: Vector2,
    max: Vector2
  ) {
    const active = Math.min(trail.length, Math.ceil(length * (this.samples - 1)) + 1);
    const margin = radius + warp * 0.22 + 0.05;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < active; i++) {
      const sample = trail[i];
      const x = sample.x * this.aspect;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (sample.y < minY) minY = sample.y;
      if (sample.y > maxY) maxY = sample.y;
    }
    min.set(minX - margin, minY - margin);
    max.set(maxX + margin, maxY + margin);
  }

  dispose() {
    this.disposed = true;
    this.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value instanceof Texture) value.dispose();
        }
        material.dispose();
      }
    });
    this.renderer.dispose();
  }

  private async load() {
    const textureLoader = new TextureLoader();
    textureLoader.setCrossOrigin("anonymous");
    const loadTexture = (file: string, srgb = false, forGltf = false) =>
      new Promise<Texture>((resolve, reject) => {
        const url = `${ASSETS}/${file}`;
        textureLoader.load(
          url,
          (texture) => {
            if (srgb) texture.colorSpace = SRGBColorSpace;
            if (forGltf) texture.flipY = false;
            texture.minFilter = LinearMipmapLinearFilter;
            texture.generateMipmaps = true;
            resolve(texture);
          },
          undefined,
          (err) => {
            this.onError?.(url);
            reject(err);
          }
        );
      });

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/libs/draco/gltf/");
    const gltfLoader = new GLTFLoader();
    gltfLoader.setCrossOrigin("anonymous");
    gltfLoader.setDRACOLoader(dracoLoader);

    try {
      const [env, headMaps, helmetGltf, noise] = await Promise.all([
        new RGBELoader().loadAsync(`${ASSETS}/studio-light.hdr`).catch((err: any) => {
          this.onError?.(`${ASSETS}/studio-light.hdr`);
          throw err;
        }),
        Promise.all([
          loadTexture("person-diffuse.webp", true),
          loadTexture("person-depth.webp"),
          loadTexture("person-alpha.webp"),
          loadTexture("person-normal.webp"),
        ]),
        gltfLoader.loadAsync(`${ASSETS}/helmet3.glb`).catch((err: any) => {
          this.onError?.(`${ASSETS}/helmet3.glb`);
          throw err;
        }),
        loadTexture("noise.webp"),
      ]);

      if (this.disposed) return;

      const pmrem = new PMREMGenerator(this.renderer);
      this.scene.environment = pmrem.fromEquirectangular(env).texture;
      env.dispose();
      pmrem.dispose();

      this.buildHead(headMaps[0], headMaps[1], headMaps[2], headMaps[3]);
      this.buildHelmet(helmetGltf.scene, noise);
      this.buildBackdrop(noise);

      this.reveal = 1;

      for (const texture of [...headMaps, noise, ...this.helmetTextures]) {
        this.renderer.initTexture(texture);
      }
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.disposed) return;
      this.renderer.render(this.scene, this.camera);

      this.ready = true;
      this.onReady?.();
    } catch (err) {
      console.error("HeroScene load error:", err);
      // Let ready fire so veil lifts and fallback shows
      this.ready = true;
      this.onReady?.();
    }
  }

  private buildHead(diffuse: Texture, depth: Texture, alpha: Texture, normal: Texture) {
    this.headMaterial = new ShaderMaterial({
      vertexShader: headVertex,
      fragmentShader: headFragment,
      uniforms: {
        uDiffuse: { value: diffuse },
        uDepth: { value: depth },
        uAlpha: { value: alpha },
        uNormal: { value: normal },
        uParallax: { value: new Vector2() },
        uReveal: { value: 0 },
        uDepthScale: { value: DEFAULT_PARAMS.headParallax },
        uRelight: { value: DEFAULT_PARAMS.headRelight },
        uExtend: { value: HEAD_EXTEND },
      },
      transparent: true,
    });
    const geometry = new PlaneGeometry(HEAD_HEIGHT, HEAD_HEIGHT * (1 + HEAD_EXTEND));
    const head = new Mesh(geometry, this.headMaterial);
    head.position.set(0, -0.55, 0);
    this.headMesh = head;
    this.subjectGroup.add(head);
  }

  private buildHelmet(root: Group, noise: Texture) {
    noise.wrapS = RepeatWrapping;
    noise.wrapT = RepeatWrapping;

    this.revealUniforms = {
      uTrail: { value: this.trail },
      uTrailMin: { value: new Vector2(-1e3, -1e3) },
      uTrailMax: { value: new Vector2(1e3, 1e3) },
      uSweep: { value: this.sweepTrail },
      uSweepMin: { value: new Vector2(-1e3, -1e3) },
      uSweepMax: { value: new Vector2(1e3, 1e3) },
      uSweepPace: { value: 0 },
      uSweepWarp: { value: DEFAULT_PARAMS.sweepWarp },
      uSweepLength: { value: DEFAULT_PARAMS.sweepLength },
      uSweepRadius: { value: DEFAULT_PARAMS.sweepRadius },
      uAspect: { value: this.aspect },
      uRadius: { value: DEFAULT_PARAMS.trailRadius },
      uIdleScale: { value: DEFAULT_PARAMS.trailIdleScale },
      uTaper: { value: DEFAULT_PARAMS.trailTaper },
      uTaperIdle: { value: DEFAULT_PARAMS.trailTaperIdle },
      uTaperFast: { value: DEFAULT_PARAMS.trailTaperFast },
      uLength: { value: DEFAULT_PARAMS.trailLength },
      uPace: { value: 0 },
      uGateStart: { value: DEFAULT_PARAMS.paceThreshold },
      uGateWidth: { value: DEFAULT_PARAMS.paceRamp },
      uWarpScale: { value: DEFAULT_PARAMS.revealWarpScale },
      uTime: { value: 0 },
      uThreshold: { value: DEFAULT_PARAMS.revealThreshold },
      uEdge: { value: DEFAULT_PARAMS.revealEdge },
      uWarp: { value: DEFAULT_PARAMS.revealWarp },
      uRevealMix: { value: 0 },
      uNoiseTex: { value: noise },
      uIntro: { value: 0 },
      uBurnStart: { value: DEFAULT_PARAMS.burnStart },
      uBurnSoft: { value: DEFAULT_PARAMS.burnSoftness },
      uBurnGlow: { value: DEFAULT_PARAMS.burnGlow },
      uBurnColor: { value: new Color(readToken("--accent")) },
    };

    root.traverse((object) => {
      if (!(object as Mesh).isMesh) return;
      const mesh = object as Mesh;
      const shell = mesh.material as MeshStandardMaterial;
      shell.side = FrontSide;
      shell.transparent = true;
      shell.depthWrite = false;
      shell.envMapIntensity = 1.3;

      this.injectRevealMask(shell);
      mesh.renderOrder = 1;
      this.shellMaterial = shell;

      for (const map of [shell.map, shell.normalMap, shell.roughnessMap, shell.metalnessMap]) {
        if (map && !this.helmetTextures.includes(map)) {
          this.helmetTextures.push(map);
        }
      }
    });

    const bounds = new Box3().setFromObject(root);
    const size = bounds.getSize(new Vector3());
    const scale = (HEAD_HEIGHT * 0.56) / size.y;
    root.scale.setScalar(scale);
    bounds.setFromObject(root);
    const center = bounds.getCenter(new Vector3());
    root.position.sub(center);
    this.helmetPivot.position.copy(HELMET_WORN_OFFSET);

    this.helmetPivot.add(root);
    this.helmetGroup.updateMatrixWorld(true);
    this.buildOutline(root);
  }

  private buildOutline(root: Group) {
    const toGroupLocal = this.helmetPivot.matrixWorld.clone().invert();
    const geometries: BufferGeometry[] = [];
    root.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new Matrix4().multiplyMatrices(toGroupLocal, mesh.matrixWorld));
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== "position") geometry.deleteAttribute(name);
      }
      geometries.push(geometry);
    });
    if (!geometries.length) return;

    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) return;

    merged.computeBoundingBox();
    const bounds = merged.boundingBox;
    const minY = bounds?.min.y ?? 0;
    const rangeY = bounds ? bounds.max.y - bounds.min.y : 1;

    this.outlineMaterial = new ShaderMaterial({
      vertexShader: outlineVertex,
      fragmentShader: outlineFragment,
      wireframe: true,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uPeriod: { value: DEFAULT_PARAMS.outlinePeriod },
        uStagger: { value: DEFAULT_PARAMS.outlineStagger },
        uOpacity: { value: DEFAULT_PARAMS.outlineOpacity },
        uWidth: { value: DEFAULT_PARAMS.outlineWidth },
        uLightness: { value: DEFAULT_PARAMS.outlineLightness },
        uBase: { value: DEFAULT_PARAMS.outlineBase },
        uRevealMix: { value: 0 },
        uColor: { value: new Color(readToken("--foreground")) },
        uMinY: { value: minY },
        uRangeY: { value: rangeY },
      },
    });

    const outline = new Mesh(merged, this.outlineMaterial);
    outline.renderOrder = 3;
    outline.visible = this._tier.outline;
    this.outlineMesh = outline;
    this.helmetPivot.add(outline);
  }

  private injectRevealMask(material: MeshStandardMaterial) {
    const uniforms = this.revealUniforms;
    if (!uniforms) return;

    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec4 vRevealClip;")
        .replace("#include <project_vertex>", "#include <project_vertex>\nvRevealClip = gl_Position;");

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           varying vec4 vRevealClip;
           uniform float uIntro;
           uniform float uBurnStart;
           uniform float uBurnSoft;
           uniform float uBurnGlow;
           uniform vec3 uBurnColor;
           ${buildRevealDeclarations(this.samples)}`
        )
        .replace(
          "#include <alphamap_fragment>",
          `#include <alphamap_fragment>
           vec2 revealNdc = vRevealClip.xy / vRevealClip.w;
           float burnFront = smoothstep(uBurnStart, 1.0, uIntro);
           float burnNoise = texture2D(uNoiseTex, revealNdc * 0.5 + 0.5).r;
           float burnHeight = 1.0 - (revealNdc.y * 0.5 + 0.5);
           float burnAt = mix(burnHeight, burnNoise, 0.45);
           float intact = smoothstep(burnFront - uBurnSoft, burnFront + uBurnSoft, burnAt);
           float mask = max(revealTrail(revealNdc), intact);
           diffuseColor.a *= mask * uRevealMix;
           float burnEdge = 4.0 * intact * (1.0 - intact);
           diffuseColor.rgb += uBurnColor * burnEdge * uBurnGlow * uRevealMix;`
        );
    };
  }

  private buildBackdrop(noise: Texture) {
    const uniforms = this.revealUniforms;
    if (!uniforms) return;

    this.backdropMaterial = new ShaderMaterial({
      vertexShader: backdropVertex,
      fragmentShader: buildBackdropFragment(this.samples),
      depthWrite: false,
      uniforms: {
        ...uniforms,
        uNoiseTex: { value: noise },
        uBackground: { value: new Color(readToken("--background")) },
        uLineColor: { value: new Color(readToken("--surface-soft")) },
        uRevealColor: { value: new Color().setScalar(DEFAULT_PARAMS.bgRevealLightness) },
        uRevealColorAlt: { value: new Color().setScalar(DEFAULT_PARAMS.bgRevealLightnessAlt) },
        uLineScale: { value: DEFAULT_PARAMS.bgLineScale },
        uLineCount: { value: DEFAULT_PARAMS.bgLineCount },
        uLineThickness: { value: DEFAULT_PARAMS.bgLineThickness },
        uLineOpacity: { value: DEFAULT_PARAMS.bgLineOpacity },
        uWaveAmount: { value: DEFAULT_PARAMS.bgWaveAmount },
        uWaveSpeed: { value: DEFAULT_PARAMS.bgWaveSpeed },
        uRevealOpacity: { value: DEFAULT_PARAMS.bgRevealOpacity },
      },
    });

    const backdrop = new Mesh(new PlaneGeometry(1, 1), this.backdropMaterial);
    backdrop.position.z = BACKDROP_Z;
    backdrop.renderOrder = -1;
    this.backdropMesh = backdrop;
    this.scene.add(backdrop);
  }
}
