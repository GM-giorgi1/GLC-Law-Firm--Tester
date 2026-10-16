import Lenis from "lenis";
import { subscribe, createSpring, SPRINGS, initTextReveal } from "./ticker.ts";
import { HeroScene, DEFAULT_PARAMS, fitSubjectToBox } from "./hero-scene.ts";
import {
  generateDotField,
  generateCircuitPoints,
  CIRCUIT_MARKERS,
  CIRCUIT_STEP,
  DOT_LATTICE,
  DOT_RADIUS,
  FLAG_CUT,
  TRACK_RIBBON,
  artboardToMap,
} from "./season-data.ts";
import {
  TIMELINE_ENTRIES,
  PLATE_OUTLINE,
  restingPoint,
  ROW_HEIGHT,
  TOP_PAD,
} from "./timeline-data.ts";
import { createContourRenderer } from "./marching-squares.ts";
import { initDissolveCanvas } from "./dissolve.ts";

// Force manual scroll restoration and scroll to top immediately
if (typeof history !== "undefined" && "scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}
window.scrollTo(0, 0);

// Root font size scaling for > 1920
const updateRootFont = () => {
  if (window.innerWidth > 1920) {
    document.documentElement.style.fontSize = `${(16 * window.innerWidth) / 1920}px`;
  } else if (window.innerWidth > 1440) {
    document.documentElement.style.fontSize = "0.833333vw";
  } else if (window.innerWidth > 1279) {
    document.documentElement.style.fontSize = "1.111111vw";
  } else {
    document.documentElement.style.fontSize = "16px";
  }
};
window.addEventListener("resize", updateRootFont);
updateRootFont();

// Error banner
const showAssetError = (url: string) => {
  const banner = document.getElementById("asset-error-banner");
  if (banner) {
    banner.style.display = "block";
    banner.textContent = `Asset failed to load: ${url}`;
  }
};

// Setup Lenis Smooth Scroll
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lenis: Lenis | null = null;
if (!reducedMotion) {
  lenis = new Lenis({ smoothWheel: true });
  subscribe((time) => lenis?.raf(time), () => 0);
}

// --------------------------------------------------------------------------
// 1. HERO SECTION & WEBGL SCENE
// --------------------------------------------------------------------------
const heroCanvas = document.getElementById("hero-canvas") as HTMLCanvasElement;
const heroSection = document.getElementById("layer-hero") as HTMLElement;
const heroFitBox = document.getElementById("hero-fit-box") as HTMLElement;

let heroScene: HeroScene | null = null;
let heroReady = false;

if (heroCanvas) {
  try {
    heroScene = new HeroScene(heroCanvas);
    heroScene.onError = (url) => showAssetError(url);
  } catch (e) {
    const bg = document.getElementById("hero-fallback-bg");
    const portrait = document.getElementById("hero-fallback-portrait");
    if (bg) {
      bg.setAttribute("src", "https://storage.getlayers.ai/assets/kimi-04a9449ab2/hero/ui/backdrop-lines.svg");
      bg.style.display = "block";
    }
    if (portrait) {
      portrait.setAttribute("src", "https://storage.getlayers.ai/assets/kimi-04a9449ab2/hero/scene/person-diffuse.webp");
      portrait.style.display = "block";
    }
  }
}

const applyFit = () => {
  if (!heroScene || !heroSection) return;
  const s = heroSection.getBoundingClientRect();
  const b = heroFitBox?.offsetParent !== null && heroFitBox ? heroFitBox.getBoundingClientRect() : null;
  const isTouch = window.matchMedia("(max-width: 1023px)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  const isPhone = window.matchMedia("(max-width: 639px)").matches;

  heroScene.setParams({
    ...DEFAULT_PARAMS,
    ...(b ? fitSubjectToBox(DEFAULT_PARAMS, { top: b.top - s.top, height: b.height }, heroSection.clientHeight) : null),
    ...(isTouch ? { bgRevealOpacity: 0 } : null),
    ...(noHover ? { autoSweepAmount: 0.76 } : null),
    ...(isPhone ? { sweepRadius: 0.95, sweepWarp: 0.18, autoSweepAmount: 0.55 } : null),
    ...(heroScene.tier.reveal ? null : { autoSweepAmount: 0 }),
  });
};

window.addEventListener("resize", () => {
  if (heroScene && heroSection) {
    heroScene.resize(heroSection.clientWidth, heroSection.clientHeight);
    heroScene.retune();
    applyFit();
  }
});

// Window pointer tracking
window.addEventListener("pointermove", (e) => {
  if (heroScene?.tier.pointerEnabled) {
    heroScene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  }
});

// Scene render loop
subscribe((time) => {
  if (!heroScene || !heroSection) return;
  const inView = window.scrollY <= window.innerHeight * 1.15;
  if (inView && !document.hidden) {
    heroScene.update(time);
  }
}, () => heroScene?.tier.frameInterval ?? 0);

// --------------------------------------------------------------------------
// LOADING VEIL & ENTRANCE SEQUENCE
// --------------------------------------------------------------------------
const veilEl = document.getElementById("loading-veil");
const veilHelmetFill = document.getElementById("veil-helmet-fill");
const veilMeterFill = document.getElementById("veil-meter-fill");
const veilName = document.getElementById("veil-name");

const progressSpring = createSpring(0, SPRINGS.PROGRESS_WAIT);
progressSpring.setTarget(0.7);

const veilOpacitySpring = createSpring(1, SPRINGS.VEIL);
const veilContentSpring = createSpring(1, SPRINGS.CLEAR);

// Animate veil name after 260ms
setTimeout(() => {
  if (veilName) {
    const s = createSpring(0, { tension: 110, friction: 26 });
    s.setTarget(1);
    const unsub = subscribe(() => {
      const v = s.step(16);
      veilName.style.opacity = `${v}`;
      veilName.style.transform = `translateY(${(1 - v) * 0.6}rem)`;
      if (s.state.atRest) unsub();
    });
  }
}, 260);

// Update progress springs
subscribe(() => {
  if (!veilEl) return;
  const p = progressSpring.step(16);
  if (veilHelmetFill) veilHelmetFill.style.transform = `scaleY(${p})`;
  if (veilMeterFill) veilMeterFill.style.transform = `scaleX(${p})`;
});

const startHeroEntrance = () => {
  // Handover point: scene beginRise
  heroScene?.beginRise();

  // Reveal Driver Name word by word
  const nameH1 = document.getElementById("driver-name-h1");
  if (nameH1) {
    const reveal = initTextReveal(nameH1, "kimi antonelli", "word", SPRINGS.REVEAL, 180, 110);
    reveal.play();
  }

  // Fade ID
  const driverId = document.getElementById("driver-id-elem");
  if (driverId) {
    driverId.style.opacity = "0";
    setTimeout(() => {
      const s = createSpring(0, SPRINGS.REVEAL);
      s.setTarget(1);
      const unsub = subscribe(() => {
        const v = s.step(16);
        driverId.style.opacity = `${v}`;
        if (s.state.atRest) unsub();
      });
    }, 180);
  }

  // Meta rows rise
  const metaItems = document.querySelectorAll(".driver-meta-item");
  metaItems.forEach((item, idx) => {
    const el = item as HTMLElement;
    el.style.opacity = "0";
    el.style.transform = "translateY(0.75rem)";
    setTimeout(() => {
      const s = createSpring(0, SPRINGS.ROW);
      s.setTarget(1);
      const unsub = subscribe(() => {
        const v = s.step(16);
        el.style.opacity = `${v}`;
        el.style.transform = `translateY(${(1 - v) * 0.75}rem)`;
        if (s.state.atRest) unsub();
      });
    }, 180 + 260 + idx * 130);
  });

  // Panels rise at +900
  const panelsCol = document.getElementById("hero-panels-col");
  if (panelsCol) {
    panelsCol.style.opacity = "0";
    panelsCol.style.transform = "translateY(1.25rem)";
    setTimeout(() => {
      const s = createSpring(0, SPRINGS.REVEAL);
      s.setTarget(1);
      const unsub = subscribe(() => {
        const v = s.step(16);
        panelsCol.style.opacity = `${v}`;
        panelsCol.style.transform = `translateY(${(1 - v) * 1.25}rem)`;
        if (s.state.atRest) unsub();
      });
    }, 900);
  }

  // Stats letter by letter
  const statsFigs = [
    { id: "stat-fig-races", text: "12", delay: 900 },
    { id: "stat-fig-podiums", text: "3", delay: 990 },
    { id: "stat-fig-points", text: "118", delay: 1080 },
  ];
  statsFigs.forEach(({ id, text, delay }) => {
    const el = document.getElementById(id);
    if (el) {
      const rev = initTextReveal(el, text, "letter", SPRINGS.FIGURE, delay, 26);
      rev.play();
    }
  });

  // Actions row at +1500
  const actionsRow = document.getElementById("hero-actions-row");
  if (actionsRow) {
    actionsRow.style.opacity = "0";
    actionsRow.style.transform = "translateY(1.25rem)";
    setTimeout(() => {
      const s = createSpring(0, SPRINGS.REVEAL);
      s.setTarget(1);
      const unsub = subscribe(() => {
        const v = s.step(16);
        actionsRow.style.opacity = `${v}`;
        actionsRow.style.transform = `translateY(${(1 - v) * 1.25}rem)`;
        if (s.state.atRest) unsub();
      });
    }, 1500);
  }
};

const handleSceneReady = () => {
  if (heroReady) return;
  heroReady = true;
  progressSpring.setTarget(1);

  // Beat 1: Clear veil contents
  veilContentSpring.setTarget(0);
  const unsubContent = subscribe(() => {
    const v = veilContentSpring.step(16);
    const center = document.querySelector(".veil-center-box") as HTMLElement;
    const track = document.querySelector(".veil-meter-track") as HTMLElement;
    if (center) {
      center.style.opacity = `${v}`;
      center.style.transform = `translateY(${(1 - v) * -0.75}rem)`;
    }
    if (track) track.style.opacity = `${v}`;
    if (veilContentSpring.state.atRest) unsubContent();
  });

  // Beat 2: 430 + 240 ms later veil lifts
  setTimeout(() => {
    veilOpacitySpring.setTarget(0);
    startHeroEntrance();

    const unsubVeil = subscribe(() => {
      const v = veilOpacitySpring.step(16);
      if (veilEl) {
        veilEl.style.opacity = `${v}`;
        veilEl.style.pointerEvents = "none";
      }
      if (v <= 0.004 && veilEl) {
        veilEl.remove();
        unsubVeil();
      }
    });

    // Backstop
    setTimeout(() => {
      if (veilEl && veilEl.parentElement) veilEl.remove();
    }, 3000);
  }, 430 + 240);
};

if (heroScene) {
  heroScene.onReady = handleSceneReady;
} else {
  setTimeout(handleSceneReady, 500);
}

// --------------------------------------------------------------------------
// MOBILE NAVIGATION SHEET
// --------------------------------------------------------------------------
const mobileSheet = document.getElementById("mobile-sheet");
const burgerOpenBtn = document.getElementById("burger-open-btn");
const sheetCloseBtn = document.getElementById("sheet-close-btn");
const sheetLogoBtn = document.getElementById("sheet-logo-btn");

const openMobileMenu = () => {
  if (!mobileSheet) return;
  mobileSheet.classList.add("open");
  document.documentElement.style.overflow = "hidden";
  document.documentElement.style.height = "100%";
  sheetCloseBtn?.focus();

  // Stagger nav links
  const items = mobileSheet.querySelectorAll(".sheet-nav-item");
  items.forEach((item, idx) => {
    const el = item as HTMLElement;
    el.style.opacity = "0";
    el.style.transform = "translateY(0.75rem)";
    setTimeout(() => {
      const s = createSpring(0, SPRINGS.ITEM);
      s.setTarget(1);
      const unsub = subscribe(() => {
        const v = s.step(16);
        el.style.opacity = `${v}`;
        el.style.transform = `translateY(${(1 - v) * 0.75}rem)`;
        if (s.state.atRest) unsub();
      });
    }, 120 + idx * 55);
  });
};

const closeMobileMenu = () => {
  if (!mobileSheet) return;
  mobileSheet.classList.remove("open");
  document.documentElement.style.overflow = "";
  document.documentElement.style.height = "";
};

burgerOpenBtn?.addEventListener("click", openMobileMenu);
sheetCloseBtn?.addEventListener("click", closeMobileMenu);
sheetLogoBtn?.addEventListener("click", closeMobileMenu);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mobileSheet?.classList.contains("open")) {
    closeMobileMenu();
  }
});
window.addEventListener("resize", () => {
  if (window.innerWidth >= 1280 && mobileSheet?.classList.contains("open")) {
    closeMobileMenu();
  }
});

