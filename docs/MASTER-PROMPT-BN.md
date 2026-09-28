# VESTIBULAR GPS — মাস্টার প্রম্পট (বাংলা)
### যেকোনো AI-কে দেওয়ার জন্য সম্পূর্ণ বিল্ড ব্রিফ

> **কীভাবে ব্যবহার করবে:** নিচের পুরো অংশটা কপি করে তোমার AI-কে দাও। এটা এই সাইটটা যা বানানো হয়েছে তার সম্পূর্ণ স্পেসিফিকেশন — কেউ এটা পড়ে একই জিনিস আবার বানাতে পারবে।

---

## ০. তোমার ভূমিকা

তুমি একইসঙ্গে **Senior Frontend Engineer + Three.js/WebGL Engineer + Motion Designer + Scientific Visualization Designer + Accessibility Engineer + QA Engineer**।

তোমার কাজ শুধু কোড লেখা না। তোমার কাজ: **একটা চলমান, ইন্টার‌্যাকটিভ 3D ওয়েব অ্যাপ্লিকেশন** বানানো যা বৈজ্ঞানিকভাবে সৎ, ভিজ্যুয়ালি অসাধারণ, আর সত্যিকারের ডেটা দিয়ে চলে।

**শুধু প্ল্যান লিখে থেমে যাবে না।** ফাইল তৈরি করবে → কোড লিখবে → চালাবে → ব্রাউজারে টেস্ট করবে → বাগ ঠিক করবে → আবার টেস্ট করবে → তারপর শেষ করবে।

---

## ১. প্রোডাক্ট

**নাম:** VESTIBULAR GPS
**ফোল্ডার:** `VESTIBULAR GPS Webpage`
**এক লাইনে:** ইনসান vestibular (ভারসাম্য) সিস্টেমের একটা ইন্টার‌্যাকটিভ 3D ল্যাবরেটরি — কান থেকে মস্তিষ্ক, আর মাধ্যাকর্ষণ বদলালে কী হয়।
**ট্যাগলাইন:** *Navigate the space between motion, balance and the brain.*

এটা ল্যান্ডিং পেজ না। এটা একটা **Neuro-Vestibular Space Navigation Laboratory** — ইউজার ঢুকে মনে করবে সে একটা ল্যাবে প্রবেশ করেছে।

---

## ২. প্রযুক্তি (এবং কেন)

| স্তর | সিদ্ধান্ত | কারণ |
|---|---|---|
| বিল্ড | **শূন্য বিল্ড** — নেটিভ ES modules | কোনো bundler নেই, কোনো `node_modules` নেই, ফাইল খুললেই চলে |
| 3D | **Three.js, লোকালি vendored** (`vendor/three.module.js`) | CDN-নির্ভরতা নেই → ইন্টারনেট ছাড়াও চলে, হ্যাকাথন ভেন্যুতে নিরাপদ |
| অ্যাসেট | **১০০% প্রসিডিউরাল** | কোনো ইমেজ ফাইল, GLB, ফন্ট বা লাইসেন্স নেই |
| UI | ভ্যানিলা JS + CSS কাস্টম প্রপার্টি | কোনো ফ্রেমওয়ার্ক নেই |
| সেন্সর | DeviceOrientation / DeviceMotion / Geolocation | ব্রাউজারের নেটিভ API |
| অডিও | ব্রাউজারে জেনারেটেড tone | কপিরাইটেড ফাইল নেই, autoplay নেই |

**সোনার নিয়ম:** বাইরের একটা ছবি বা মডেল ব্যবহার করলে সেটা একটা লাইসেন্স, একটা ডেড লিংক, আর একটা অফলাইন ব্যর্থতা। সব নিজে জেনারেট করো।

---

## ৩. ফাইল স্ট্রাকচার

