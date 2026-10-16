// Ticker, Spring Solver, Text Engine, Scroll Triggers

type TickSubscriber = {
  callback: (time: number) => void;
  getFramerate: () => number;
  last: number;
};

const subscribers = new Set<TickSubscriber>();
let rafId: number | null = null;

const loop = (time: number) => {
  rafId = requestAnimationFrame(loop);
  const snapshot = Array.from(subscribers);
  for (const sub of snapshot) {
    const interval = sub.getFramerate();
    if (interval <= 0 || time - sub.last >= interval) {
      sub.last = time;
      sub.callback(time);
    }
  }
};

export const subscribe = (
  callback: (time: number) => void,
  getFramerate: () => number = () => 0
) => {
  const sub: TickSubscriber = { callback, getFramerate, last: 0 };
  subscribers.add(sub);
  if (subscribers.size === 1) {
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(sub);
    if (subscribers.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
};

// Damped Spring Solver (react-spring equivalent)
export interface SpringState {
  value: number;
  velocity: number;
  atRest: boolean;
}

export interface SpringConfig {
  tension: number;
  friction: number;
  mass?: number;
  precision?: number;
}

export const SPRINGS = {
  REVEAL: { tension: 90, friction: 26 },
  ROW: { tension: 170, friction: 24 },
  ITEM: { tension: 170, friction: 24 },
  SHEET: { tension: 190, friction: 26 },
  FIGURE: { tension: 200, friction: 24 },
  TYPE: { tension: 210, friction: 24 },
  YEAR: { tension: 190, friction: 24 },
  COPY: { tension: 110, friction: 26 },
  COPY_FAST: { tension: 150, friction: 24 },
  NAME: { tension: 190, friction: 24 },
  VEIL: { tension: 70, friction: 24 },
  CLEAR: { tension: 140, friction: 26 },
  LABEL: { tension: 110, friction: 26 },
  PROGRESS_WAIT: { tension: 10, friction: 30 },
  PROGRESS_READY: { tension: 170, friction: 26 },
  YEAR_SETTLE: { tension: 32, friction: 26 },
  TRIGGER: { tension: 140, friction: 30 },
} as const;

export const createSpring = (
  initialValue: number,
  config: SpringConfig = SPRINGS.REVEAL
) => {
  const state: SpringState = {
    value: initialValue,
    velocity: 0,
    atRest: true,
  };
  let target = initialValue;
  const mass = config.mass ?? 1;
  const precision = config.precision ?? 0.01;

  const setTarget = (newTarget: number) => {
    if (newTarget !== target) {
      target = newTarget;
      state.atRest = false;
    }
  };

  const step = (dtMs: number) => {
    if (state.atRest) return state.value;
    const cappedDt = Math.min(dtMs, 64);
    const subDt = 0.001; // 1ms substeps
    let t = 0;
    while (t < cappedDt / 1000) {
      const force = -config.tension * (state.value - target);
      const damping = -config.friction * state.velocity;
      const a = (force + damping) / mass;
      state.velocity += a * subDt;
      state.value += state.velocity * subDt;
      t += subDt;
    }

    if (
      Math.abs(state.velocity) < precision &&
      Math.abs(state.value - target) < precision
    ) {
      state.value = target;
      state.velocity = 0;
      state.atRest = true;
    }
    return state.value;
  };

  return { state, setTarget, step, getTarget: () => target };
};

// Text reveal split helper
export const initTextReveal = (
  container: HTMLElement,
  text: string,
  type: "word" | "letter" = "word",
  config: SpringConfig = SPRINGS.REVEAL,
  delayIn: number = 0,
  stagger: number = type === "word" ? 110 : 26
) => {
  container.innerHTML = "";
  const units = type === "word" ? text.split(/\s+/) : text.split("");
  const spans: { el: HTMLSpanElement; spring: ReturnType<typeof createSpring>; startAt: number }[] = [];

  const srOnly = document.createElement("span");
  srOnly.className = "sr-only";
  srOnly.textContent = text;
  container.appendChild(srOnly);

  const wrapper = document.createElement("span");
  wrapper.setAttribute("aria-hidden", "true");
  wrapper.style.display = "flex";
  wrapper.style.flexWrap = "wrap";
  wrapper.style.columnGap = type === "word" ? "0.3em" : "0.02em";
  container.appendChild(wrapper);

  units.forEach((unit, idx) => {
    const span = document.createElement("span");
    span.textContent = unit;
    span.style.display = "inline-block";
    span.style.opacity = "0";
    span.style.transform = type === "word" ? "translateY(0.35em)" : "translateY(0.3em)";
    span.style.willChange = "opacity, transform";
    wrapper.appendChild(span);

    spans.push({
      el: span,
      spring: createSpring(0, config),
      startAt: delayIn + idx * stagger,
    });
  });

  let startTime: number | null = null;
  let played = false;

  const play = () => {
    if (played) return;
    played = true;
    startTime = performance.now();
    const unsub = subscribe((time) => {
      const elapsed = time - (startTime ?? time);
      let allDone = true;
      for (const item of spans) {
        if (elapsed >= item.startAt) {
          item.spring.setTarget(1);
          const v = item.spring.step(16);
          item.el.style.opacity = `${v}`;
          const y = (1 - v) * (type === "word" ? 0.35 : 0.3);
          item.el.style.transform = `translateY(${y.toFixed(4)}em)`;
          if (!item.spring.state.atRest) allDone = false;
        } else {
          allDone = false;
        }
      }
      if (allDone) unsub();
    });
  };

  return { play };
};
