// Chequered dissolve seam canvas

const CELL = 24;
const SOLID_UNTIL = 0.16;
const LIFT = 2;
const ACCENT_SHARE = 0.06;

const noise = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const initDissolveCanvas = (
  canvas: HTMLCanvasElement,
  carry: "light" | "dark" = "light"
) => {
  const context = canvas.getContext("2d");
  if (!context) return { render: (_p: number) => {} };

  const surface = carry === "light" ? "#f7fafb" : "#090a0b";
  const accent = "#02d2e3";

  const render = (progress: number) => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const cell = CELL;
    const columns = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const lift = progress * LIFT;

    for (let y = 0; y < rows; y += 1) {
      const depth = y / Math.max(1, rows - 1) + lift;
      if (depth > 1) break;
      const solid = depth <= SOLID_UNTIL;
      const fade = clamp01(1 - (depth - SOLID_UNTIL) / (1 - SOLID_UNTIL));
      if (!solid && fade <= 0) break;

      for (let x = 0; x < columns; x += 1) {
        if (!solid) {
          if ((x + y) % 2 !== 0) continue;
          if (noise(x, y) > fade) continue;
        }
        context.fillStyle =
          !solid && noise(x + 101, y + 57) < ACCENT_SHARE ? accent : surface;
        context.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  };

  return { render };
};