```
VESTIBULAR GPS Webpage/
├── index.html                    (একটাই পেজ, সব সেকশন)
├── serve.py                      (dev server — Cache-Control: no-store)
├── vendor/three.module.js
├── src/
│   ├── styles/  tokens.css · base.css · components.css · sections.css
│   ├── core/    util.js · store.js
│   ├── sensors/ providers.js
│   ├── science/ content.js
│   ├── three/   materials.js · planetTextures.js · SpaceEnvironment.js
│   │            SolarSystem.js · Astronaut.js · InnerEar.js
│   │            BrainModel.js · SceneManager.js
│   ├── ui/      chrome.js · panels.js · labs.js
│   └── main.js
├── docs/  ARCHITECTURE.md · SCIENCE.md · SOURCES.md
│          SENSOR_API.md · TESTING.md · DEPLOYMENT.md
└── README.md
```

---

## ৪. ডিজাইন সিস্টেম

**প্যালেট (কখনো ভাঙবে না):**
```
void #04060f · deep navy #0a1226 · panel rgba(11,19,36,.86)
line rgba(122,170,220,.14)
cyan #5fe3ff (active) · blue #4a8bff (vestibular/space)
violet #a877ff (neural) · green #4ade80 (stable)
amber #ffb547 (attention) · red #ff5f6d (warning)
```

**টাইপোগ্রাফি:** সিস্টেম sans (হেডিং) + monospace (ডেটা)। কোনো ওয়েব ফন্ট নেই — অফলাইনে চলতে হবে।

**গ্লাস প্যানেল:** `backdrop-filter: blur(18px)`, ১px বর্ডার, সামান্য ভেতরের আলো।
> ⚠️ **প্যানেল প্রায় অপাকি রাখো (`--panel` alpha ≈ 0.86)।** 3D স্তর প্যানেলের পিছনে থাকে — বেশি ট্রান্সপারেন্ট হলে planet/ফিগার টেক্সটের ভিতর দিয়ে ভুতের মতো দেখা যাবে।

**সেমান্টিক রঙ:** সবসময় একই অর্থে। cyan = সক্রিয়, green = স্থিতিশীল, amber = খেয়াল দাও, red = সতর্কতা, violet = নিউরাল।

---

## ৫. কোর কনসেপ্ট: মাইক্রোগ্রাভিটি UI

পুরো সাইটে কোনো এলিমেন্ট কঠিনভাবে বসে না। সব **ভেসে থাকে**:

```js
প্রতি .float এলিমেন্টের জন্য:
  targetX = sin(t · speed + phase) · 5px · amplitude
  targetY = cos(t · speed · 0.83 + phase) · 6.5px · amplitude
  pushX   = পয়েন্টার দূরত্বের ভিত্তিতে সরানো (radius 340px)
  lag     = স্ক্রল করলে এলিমেন্ট পিছিয়ে পড়ে
  velocity = damp(velocity, (target − position) · 2.6, 6, dt)
  clamp(position, ±26px / ±30px)     ← পড়া নষ্ট না করার জন্য সীমা
```

**বাধ্যতামূলক:** motion সূক্ষ্ম হবে। `prefers-reduced-motion` মানলে শূন্য হবে। ভিউপোর্টের বাইরের এলিমেন্ট কুল করবে (getBoundingClientRect চেক)।

---

## ৬. 3D আর্কিটেকচার

### SpaceEnvironment
- দুই স্তরের তারার খোলস (parallax-এর জন্য আলাদা গভীরতা)
- তিন স্তরের নেবুলা (fBm শেডার, additive)
- ধুলো, কক্ষপথের আংটি
- **প্রতি স্তরের নিজস্ব parallax depth** — পয়েন্টার নাড়ালে স্তরগুলো আলাদা বেগে সরে

### SolarSystem
- Earth / Moon / Mars / Free-float — **সব প্রসিডিউরাল টেক্সচার**
- প্রতিটার জন্য: albedo + roughness map; Earth-এর জন্য **emissive map (রাতের শহরের আলো)** + **আলাদা মেঘের স্তর (alpha)**
- টেক্সচার জেনারেশন: আসল 3D value noise (trilinear interpolation) — সস্তা rounded-sin হ্যাক নয়, কারণ ওটা ব্লকি দেখায়
- crater-এর জন্য **per-row bounding-box culling** (নাহলে Moon জেনারেশন ৩০০ms নেয়)
- Earth ও Free-float একই recipe → **একবার জেনারেট করে ক্যাশ**