// --------------------------------------------------------------------------
// 2. THE STICKY STACK (Hero, Season, Timeline)
// --------------------------------------------------------------------------
const heroInner = document.getElementById("hero-inner") as HTMLElement;
const heroShade = document.getElementById("hero-shade") as HTMLElement;
const seasonInner = document.getElementById("season-inner") as HTMLElement;
const seasonShade = document.getElementById("season-shade") as HTMLElement;
const seasonSection = document.getElementById("layer-season") as HTMLElement;
const timelineSection = document.getElementById("layer-timeline") as HTMLElement;

const pinned = [
  { inner: heroInner, shade: heroShade, next: seasonSection },
  { inner: seasonInner, shade: seasonShade, next: timelineSection },
];

const RECEDE_SCALE = 0.9;
const RECEDE_SHADE = 0.55;
const phoneQuery = window.matchMedia("(max-width: 639px)");

const applyRecede = () => {
  const view = window.innerHeight || 1;
  const shrink = phoneQuery.matches ? 0 : 1 - RECEDE_SCALE;
  for (const { inner, shade, next } of pinned) {
    if (!inner || !shade || !next) continue;
    const p = Math.min(1, Math.max(0, 1 - next.getBoundingClientRect().top / view));
    inner.style.transform = p > 0 && shrink > 0 ? `scale(${1 - shrink * p})` : "";
    inner.style.willChange = p > 0 && shrink > 0 ? "transform" : "";
    shade.style.opacity = `${RECEDE_SHADE * p}`;
    inner.style.visibility = p >= 1 ? "hidden" : "visible";
  }
};
window.addEventListener("scroll", applyRecede, { passive: true });
applyRecede();

