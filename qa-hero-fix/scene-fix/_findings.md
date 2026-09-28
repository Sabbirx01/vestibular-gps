# Scene-fix visual verification — rolling record

Folder: F:\Nasa Project\VESTIBULAR GPS Webpage\qa-hero-fix\scene-fix\
Tab (all runs): tab-vtab-744310463 (user Chrome; built-in browser disabled)
Base URL: http://127.0.0.1:8322/  (hard reload Ctrl+Shift+R every load, fresh ?v= each time)

## Critical operational finding
Forcing `.intro { display:none }` via JS BREAKS the 3D scene handoff -> #gl canvas renders fully BLACK
(bh-1920-default.png first attempt + diag-bh1r.png). The site's OWN skip button (#introSkip) must be used
and the page then left ~3 s. `scene_prep.js` (click #introSkip + scrollIntoView #sec-hero) is correct.

## Done
1. 1920x1080 default (v=bh1b) -> bh-1920-default.png   quality=HIGH
2. 1920x1080 ptr 3,3 (v=bh2)      -> bh-1920-ptr-tl.png quality=HIGH
3. 1920x1080 ptr 1917,540 (v=bh3) -> bh-1920-ptr-r.png  quality=HIGH
4. 1920x1080 ptr 3,540 (v=bh4)    -> bh-1920-ptr-l.png  quality=HIGH
5. 1366x768 LOW (v=bh5)           -> bh-1366-low.png    quality=LOW
6. 1366x768 LOW second frame      -> bh-1366-low-2.png  quality=LOW
   (frame diff: only right HUD panel fade-in + telemetry numbers; accretion disk looks identical)

## Notes / evidence gathered
- Console (all runs so far): 0 errors, 0 warnings. Only info lines:
  "[SceneManager] NASA suit asset active Object" (SceneManager.js:220), one per load.
- Pointer parking was done with synthetic MouseEvent('pointermove'/'mousemove') on window+document
  (no native mouse-move tool exists); parallax visibly responds.
- gl pixel readback unusable: preserveDrawingBuffer:false -> readPixels/toDataURL return all zeros.
- Draw-call counter hook installed on #gl (window.__qaDraws), awaiting read.

## Remaining
7. 1366x768 LOW ptr 3,384 (v=bh6) -> bh-1366-low-ptr-l.png
8. 1024x768 MEDIUM (v=bh7)        -> bh-1024-med.png
9. 390x844 MOBILE (v=bh8)         -> bh-390-mobile.png
10. 768x1024 MEDIUM (v=bh9)       -> bh-768-med.png
+ read window.__qaDraws (render-loop liveness, supports Q13)
+ cleanup: localStorage.removeItem('vgps.quality') + one reload
+ final report incl. Q11 (dataset.quality per run), Q12 (errors/[SceneManager] lines), Q13, Q14