### Astronaut (দুইটা আলাদা ফিগার)
1. **FloatingAstronaut** — ভেসে বেড়ায়, ধীরে ঘোরে, অঙ্গ-প্রত্যঙ্গ microgravity drift-এ দোলে, হেলমেটে ভাইজর + ব্যাকপ্যাকে LED + টিথার। পয়েন্টার অনুসরণ করে।
2. **MeasurementSubject** — **২ মিটার লম্বা, সোজা দাঁড়ানো, দুই হাত প্রসারিত (T-pose)**, নিজের instrument frame-এর ভিতরে ধীরে ঘোরে। সাথে:
   - body axis (cyan, উল্লম্ব)
   - head axis (violet, আলাদা)
   - **centre-of-gravity marker + pulsing ring** (amber)
   - **orientation vectors** (forward/lateral/up) মাথা থেকে
   - **vestibular signal lines** কান → brainstem, সাথে চলমান pulse — **লাইভ motion stream দিয়ে চালিত**

> ⚠️ **প্রতিটা ফিগারের নিজের আলো থাকতে হবে।** MeshStandardMaterial আলো ছাড়া কালো সিলুয়েট হয়ে যায়। key + fill + rim + ambient — চারটাই দাও।

### InnerEar
- তিনটা semicircular canal, তিনটা আলাদা প্লেনে (anterior / posterior / lateral)
- প্রতিটার ampulla + **cupula** (gel sail)
- endolymph flow markers — canal-এর সক্রিয়তা অনুযায়ী গতি বাড়ে
- **utricle + saccule** — gel স্তর + **InstancedMesh otoconia** যেগুলো gravity vector অনুযায়ী সরে
- vestibular nerve + চলমান pulse
- cochlea (dimmed, শুধু প্রসঙ্গের জন্য)
- হেড রোটেশন ইনপুট → কোন canal কতটা সক্রিয় সেটা highlight

### BrainModel
- দুই গোলার্ধ (IcosahedronGeometry + fold displacement — জাইরেনসেফালিক দেখতে)
- cerebellum (ridged lobes), brainstem
- ৫টা নোড: vestibular nerve → nuclei → cerebellum → thalamus → cortex
- pathway গুলোতে চলমান pulse, লাইভ motion drive-এ
- প্রতিটা stage-এর **scientific confidence** আলাদা করে লেখা — কর্টিক্যাল ম্যাপ "active research" বলে চিহ্নিত

### SceneManager
- একটাই রেন্ডার লুপ
- **প্রতি লেয়ার আলাদা try/catch** — একটা লেয়ার ফেল করলে বাকিটা চলবে (আংশিক ইউনিভার্স > কালো স্ক্রিন)
- **per-frame fault budget** — একই লেয়ার ৩ বার ফেল করলে সেটা disable হয়ে যায়, কনসোল স্প্যাম হয় না
- **সেকশন-ভিত্তিক লেয়ার ভিজিবিলিটি** — ear/brain সেকশনে planet লুকানো, body-তে ইউনিভার্স লুকানো
- **কম্পোজিশন অফসেট** — ক্যামেরা subject-এর সাপেক্ষে বসে কিন্তু একটু অফ-অ্যাক্সিস তাকায়, ফলে figure খোলা কলামে পড়ে, প্যানেলের পিছনে নয়
- FPS মেপে নিজে থেকে quality নামায় (কখনো নিজে থেকে বাড়ায় না)

### MiniStage
- সেকশনের ভিতরের inline 3D viewport (ইয়ার / ব্রেইন / সাবজেক্ট)
- IntersectionObserver — অদৃশ্য হলে রেন্ডার বন্ধ
- ড্র্যাগ = orbit, হুইল = zoom, ক্লিক = raycast picking
- `targetY` — লম্বা মডেল (মানুষ) ঠিকভাবে ফ্রেম করতে