// --------------------------------------------------------------------------
// 3. THE SEASON SO FAR
// --------------------------------------------------------------------------
// Chequered Dissolve Seam at top of Season
const seasonDissolveCanvas = document.getElementById("season-dissolve-canvas") as HTMLCanvasElement;
const seasonDissolve = seasonDissolveCanvas ? initDissolveCanvas(seasonDissolveCanvas, "light") : null;

// Track ribbon SVG path initialization
const trackRibbonWhite = document.getElementById("track-ribbon-white");
const trackRibbonAccent = document.getElementById("track-ribbon-accent");
if (trackRibbonWhite) trackRibbonWhite.setAttribute("d", TRACK_RIBBON);
if (trackRibbonAccent) trackRibbonAccent.setAttribute("d", TRACK_RIBBON);

// Grid and Ping animations
const gridLines = [
  document.getElementById("grid-y"),
  document.getElementById("grid-x1"),
  document.getElementById("grid-x2"),
  document.getElementById("grid-x3"),
];
const pingCircle = document.getElementById("map-ping-circle");
const globeMeridian = document.getElementById("globe-meridian");

// Circuit Trace Canvas and Halftone Dots Canvas
const seasonDotsCanvas = document.getElementById("season-dots-canvas") as HTMLCanvasElement;
const seasonTraceCanvas = document.getElementById("season-trace-canvas") as HTMLCanvasElement;
const lapMaskPath = document.getElementById("lap-mask-path");

