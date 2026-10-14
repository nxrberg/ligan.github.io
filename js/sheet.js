// The Score dialog as a bottom sheet on phones, like Kalshi's: it slides up from the bottom, and a
// downward swipe (on the grab handle, or anywhere while it's scrolled to the top) closes it.
// Wider screens keep the centred dialog. Built on the plain <dialog>: the swipeable drawer
// libraries (Vaul and the like) are React components, and this site has no React.

const phone = matchMedia("(max-width: 759px)"); // the site's phone breakpoint
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"; // Vaul's curve: a quick start that settles softly
const OPEN_MS = 450;
const CLOSE_MS = 300;
const animated = () => phone.matches && !reducedMotion.matches;

// Moves the sheet `y` down (CSS length; "" is its resting place) and fades the backdrop to `fade`.
function place(dlg, y, fade, ms) {
  dlg.style.transition = ms ? `transform ${ms}ms ${EASE}` : "none";
  dlg.style.transform = y ? `translateY(${y})` : "";
  dlg.style.setProperty("--sheet-fade", fade);
}

export function openSheet(dlg) {
  dlg.showModal();
  document.documentElement.classList.add("sheet-lock");
  if (!animated()) return;
  place(dlg, "100%", 0, 0);
  dlg.getBoundingClientRect(); // start below the screen, then slide up
  place(dlg, "", 1, OPEN_MS);
}

// Slides the sheet away, then closes the dialog (right away on wider screens).
export function closeSheet(dlg) {
  if (!dlg.open || dlg.dataset.closing) return;
  const done = () => {
    delete dlg.dataset.closing;
    place(dlg, "", 1, 0);
    dlg.close();
  };
  if (!animated()) return done();
  dlg.dataset.closing = "1";
  place(dlg, "100%", 0, CLOSE_MS);
  setTimeout(done, CLOSE_MS);
}

// Once per dialog: swipe to close, Escape and closing clean-up.
export function setupSheet(dlg) {
  let drag = null; // { y0, dy, dragging, onHandle, samples: [[y, t]...] } while a finger or the mouse is down
  let swallowClick = false;

  const begin = (y, target) => {
    swallowClick = false;
    if (!phone.matches || dlg.dataset.closing) return;
    const onHandle = !!target.closest?.(".sheet-handle");
    drag = { y0: y, dy: 0, dragging: false, onHandle, samples: [[y, performance.now()]] };
  };
  // Returns true while dragging the sheet, so the touch handler can stop the page from scrolling.
  const move = (y) => {
    if (!drag) return false;
    const dy = y - drag.y0;
    if (!drag.dragging) {
      // A drag starts with a move down on the handle, or anywhere while the sheet is scrolled to the
      // top; any other move scrolls.
      if (dy > 6 && (drag.onHandle || dlg.scrollTop <= 0)) drag.dragging = true;
      else if (Math.abs(dy) > 6) drag = null;
      if (!drag?.dragging) return false;
    }
    drag.dy = Math.max(0, dy);
    drag.samples = [...drag.samples.slice(-4), [y, performance.now()]];
    // Pointer positions are in screen pixels; the page (and the sheet in it) may be zoomed on phones.
    const scale = dlg.getBoundingClientRect().height / dlg.offsetHeight || 1;
    place(dlg, `${drag.dy / scale}px`, 1 - drag.dy / dlg.getBoundingClientRect().height, 0);
    return true;
  };
  const end = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.dragging) return;
    // The click that ends a mouse drag (fired right after pointerup) shouldn't open a matchup or
    // close the sheet; any later click counts again.
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 0);
    const [[y1, t1], [y2, t2]] = [d.samples[0], d.samples.at(-1)];
    const velocity = (y2 - y1) / Math.max(1, t2 - t1); // px per ms, down is positive
    if (d.dy > dlg.getBoundingClientRect().height * 0.3 || velocity > 0.5) closeSheet(dlg);
    else place(dlg, "", 1, OPEN_MS);
  };

  // Touch: a non-passive touchmove, so a drag can stop the sheet's own scrolling and the page's.
  dlg.addEventListener("touchstart", (e) => begin(e.touches[0].clientY, e.target), { passive: true });
  dlg.addEventListener("touchmove", (e) => { if (move(e.touches[0].clientY)) e.preventDefault(); }, { passive: false });
  dlg.addEventListener("touchend", end);
  dlg.addEventListener("touchcancel", end);
  // Mouse, for a narrow desktop window.
  dlg.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") begin(e.clientY, e.target); });
  window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") move(e.clientY); });
  window.addEventListener("pointerup", (e) => { if (e.pointerType === "mouse") end(); });
  dlg.addEventListener("click", (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);

  dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeSheet(dlg); }); // Escape slides it away too
  dlg.addEventListener("close", () => document.documentElement.classList.remove("sheet-lock"));
}