---

## ৭. সেন্সর আর্কিটেকচার

```
SensorProvider (বেস)
├── DeviceOrientationProvider   (iOS-এ requestPermission লাগে)
├── DeviceMotionProvider        (একই)
├── GeolocationProvider         (সম্পূর্ণ আলাদা ঐচ্ছিক স্তর)
├── SimulationProvider          (সবসময় উপলব্ধ — হার্ডওয়্যার ছাড়াই টেস্ট)
└── ReplayProvider              (রেকর্ড করা সেশনের প্লেব্যাক)

SensorHub — কোন প্রোভাইডার সক্রিয় সেটা নিয়ন্ত্রণ করে
```

**পাইপলাইন:** sensor → ingest → normalization → smoothing (damped) → link metrics (Hz, latency) → state → 3D + charts + HUD

**বাধ্যতামূলক:**
- প্রতিটা permission **আলাদা করে**, plain-language কারণসহ চাওয়া হবে
- সব প্রসেসিং **on-device**; কোনো ডেটা আপলোড হবে না
- **watchdog**: ১.৫ সেকেন্ড ডেটা না এলে "STALE" বলে simulation-এ নেমে যাবে — চুপচাপ জমে থাকবে না
- non-secure context হলে স্পষ্ট জানাবে যে sensor API ব্লকড

---

## ৮. "LIVE" শব্দের নিয়ম (এটা ভাঙা যাবে না)

| লেবেল | কখন |
|---|---|
| **LIVE SENSOR** | সত্যিই ডিভাইস সেন্সর থেকে ডেটা আসছে |
| **SIMULATION** | গাণিতিকভাবে জেনারেট করা ডেটা |
| **REPLAY** | রেকর্ড করা ডেটা |

**প্রতিটা সংখ্যা, চার্ট ও স্ক্রিনে বর্তমান সোর্স লেখা থাকবে।** কখনো সিমুলেশনকে লাইভ বলে দেখাবে না। এটাই পুরো সাইটের ক্রেডিবিলিটি।

---

## ৯. UI সেকশন প্রবাহ

```
CINEMATIC INTRO → HERO → 02 BODY → 03 EAR → 04 BRAIN → 05 VOR
→ 06 SENSORS → 07 MICROGRAVITY → 08 LAB → 09 RESEARCH → 10 FINAL
```

**Intro:** কালো → তারা দেখা দেয় → "WELCOME TO" → **"VESTIBULAR GPS"** অক্ষর ধরে ধরে blur-to-focus reveal → স্ক্যান বার → ENTER বাটন → skip (বিনয়ী)।
> ⚠️ **গ্রেডিয়েন্ট টেক্সটে ফাঁদ:** `background-clip: text` প্যারেন্টে দেবে না যদি চাইল্ড স্প্যানে `transform` বা `filter` থাকে — চাইল্ড নিজের পেইন্ট কনটেক্সট বানায়, ফলে অক্ষরগুলো অদৃশ্য হয়ে যায়। গ্রেডিয়েন্ট **প্রতিটা অক্ষরের স্প্যানে** দাও।

**Hero HUD (উপরে ডানে):** SYSTEM · MODE · SOURCE · ORIENTATION · JERK · RATE · 3D ENGINE · FPS বার — সব **লাইভ state থেকে**।

**Journey rail (বাঁয়ে):** উল্লম্ব টেক্সট (পাতলা রাখতে, যাতে কার্ডের উপরে না পড়ে), স্ক্রল ফিল, বর্তমান সেকশন হাইলাইট।

**কাস্টম কার্সর:** ছোট স্পেসশিপ SVG, inertia সহ পয়েন্টার অনুসরণ করে; hover/click/target-lock অবস্থা; touch ডিভাইসে বন্ধ।

---

## ১০. ল্যাব (৬টা ডেমো)

প্রতিটার সাথে চার স্তরের ব্যাখ্যা: **WHAT / WHY / HOW / SOURCE**।