const dotField = generateDotField();
const circuitPath = generateCircuitPoints();

// Baked dots canvas
let bakedDotsCanvas: HTMLCanvasElement | null = null;
const bakeDots = () => {
  if (!seasonDotsCanvas) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(1438.43 * ratio);
  const h = Math.round(809.11 * ratio);
  seasonDotsCanvas.width = w;
  seasonDotsCanvas.height = h;

  bakedDotsCanvas = document.createElement("canvas");
  bakedDotsCanvas.width = w;
  bakedDotsCanvas.height = h;
  const ctx = bakedDotsCanvas.getContext("2d");
  if (!ctx) return;
  const scale = w / 2560;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = "#7a7a7a";
  ctx.beginPath();
  for (let i = 0; i < dotField.count; i++) {
    const x = dotField.points[i * 2];
    const y = dotField.points[i * 2 + 1];
    ctx.moveTo(x + DOT_RADIUS, y);
    ctx.arc(x, y, DOT_RADIUS, 0, Math.PI * 2);
  }
  ctx.fill();
};
bakeDots();
window.addEventListener("resize", bakeDots);

// Circuit 6-second Lap Simulation
let lapProgress = 0;
let lapStarted = false;
let lapHeat = 1;
let lapCooldownDone = false;

// Reticle state for halftone dots
const reticle = { x: 0, y: 0, active: false };
window.addEventListener("pointermove", (e) => {
  if (!seasonDotsCanvas || !lapCooldownDone) return;
  const rect = seasonDotsCanvas.getBoundingClientRect();
  if (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  ) {
    const artX = ((e.clientX - rect.left) / rect.width) * 1438.43;
    const artY = ((e.clientY - rect.top) / rect.height) * 809.11;
    const [mapX, mapY] = artboardToMap(artX, artY);
    reticle.x = mapX;
    reticle.y = mapY;
    reticle.active = true;
  } else {
    reticle.active = false;
  }
});
window.addEventListener("pointerleave", () => { reticle.active = false; });

const triggerLap = () => {
  if (lapStarted) return;
  lapStarted = true;
  const start = performance.now();
  const unsub = subscribe((now) => {
    const elapsed = now - start;
    if (elapsed <= 6000) {
      // Ease in out sine
      lapProgress = 0.5 * (1 - Math.cos((Math.PI * elapsed) / 6000));
    } else {
      lapProgress = 1;
      const coolElapsed = elapsed - 6000;
      lapHeat = Math.max(0, 1 - coolElapsed / 800);
      if (lapHeat <= 0) {
        lapCooldownDone = true;
        unsub();
      }
    }

    // Update lap mask offset: TOTAL = 4805.57
    if (lapMaskPath) {
      const offset = 60 + (1 - lapProgress) * 4805.57;
      lapMaskPath.style.strokeDashoffset = `${offset}`;
    }
  });
};

// Intersection Observer for season lap trigger & text reveals
const seasonSectionEl = document.getElementById("layer-season");
if (seasonSectionEl) {
  const obs = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        triggerLap();
        // Play Season reveals
        const line1 = document.getElementById("season-h-line1");
        const line2 = document.getElementById("season-h-line2");
        if (line1) initTextReveal(line1, "the season", "word", SPRINGS.REVEAL, 0, 110).play();
        if (line2) {
          const rev = initTextReveal(line2, "so far", "word", SPRINGS.REVEAL, 130, 110);
          rev.play();
          const dot = document.createElement("span");
          dot.textContent = ".";
          dot.style.color = "var(--foreground-on-dark)";
          dot.style.opacity = "0";
          line2.appendChild(dot);
          setTimeout(() => { dot.style.opacity = "1"; }, 130 + 110);
        }

        const rule = document.getElementById("season-rule");
        if (rule) {
          rule.style.transform = "scaleX(0)";
          setTimeout(() => {
            const s = createSpring(0, SPRINGS.REVEAL);
            s.setTarget(1);
            const unsub = subscribe(() => {
              const v = s.step(16);
              rule.style.transform = `scaleX(${v})`;
              if (s.state.atRest) unsub();
            });
          }, 260);
        }

        const intro = document.getElementById("season-intro-text");
        if (intro) {
          initTextReveal(
            intro,
            "Every race is a step forward. Here's how the season is shaping up.",
            "word",
            SPRINGS.COPY_FAST,
            350,
            34
          ).play();
        }

        // Standings plate
        const plate = document.getElementById("standings-plate");
        if (plate) {
          plate.style.opacity = "0";
          plate.style.transform = "translateY(0.75rem)";
          setTimeout(() => {
            const s = createSpring(0, SPRINGS.REVEAL);
            s.setTarget(1);
            const unsub = subscribe(() => {
              const v = s.step(16);
              plate.style.opacity = `${v}`;
              plate.style.transform = `translateY(${(1 - v) * 0.75}rem)`;
              if (s.state.atRest) unsub();
            });
          }, 260);
        }

        obs.disconnect();
      }
    },
    { threshold: 0.35 }
  );
  obs.observe(seasonSectionEl);
}

