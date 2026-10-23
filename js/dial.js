import { BANDS } from "./scoring.js";

const NS = "http://www.w3.org/2000/svg";
const CX = 100;
const CY = 100;
const R = 90;

function point(value, radius = R) {
  const angle = Math.PI * (1 - value / 100);
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function wedge(from, to) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${CX} ${CY} L${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2} Z`;
}

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/**
 * Draws the dial into `host` and returns `{ update }`.
 *
 * `update({ target, showTarget, guess })` redraws the target wedges (only when
 * `showTarget` is true, which is how the target is hidden) and the needle (only
 * when `guess` is a number). With `interactive`, dragging or arrow keys move the
 * needle and call `onChange(value)`.
 */
export function createDial(host, { interactive = false, onChange = () => {} } = {}) {
  const svg = el("svg", { viewBox: "0 0 200 108", class: "dial", role: interactive ? "slider" : "img" });
  svg.appendChild(el("path", { d: `M${CX - R} ${CY} A${R} ${R} 0 0 1 ${CX + R} ${CY} Z`, class: "dial-base" }));

  const wedges = el("g");
  svg.appendChild(wedges);

  const hiddenMark = el("text", { x: CX, y: 72, class: "dial-hidden", "text-anchor": "middle" });
  hiddenMark.textContent = "?";
  svg.appendChild(hiddenMark);

  const needle = el("g", { class: "needle" });
  const line = el("line", { x1: CX, y1: CY, x2: CX, y2: CY - R, class: "needle-line" });
  const knob = el("circle", { cx: CX, cy: CY - R, r: 4, class: "needle-knob" });
  needle.append(line, knob);
  svg.appendChild(needle);
  svg.appendChild(el("circle", { cx: CX, cy: CY, r: 6, class: "hub" }));

  let value = 50;

  function setNeedle(next) {
    value = Math.min(100, Math.max(0, next));
    const [x, y] = point(value);
    line.setAttribute("x2", x);
    line.setAttribute("y2", y);
    knob.setAttribute("cx", x);
    knob.setAttribute("cy", y);
    svg.setAttribute("aria-valuenow", Math.round(value));
  }

  function fromPointer(event) {
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 200;
    const y = ((event.clientY - box.top) / box.height) * 108;
    let angle = Math.atan2(CY - y, x - CX);
    if (angle < 0) angle = x < CX ? Math.PI : 0;
    setNeedle((1 - angle / Math.PI) * 100);
    onChange(value);
  }

  if (interactive) {
    svg.classList.add("interactive");
    svg.setAttribute("tabindex", "0");
    svg.setAttribute("aria-valuemin", "0");
    svg.setAttribute("aria-valuemax", "100");
    let dragging = false;
    svg.addEventListener("pointerdown", (event) => {
      dragging = true;
      svg.setPointerCapture(event.pointerId);
      fromPointer(event);
    });
    svg.addEventListener("pointermove", (event) => {
      if (dragging) fromPointer(event);
    });
    const stop = () => {
      dragging = false;
    };
    svg.addEventListener("pointerup", stop);
    svg.addEventListener("pointercancel", stop);
    svg.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 5 : 1;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") setNeedle(value - step);
      else if (event.key === "ArrowRight" || event.key === "ArrowUp") setNeedle(value + step);
      else return;
      event.preventDefault();
      onChange(value);
    });
  }

  host.replaceChildren(svg);

  return {
    update({ target = null, showTarget = false, guess = null } = {}) {
      wedges.replaceChildren();
      if (showTarget && typeof target === "number") {
        for (const band of BANDS) {
          wedges.appendChild(
            el("path", {
              d: wedge(target - band.half, target + band.half),
              class: `band band-${band.points}`,
            }),
          );
          const [lx, ly] = point(target, R * 0.72);
          if (band.points === 4) {
            const label = el("text", { x: lx, y: ly + 3, class: "band-label", "text-anchor": "middle" });
            label.textContent = "4";
            wedges.appendChild(label);
          }
        }
      }
      hiddenMark.style.display = !showTarget && typeof target === "number" ? "" : "none";
      needle.style.display = typeof guess === "number" ? "" : "none";
      if (typeof guess === "number") setNeedle(guess);
    },
  };
}