| টেস্ট | ধরন |
|---|---|
| 01 Orientation Tracking | **আসল** — পয়েন্টার/ডিভাইস টিল্ট দিয়ে সত্যিকারের tracking error মাপে |
| 02 VOR Demonstration | ফার্স্ট-অর্ডার হাই-পাস মডেল; head vs eye velocity, retinal slip |
| 03 Balance & Axes | stochastic centre-of-pressure মডেল, sway path / RMS / 95% ellipse |
| 04 Motion Direction | **আসল** — অ্যারো কী দিয়ে RT ও accuracy মাপে |
| 05 Visual–Vestibular Conflict | conflict index র‍্যাম্প মডেল |
| 06 Earth vs Microgravity | **লাইভ** — বর্তমান mode থেকে চলে |

প্রতিটা মডেল ডেমোকে **UI-তেই "conceptual model" বলে চিহ্নিত করতে হবে**।

---

## ১১. বৈজ্ঞানিক সততা (সবচেয়ে গুরুত্বপূর্ণ অংশ)

কখনো লিখবে না:
- ❌ "You have vestibular dysfunction"
- ❌ "NASA approved / NASA partner / NASA research lab"
- ❌ কোনো ডায়াগনোসিস, স্ক্রিনিং বা চিকিৎসার দাবি
- ❌ কোনো ভেরিফাই না করা সংখ্যা বা সোর্স

লিখবে:
- ✅ "This is an educational visualization, not a medical device."
- ✅ "Inspired by publicly documented spaceflight and vestibular research. No agency affiliation or endorsement."
- ✅ "Conceptual model" / "Illustration" — যেখানে প্রযোজ্য
- ✅ প্রতিটা দাবির সাথে সোর্স লিংক

**সোর্স রেজিস্ট্রি:** প্রতিটা এন্ট্রিতে `title · org · tier · url · pub date · summary · supports · where used`। প্রতিটা লিংক ব্রাউজারে খুলে যাচাই করবে — কোনো ডেড বা বানানো URL নয়।

**উচ্চ-মানের সোর্স:** NASA HRP / NTRS / TechPort / CIPHER · NIH-NIDCD · NCBI Bookshelf / StatPearls / PubMed · পিয়ার-রিভিউড লিটারেচার।

---

## ১২. Performance

- Quality tiers: `ULTRA / HIGH / MEDIUM / LOW / MOBILE` (ডিভাইস স্ক্যান করে স্বয়ংক্রিয়, `Q` চেপে ম্যানুয়াল)
- adaptive pixel ratio, InstancedMesh, Points, frustum culling
- IntersectionObserver দিয়ে অফ-স্ক্রিন 3D বন্ধ
- FPS < 34 হলে স্বয়ংক্রিয়ভাবে quality নামানো
- **তিন লেভেলের অ্যানিমেশন:** micro (hover) · meso (cards/charts) · macro (camera/scene) — সমন্বিত, র‍্যান্ডম নয়

---

## ১৩. Accessibility

- `prefers-reduced-motion` → সব floating/parallax/camera motion শূন্য, chart আপডেট ধীর
- keyboard: সব কন্ট্রোল ট্যাবযোগ্য, `:focus-visible` রিং, `Q` = quality
- সব interactive 3D কন্ট্রোলের textual/তালিকা বিকল্প
- skip-link, ARIA labels, live regions, কনট্রাস্ট ≥ 4.5:1
- **প্রজেক্টরে পড়ার যোগ্যতা** — হ্যাকাথন ভেন্যুতে low-contrast ছোট ধূসর টেক্সট অদৃশ্য হয়ে যায়

---

## ১৪. বাধ্যতামূলক বুট গার্ড

ES module graph ফেল করলে `main.js`-এর ভিতরের কোনো failsafe চলতেই পারে না — কারণ ওই মডিউলটাই চলে না। তাই:

1. `index.html`-এ একটা **ক্লাসিক (non-module) স্ক্রিপ্ট** রাখো যা ১৫ সেকেন্ড পরে কার্টেন নামিয়ে দেয় এবং এরর দেখায়।
2. `main.js` চালু হওয়ামাত্র `window.__VG_STARTED__ = true` সেট করে।
3. **`serve.py`** দিয়ে সার্ভ করো যা `Cache-Control: no-store` পাঠায় — নাহলে Chrome পুরনো মডিউল ক্যাশ করে এবং "does not provide an export named X" এরর reload করেও যায় না।

---

## ১৫. যেগুলো আমি নিজে ভুল করেছিলাম — এগুলো এড়াও

| আমি যা করেছিলাম | ফল | সঠিক পথ |
|---|---|---|
| `fresnelMaterial`-এ `uniforms.uOpacity` সেট করেছিলাম (আছে `uIntensity`) | প্রতি ফ্রেমে TypeError → **পুরো ইউনিভার্স কালো** | uniform-এর নাম যাচাই করো, আর অ্যাক্সেস করার আগে guard দাও |
| `glowLine(...).userData = {...}` দিয়ে overwrite করেছিলাম | `curve` হারিয়ে গেল → pulse আপডেট ক্র্যাশ | `Object.assign(line.userData, {...})` |
| `add(head, shellMesh, shell.material)` — Mesh-কে geometry হিসেবে পাঠিয়েছি | `updateMorphTargets`-এ throw | mesh সরাসরি parent-এ যোগ করো |
| ফিগারের কোনো আলো দিইনি | কালো সিলুয়েট | প্রতিটা 3D ফিগারে নিজস্ব key/fill/rim/ambient |
| `scene.fog` সেট করেছিলাম custom shader-এর সাথে | additive স্তর কালো হয়ে গেল | fog বাদ দাও বা shader-এ fog chunk যোগ করো |
| `.debug { display:grid }` + `hidden` attribute | প্যানেল কখনো লুকায় না | `.debug[hidden] { display:none !important }` |
| প্যারেন্টে `background-clip:text` + ট্রান্সফর্মড চাইল্ড | wordmark অদৃশ্য | গ্রেডিয়েন্ট চাইল্ড স্প্যানে দাও |
| বুট failsafe `main.js`-এর ভিতরে রাখলাম | মডিউল ফেল করলে কখনো চলবে না | ক্লাসিক স্ক্রিপ্টে রাখো |
| প্যানেল খুব ট্রান্সপারেন্ট | planet/ফিগার টেক্সটে ভেসে ওঠে | panell alpha ≈ 0.86 |

---

## ১৬. ডেলিভারেবল

1. সম্পূর্ণ কাজ করা সাইট (উপরের সব কিছু)
2. `serve.py` — no-store dev server, ফোনে টেস্টের জন্য `python serve.py 8322 0.0.0.0`
3. ডকুমেন্টেশন: `ARCHITECTURE.md` · `SCIENCE.md` · `SOURCES.md` · `SENSOR_API.md` · `TESTING.md` · `DEPLOYMENT.md`
4. `README.md` — ৬০ সেকেন্ডে চালানোর নির্দেশ

## ১৭. শেষ করার শর্ত

কাজ তখনই শেষ:
```
✅ console.error শূন্য (সব সেকশনে স্ক্রল করে যাচাই করা)
✅ প্রতিটা 3D ক্যানভাস দৃশ্যমান কনটেন্ট রেন্ডার করে
✅ বুট কার্টেন নিজে থেকে সরে যায়, failsafe লাগে না
✅ লাইভ সেন্সর চালু হয় যেখানে সমর্থিত, নাহলে simulation — আর সোর্স লেবেল সবসময় সঠিক
✅ মোবাইলে ব্যবহারযোগ্য, কনটেন্ট কাটা পড়ে না
✅ কোনো বানানো সোর্স, ডেড লিংক বা চিকিৎসা-দাবি নেই
✅ কোনো এলিমেন্ট টেক্সটের উপরে আঁকা পড়ে না
```
যা টেস্ট করা হয়নি সেটা **"NOT VERIFIED"** বলে জানাবে। জল্পনা করবে না।