// Season Animation Loop (Grid crawl, globe spin, ping, dots, circuit trace)
subscribe((now) => {
  // Grid crawling offset (7s cycle)
  const gridDash = (now / 7000) % 1;
  gridLines.forEach((line) => {
    if (line) line.setAttribute("stroke-dashoffset", `${gridDash * 20.5}`);
  });

  // Ping pulse (4.2s cycle)
  if (pingCircle) {
    const v = (now / 4200) % 1;
    const r = 10.63 + v * 86;
    const op = 0.4 * (1 - v) * (1 - v);
    pingCircle.setAttribute("r", `${r}`);
    pingCircle.setAttribute("opacity", `${op}`);
  }

  // Globe spin (10s cycle)
  if (globeMeridian) {
    const turn = (now / 10000) * Math.PI * 2;
    const rx = Math.max(0.5, Math.abs(Math.cos(turn)) * 18);
    globeMeridian.setAttribute("rx", `${rx.toFixed(2)}`);
  }

  // Draw Halftone canvas
  if (seasonDotsCanvas && bakedDotsCanvas) {
    const ctx = seasonDotsCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, seasonDotsCanvas.width, seasonDotsCanvas.height);
      ctx.drawImage(bakedDotsCanvas, 0, 0);

      // If reticle is active, draw chequer squares along arms and at crossing
      if (reticle.active) {
        const scale = seasonDotsCanvas.width / 2560;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const cell = DOT_LATTICE.pitchX;
        const radius = 320;
        ctx.fillStyle = "#02d2e3";

        for (let i = 0; i < dotField.count; i++) {
          const dx = Math.abs(dotField.points[i * 2] - reticle.x);
          const dy = Math.abs(dotField.points[i * 2 + 1] - reticle.y);
          if (dx < radius && dy < radius && (dx < 12 || dy < 12)) {
            const px = dotField.points[i * 2];
            const py = dotField.points[i * 2 + 1];
            if ((dotField.columns[i] + dotField.rows[i]) % 2 === 0) {
              ctx.fillRect(px - cell / 2, py - cell / 2, cell, cell);
            }
          }
        }
        ctx.restore();
      }
    }
  }

  // Draw Circuit Trace Canvas
  if (seasonTraceCanvas && lapProgress > 0) {
    const ctx = seasonTraceCanvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 1440, 800);
      const curIdx = Math.floor(lapProgress * (circuitPath.length - 1));
      const activePts = circuitPath.slice(0, curIdx + 1);

      if (activePts.length > 1) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Additive glow
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = "rgba(2, 210, 227, 0.15)";
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(activePts[0][0], activePts[0][1]);
        for (let i = 1; i < activePts.length; i++) ctx.lineTo(activePts[i][0], activePts[i][1]);
        ctx.stroke();

        // Main line
        ctx.strokeStyle = "#02d2e3";
        ctx.lineWidth = 5.9;
        ctx.beginPath();
        ctx.moveTo(activePts[0][0], activePts[0][1]);
        for (let i = 1; i < activePts.length; i++) ctx.lineTo(activePts[i][0], activePts[i][1]);
        ctx.stroke();

        // White filament on hot head
        if (lapHeat > 0.05) {
          const headFrom = Math.max(0, activePts.length - 70);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.95 * lapHeat})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(activePts[headFrom][0], activePts[headFrom][1]);
          for (let i = headFrom + 1; i < activePts.length; i++) ctx.lineTo(activePts[i][0], activePts[i][1]);
          ctx.stroke();

          // Spark at tip
          const tip = activePts[activePts.length - 1];
          const grad = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 15);
          grad.addColorStop(0, `rgba(255, 255, 255, ${0.85 * lapHeat})`);
          grad.addColorStop(0.5, `rgba(2, 210, 227, ${0.4 * lapHeat})`);
          grad.addColorStop(1, "rgba(2, 210, 227, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(tip[0], tip[1], 15, 0, Math.PI * 2);
          ctx.fill();
        }

        // Punch out finish cut
        ctx.translate(FLAG_CUT.x * (1438.43 / 2560), FLAG_CUT.y * (796 / 1416.66));
        ctx.rotate((FLAG_CUT.angle * Math.PI) / 180);
        ctx.clearRect(-18, -20, 36, 40);
        ctx.restore();
      }
    }
  }

  // Update dissolve canvas progress on scroll
  if (seasonDissolveCanvas && seasonDissolve) {
    const bb = seasonDissolveCanvas.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(Math.max(0, 1 - bb.top / vh), 1);
    seasonDissolve.render(p);
  }
});

