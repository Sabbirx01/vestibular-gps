# Universe pass (v=w1…): plume + mobile-BH + Earth — PARTIAL RUN, rolling record

Tab: tab-vtab-744310823 (user Chrome; built-in browser disabled). Base: http://127.0.0.1:8322/
Page as shipped: NO DOM edits, no forced quality tier (localStorage vgps.quality absent).

## Method fix that WORKS (from the user's hint)
Dispatching pointermove in a tight sync loop = all events land between two animation frames ->
trail records a single point (all opacities 0). Correct method = spread the moves across frames:
  for (const p of pts) { dispatchEvent(new PointerEvent('pointermove',{clientX,clientY,bubbles:true}));
                         await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,25))); }
With 16 points (step 35px) the trail POPULATES: 14/14 segments opacity 0.501->0.062.

## Loads done
- w1 @1920x1080, quality HIGH — used for Part A (plume).

## Part A results
A1 plume-rest.png  : after parking pointer centre + 2 s untouched ->
   opacity array ["0","0","0","0","0","0","0","0","0","0","0","0","0","0"]  (all zeros, as expected)
   (first attempt showed 0.003/0.002 residuals right after a page jump; after the 2 s settle: all 0)
A2 plume-moving.png: diagonal (500,300)->(1025,825), 16 pts, 35px/step, rAF-spread ->
   opacity ["0.501","0.357","0.372","0.412","0.302","0.261","0.303","0.239","0.172","0.188","0.159","0.097","0.083","0.062"]
   segments >0.05 = 14 of 14; tail offsets from the trail origin (ship anchor): (-66,-66) ... (-486,-486),
   then 4 x (-483,-820); farthest offset magnitude = 952 px; nearest->farthest span = 861 px
   ship.style.rotate BEFORE move = "719.78deg"; AFTER = "-222.97deg"  -> ship DID rotate (heading follows path)
   NOTE: ship.getComputedStyle().transform = null (ship positioned by left/top), so ship->segment distance is
   measured from the trail container origin, not from a matrix-parsed ship anchor.
A3  : screenshot shows the ship's cyan/white glow at the end of the diagonal; a long tapering streak is NOT
      clearly resolvable at the captured paint -> DOM says tail exists (above), image capture timing inconclusive.
A4 plume-moving-2.png: opposite diagonal (500,825)->(1025,300) -> Runtime.evaluate TIMED OUT (rAF loop stalled);
   NOT captured. NO RETRY (circuit breaker + budget).
A5 plume-settled.png : not captured.

## Part B (mobile BH) — NOT RUN (390x844 / 430x932 / 360x780)
## Part C (Earth clipping) — NOT RUN (1366x768 / 1440x900 / 1920x1080 earth-1920.png overwrite NOT done)

## Console: 0 errors, 0 failed resources observed in the runs that completed.