// --------------------------------------------------------------------------
// 4. FROM KARTS TO F1 (TIMELINE)
// --------------------------------------------------------------------------
const timelineRowsContainer = document.getElementById("timeline-rows-container");
const timelineRailContainer = document.getElementById("timeline-rail-container");
const railProgressRect = document.getElementById("rail-progress-rect");
const railMarkerGroup = document.getElementById("rail-marker-group");

// Timeline dissolve seam
const timelineDissolveCanvas = document.getElementById("timeline-dissolve-canvas") as HTMLCanvasElement;
const timelineDissolve = timelineDissolveCanvas ? initDissolveCanvas(timelineDissolveCanvas, "light") : null;

// Populate timeline rows
if (timelineRowsContainer) {
  TIMELINE_ENTRIES.forEach((entry, idx) => {
    const row = document.createElement("div");
    row.className = `timeline-row timeline-row-${entry.frame}`;
    row.id = `timeline-row-${idx}`;

    const plateAlignClass =
      entry.frame === "centre"
        ? "timeline-plate-centre"
        : entry.align === "left"
          ? "timeline-plate-side-left align-left"
          : "timeline-plate-side-right align-right";

    row.innerHTML = `
      <div class="timeline-plate-wrapper ${plateAlignClass}" id="tl-plate-${idx}">
        <div class="timeline-plate-shape">
          <img class="timeline-plate-img" src="${entry.image}" alt="${entry.alt}" />
        </div>
        <svg class="timeline-plate-svg-outline" viewBox="0 0 710.995 462.995" preserveAspectRatio="none">
          <path d="${PLATE_OUTLINE}" fill="none" stroke="var(--timeline-outline)" stroke-width="1" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>

      <div class="timeline-year ${entry.frame === "side" ? (entry.align === "left" ? "align-left" : "align-right") : ""}" id="tl-year-${idx}">
        <span class="sr-only">${entry.year}</span>
      </div>

      ${
        entry.frame === "centre" && entry.copy
          ? `<p class="timeline-copy" id="tl-copy-${idx}">
               <strong>${entry.lead}</strong> ${entry.copy.replace(entry.lead ?? "", "")}
             </p>`
          : ""
      }
    `;

    timelineRowsContainer.appendChild(row);

    // Plate hover dims other rows
    const plate = row.querySelector(".timeline-plate-wrapper");
    plate?.addEventListener("mouseenter", () => {
      document.getElementById("layer-timeline")?.classList.add("has-hovered-plate");
      row.classList.add("is-hovered");
    });
    plate?.addEventListener("mouseleave", () => {
      document.getElementById("layer-timeline")?.classList.remove("has-hovered-plate");
      row.classList.remove("is-hovered");
    });

    // In-view observer for Year letters and Copy reveal
    const rowObs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const yrEl = document.getElementById(`tl-year-${idx}`);
          if (yrEl) {
            initTextReveal(yrEl, `${entry.year}`, "letter", SPRINGS.YEAR, 0, 26).play();
            if (entry.frame === "centre") {
              setTimeout(() => {
                const s = createSpring(1, SPRINGS.YEAR_SETTLE);
                s.setTarget(0.4);
                const unsub = subscribe(() => {
                  const v = s.step(16);
                  yrEl.style.opacity = `${v}`;
                  if (s.state.atRest) unsub();
                });
              }, 2200);
            }
          }

          const copyEl = document.getElementById(`tl-copy-${idx}`);
          if (copyEl) {
            copyEl.style.opacity = "0";
            copyEl.style.transform = "translateY(0.75rem)";
            setTimeout(() => {
              const s = createSpring(0, SPRINGS.COPY);
              s.setTarget(1);
              const unsub = subscribe(() => {
                const v = s.step(16);
                copyEl.style.opacity = `${v}`;
                copyEl.style.transform = `translateY(${(1 - v) * 0.75}rem)`;
                if (s.state.atRest) unsub();
              });
            }, 220);
          }
          rowObs.disconnect();
        }
      },
      { rootMargin: "0% 0% -25% 0%" }
    );
    rowObs.observe(row);
  });
}

// Timeline heading reveals
const tlObs = new IntersectionObserver(
  (entries) => {
    if (entries[0].isIntersecting) {
      const h1 = document.getElementById("timeline-h-line1");
      const h2 = document.getElementById("timeline-h-line2");
      if (h1) initTextReveal(h1, "from karts", "word", SPRINGS.REVEAL, 0, 130).play();
      if (h2) {
        initTextReveal(h2, "to f1", "word", SPRINGS.REVEAL, 130, 130).play();
        const dot = document.createElement("span");
        dot.textContent = ".";
        dot.style.color = "var(--foreground-on-dark)";
        dot.style.opacity = "0";
        h2.appendChild(dot);
        setTimeout(() => { dot.style.opacity = "1"; }, 130 + 110);
      }
      tlObs.disconnect();
    }
  },
  { rootMargin: "0% 0% -10% 0%" }
);
const tlHeader = document.getElementById("timeline-heading");
if (tlHeader) tlObs.observe(tlHeader);

// Rail scrub trigger & row parallax
subscribe(() => {
  if (timelineRailContainer && railProgressRect && railMarkerGroup) {
    const bb = timelineRailContainer.getBoundingClientRect();
    const vh = window.innerHeight;
    const start = bb.top - vh / 2;
    const end = bb.bottom - vh;
    const len = Math.abs(start - end);
    const progress = Math.min(Math.max(0, 1 - (start + len) / len), 1);

    const totalHeight = 2387;
    const restShare = restingPoint(TIMELINE_ENTRIES);
    const run = progress * restShare * totalHeight;

    railProgressRect.setAttribute("height", `${run.toFixed(1)}`);
    const rot = (run / (restShare * totalHeight)) * 1800; // 5 full turns
    railMarkerGroup.setAttribute("transform", `translate(8, ${run.toFixed(1)}) rotate(${rot.toFixed(1)})`);
  }

  // Timeline dissolve
  if (timelineDissolveCanvas && timelineDissolve) {
    const bb = timelineDissolveCanvas.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(Math.max(0, 1 - bb.top / vh), 1);
    timelineDissolve.render(p);
  }
});

// --------------------------------------------------------------------------
// 5. FROM THE PADDOCK
// --------------------------------------------------------------------------
const paddockDissolveCanvas = document.getElementById("paddock-dissolve-canvas") as HTMLCanvasElement;
const paddockDissolve = paddockDissolveCanvas ? initDissolveCanvas(paddockDissolveCanvas, "dark") : null;

// Marching Squares Contour Backdrop for Paddock
const paddockContourCanvas = document.getElementById("paddock-contour-canvas") as HTMLCanvasElement;
const paddockContour = paddockContourCanvas
  ? createContourRenderer(paddockContourCanvas, "rgb(9 10 11 / 0.08)")
  : null;

// Portrait parallax
const paddockPortrait = document.getElementById("paddock-portrait-container");
const paddockSection = document.getElementById("section-paddock");

// Crawling connectors in calendar band
const calLinks = [
  document.getElementById("cal-link-0"),
  document.getElementById("cal-link-1"),
  document.getElementById("cal-link-2"),
  document.getElementById("cal-link-3"),
];
const calLinkMeta = [
  { left: "28.8889cqw", width: "8.75cqw", dir: 1 },
  { left: "40.2778cqw", width: "8.8889cqw", dir: 1 },
  { left: "51.5972cqw", width: "9.4444cqw", dir: -1 },
  { left: "63.4722cqw", width: "8.6111cqw", dir: -1 },
];
calLinks.forEach((link, i) => {
  if (link) {
    link.style.left = calLinkMeta[i].left;
    link.style.width = calLinkMeta[i].width;
    link.style.backgroundImage =
      "repeating-linear-gradient(to right, var(--foreground-on-dark-muted) 0 0.4861cqw, transparent 0.4861cqw 0.7951cqw)";
  }
});

// Paddock in-view triggers
if (paddockSection) {
  const pObs = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        // Headings
        const l1 = document.getElementById("paddock-h-line1");
        const l2 = document.getElementById("paddock-h-line2");
        if (l1) initTextReveal(l1, "from the", "word", SPRINGS.REVEAL, 0, 130).play();
        if (l2) {
          initTextReveal(l2, "paddock", "word", SPRINGS.REVEAL, 130, 130).play();
          const dot = document.createElement("span");
          dot.textContent = ".";
          dot.style.color = "var(--accent)";
          dot.style.opacity = "0";
          l2.appendChild(dot);
          setTimeout(() => { dot.style.opacity = "1"; }, 130 + 110);
        }

        // Report
        const rep = document.getElementById("paddock-report-text");
        if (rep) {
          initTextReveal(
            rep,
            "A composed drive through a difficult weekend secured another podium — and kept Kimi at the top of the championship.",
            "word",
            SPRINGS.COPY_FAST,
            350,
            30
          ).play();
        }

        // Button
        const btn = document.getElementById("paddock-cta-btn");
        if (btn) {
          btn.style.opacity = "0";
          btn.style.transform = "translateY(0.75rem)";
          setTimeout(() => {
            const s = createSpring(0, SPRINGS.REVEAL);
            s.setTarget(1);
            const unsub = subscribe(() => {
              const v = s.step(16);
              btn.style.opacity = `${v}`;
              btn.style.transform = `translateY(${(1 - v) * 0.75}rem)`;
              if (s.state.atRest) unsub();
            });
          }, 520);
        }

        // Stats figures
        const statFigs = ["P4", "+12", "P1", "118"];
        statFigs.forEach((txt, idx) => {
          const el = document.getElementById(`paddock-sfig-${idx}`);
          if (el) {
            initTextReveal(el, txt, "letter", SPRINGS.FIGURE, 460 + idx * 90 + 120, 24).play();
          }
        });

        pObs.disconnect();
      }
    },
    { threshold: 0.2 }
  );
  pObs.observe(paddockSection);
}

// Live Pulse in Calendar Strip
const calLivePulse = document.getElementById("cal-live-pulse");

subscribe((now) => {
  // Paddock dissolve
  if (paddockDissolveCanvas && paddockDissolve) {
    const bb = paddockDissolveCanvas.getBoundingClientRect();
    const vh = window.innerHeight;
    const p = Math.min(Math.max(0, 1 - bb.top / vh), 1);
    paddockDissolve.render(p);
  }

  // Paddock contour
  if (paddockContourCanvas && paddockContour) {
    if (paddockContourCanvas.width !== paddockContourCanvas.clientWidth) {
      paddockContourCanvas.width = paddockContourCanvas.clientWidth;
      paddockContourCanvas.height = paddockContourCanvas.clientHeight;
    }
    paddockContour.draw(now);
  }

  // Portrait parallax: 0 to -3.3333cqw
  if (paddockSection && paddockPortrait) {
    const bb = paddockSection.getBoundingClientRect();
    const vh = window.innerHeight;
    const progress = Math.min(Math.max(0, 1 - (bb.top + bb.height) / (vh + bb.height)), 1);
    paddockPortrait.style.top = `${-progress * 3.3333}cqw`;
  }

  // Crawling connector animation (5.2s cycle)
  const crawl = ((now / 5200) % 1) * 11.45;
  calLinks.forEach((link, i) => {
    if (link) {
      const dir = calLinkMeta[i].dir;
      link.style.backgroundPositionX = `${dir * crawl}px`;
    }
  });

  // Live round pulse (3.2s cycle)
  if (calLivePulse) {
    const v = (now / 3200) % 1;
    const r = 5.5 + v * 5.5 * 3.4;
    const op = 0.5 * (1 - v) * (1 - v);
    calLivePulse.setAttribute("r", `${r.toFixed(2)}`);
    calLivePulse.setAttribute("opacity", `${op.toFixed(2)}`);
  }
});

// --------------------------------------------------------------------------
// 6. KEEP PUSHING FORWARD (THE FOOTER)
// --------------------------------------------------------------------------
const footerContourCanvas = document.getElementById("footer-contour-canvas") as HTMLCanvasElement;
const footerContour = footerContourCanvas
  ? createContourRenderer(footerContourCanvas, "rgb(255 255 255 / 0.1)")
  : null;

const footerSection = document.getElementById("section-footer");
const footerFigParallax = document.getElementById("footer-figure-parallax");

// Footer in-view triggers
if (footerSection) {
  const fObs = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        // Masthead
        const l1 = document.getElementById("footer-h-line1");
        const l2 = document.getElementById("footer-h-line2");
        if (l1) initTextReveal(l1, "keep pushing", "word", SPRINGS.REVEAL, 0, 130).play();
        if (l2) {
          initTextReveal(l2, "forward", "word", SPRINGS.REVEAL, 130, 130).play();
          const dot = document.createElement("span");
          dot.textContent = ".";
          dot.style.color = "var(--foreground-on-dark)";
          dot.style.opacity = "0";
          l2.appendChild(dot);
          setTimeout(() => { dot.style.opacity = "1"; }, 130 + 110);
        }

        // Nav Links letter by letter
        const navs = ["driver", "season", "journal", "next race", "store"];
        navs.forEach((txt, idx) => {
          const el = document.getElementById(`fnav-${idx}`);
          if (el) {
            initTextReveal(el, txt, "letter", SPRINGS.ROW, 260 + idx * 80, 22).play();
          }
        });

        // Foot row
        const footItems = [
          document.getElementById("footer-copyright"),
          document.getElementById("footer-legal-btn"),
          document.getElementById("footer-socials"),
        ];
        footItems.forEach((el, idx) => {
          if (el) {
            el.style.opacity = "0";
            el.style.transform = "translateY(0.75rem)";
            setTimeout(() => {
              const s = createSpring(0, SPRINGS.REVEAL);
              s.setTarget(1);
              const unsub = subscribe(() => {
                const v = s.step(16);
                el.style.opacity = `${v}`;
                el.style.transform = `translateY(${(1 - v) * 0.75}rem)`;
                if (s.state.atRest) unsub();
              });
            }, 640 + idx * 80);
          }
        });

        fObs.disconnect();
      }
    },
    { threshold: 0.2 }
  );
  fObs.observe(footerSection);
}

// Footer animation loop
subscribe((now) => {
  if (footerContourCanvas && footerContour) {
    if (footerContourCanvas.width !== footerContourCanvas.clientWidth) {
      footerContourCanvas.width = footerContourCanvas.clientWidth;
      footerContourCanvas.height = footerContourCanvas.clientHeight;
    }
    footerContour.draw(now);
  }

  // Footer figure parallax: ends at bottom bottom, moving top from px(60) (4.1667cqw) to 0cqw
  if (footerSection && footerFigParallax) {
    const bb = footerSection.getBoundingClientRect();
    const vh = window.innerHeight;
    const start = bb.top - vh;
    const end = bb.bottom - vh;
    const len = Math.abs(start - end);
    const progress = Math.min(Math.max(0, 1 - (start + len) / len), 1);
    const topDrop = (1 - progress) * 4.1667;
    footerFigParallax.style.top = `${topDrop}cqw`;
  }
});
