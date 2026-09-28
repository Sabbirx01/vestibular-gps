/* ═══════════════════════════════════════════════════════════
   bn.js — the Bengali dictionary.

   KEY RULE: the key must be the EXACT text of the node in the English site,
   whitespace-collapsed, punctuation included. Matching is exact on purpose —
   see src/i18n/index.js. A key that does not match costs nothing; it just
   leaves that line in English, which is why coverage is measured by
   `node tools/extract-strings.mjs` rather than assumed.

   STYLE: technical terms stay in English inside Bengali sentences (motion,
   balance, baseline, domain, VOR, eye landmark). That is how the team
   actually speaks, and it avoids inventing Bengali words for measured
   quantities. Do not translate a value that the code also uses as an
   identifier — only its on-screen phrasing.

   Coverage so far: the shell, the navigation, the intro, the hero, the twelve
   section headings with their introductions, and the buttons a visitor meets
   first. The deep per-panel captions are not translated yet.
   ═══════════════════════════════════════════════════════════ */

export const BN = {
  /* ── navigation ──────────────────────────────────────── */
  'Explore': 'এক্সপ্লোর',
  'Body': 'শরীর',
  'Ear': 'কান',
  'Brain': 'মগজ',
  'VOR': 'VOR',
  'Sensors': 'সেন্সর',
  'Space': 'মহাকাশ',
  'Lab': 'ল্যাব',
  'Console': 'কনসোল',
  'Integration': 'ইন্টিগ্রেশন',
  'Research': 'রিসার্চ',

  /* ── intro overlay ───────────────────────────────────── */
  'WELCOME TO': 'স্বাগতম',
  'Navigate the space between motion, balance and the brain.':
    'motion, balance আর brain — এই তিনটার মাঝের জায়গাটা নিয়ে আমাদের ল্যাব।',
  'ENTER THE EXPERIENCE': 'শুরু করি',
  'Skip intro': 'ইন্ট্রো বাদ দাও',
  'Skip to content': 'সোজা কনটেন্টে যাও',
  'JavaScript required': 'JavaScript দরকার',
  'Loading': 'লোড হচ্ছে',

  /* ── hero ────────────────────────────────────────────── */
  'NEURO-VESTIBULAR SPACE NAVIGATION LABORATORY': 'নিউরো-ভেস্টিবুলার স্পেস নেভিগেশন ল্যাবরেটরি',
  'A NEURO-VESTIBULAR SPACE NAVIGATION LABORATORY': 'একটি নিউরো-ভেস্টিবুলার স্পেস নেভিগেশন ল্যাবরেটরি',
  'Neuro-vestibular space navigation laboratory': 'নিউরো-ভেস্টিবুলার স্পেস নেভিগেশন ল্যাবরেটরি',
  'Navigate the space between': 'ঘুরে দেখো সেই ফাঁকা জায়গাটা —',
  'and the': 'আর',
  'EXPLORE THE SCIENCE': 'বিজ্ঞানটা দেখো',
  'EXPLORE AGAIN': 'আবার ঘুরে দেখো',
  'EXPLORE RESEARCH': 'রিসার্চ দেখো',
  'Educational visualization. Not a medical device, not a diagnostic tool, and not affiliated with or endorsed by NASA.':
    'শিক্ষামূলক ভিজুয়ালাইজেশন। এটি কোনো মেডিকেল ডিভাইস নয়, ডায়াগনস্টিক টুল নয়, এবং NASA-র সাথে সম্পৃক্ত বা অনুমোদিতও নয়।',
  /* The full sentence, including its final clause. An incomplete key silently
     does nothing, which is exactly how this one was missed the first time. */
  'Your inner ear is a biological navigation instrument. It senses rotation, detects gravity, and reports to your brainstem and cerebellum in milliseconds — a system you never notice until it disagrees with what your eyes see. This is an interactive laboratory for that system, and for what happens to it when gravity changes.':
    'তোমার ভেতরের কানটা আসলে একটা জৈবিক নেভিগেশন যন্ত্র। এটা ঘূর্ণন টের পায়, gravity টের পায়, আর মিলিসেকেন্ডের মধ্যে brainstem আর cerebellum-কে জানায় — এমন একটা ব্যবস্থা, যার অস্তিত্ব তুমি টের পাও না, যতক্ষণ না ওটা তোমার চোখের সাথে ঝগড়া শুরু করে। এই পেজটা ওই ব্যবস্থার একটা ইন্টারঅ্যাকটিভ ল্যাব — আর gravity বদলে গেলে ওটার কী হয়, সেটাও।',
  'SELF-REFERENCED · NOT A POPULATION NORM': 'নিজের baseline ধরে · জনগণের গড় নয়',

  /* ── hero spec cards + section titles ────────────────── */
  'SEMICIRCULAR CANALS': 'সেমিসার্কুলার ক্যানাল',
  'OTOLITH ORGANS': 'ওটোলিথ অর্গান',
  'CANAL ARRANGEMENT': 'ক্যানালের বিন্যাস',
  'OTOCONIA': 'ওটোকোনিয়া',
  'Vestibular Lab': 'ভেস্টিবুলার ল্যাব',
  'NEURO-VESTIBULAR LAB': 'নিউরো-ভেস্টিবুলার ল্যাব',

  /* ── section headings and their introductions ────────── */
  'Move. The system feels it.': 'নড়াচড়া করো। ব্যবস্থাটা টের পায়।',
  'Balance is not one sense. It is a continuous arbitration between three inputs that your brain must reconcile — and when they disagree, you feel it.':
    'ভারসাম্য কোনো একটা ইন্দ্রিয় নয়। তিনটা ইনপুটের মধ্যে চলতে থাকা একটা আপস-রফা, যেটা মগজকে মিলিয়ে নিতে হয় — আর ওগুলোতে মিল না হলে তুমি সেটা গায়ে টের পাও।',
  'You are always navigating.': 'তুমি সবসময়ই navigate করছ।',
  'Your body knows where you are.': 'তোমার শরীর জানে তুমি কোথায় আছো।',
  'Three canals. Two otolith organs. One nerve.': 'তিনটা canal। দুটো otolith organ। একটা স্নায়ু।',
  'The inner ear reports head rotation and linear acceleration. Unlike vision it has no off switch — you cannot close your ears.':
    'ভেতরের কান মাথার ঘূর্ণন আর linear acceleration জানায়। চোখের মতো এর কোনো অফ-সুইচ নেই — কান বন্ধ করা যায় না।',
  'Angular acceleration — one plane each: anterior, posterior, lateral.':
    'Angular acceleration — প্রতিটি একটা করে plane-এ: anterior, posterior, lateral।',
  'Utricle and saccule sense linear acceleration and head tilt.':
    'Utricle আর saccule linear acceleration আর মাথার কাত টের পায়।',
  'Dense calcium-carbonate grains that gravity pulls on to signal head position.':
    'ঘন calcium-carbonate দানা — gravity এগুলোকে টানে, আর সেটাই মাথার অবস্থান জানায়।',
  'The three canals sit at roughly right angles to one another, one plane each.':
    'তিনটা canal প্রায় সমকোণে বসানো, প্রতিটি একটা করে plane ঢেকে দেয়।',
  'The brain turns motion into orientation.': 'মগজ নড়াচড়াকে দিক-জ্ঞান বানায়।',
  'Vestibular signals travel the eighth cranial nerve to the brainstem, are calibrated by the cerebellum, and reach cortex — where they are combined with vision and proprioception into a single sense of where you are.':
    'Vestibular সংকেত অষ্টম cranial nerve ধরে brainstem-এ যায়, cerebellum সেটা ক্যালিব্রেট করে, তারপর cortex-এ পৌঁছে — যেখানে চোখ আর proprioception-এর সাথে মিলে একটা একক "আমি কোথায় আছি" বানায়।',
  'Your eyes report the position and movement of the world relative to you. Vision is the dominant input when the other two conflict — which is exactly what causes motion sickness.':
    'তোমার চোখ জানায় তোমার সাপেক্ষে দুনিয়াটা কোথায় আর কতটা নড়ছে। বাকি দুটোতে বিরোধ হলে vision-ই প্রধান হয়ে যায় — আর ঠিক সেই বিরোধটাই motion sickness বানায়।',
  'Muscle spindles, joint receptors and pressure sensors in your feet report how your body is loaded and oriented against a surface.':
    'পায়ের muscle spindle, joint receptor আর pressure sensor জানায় শরীরটা কোনো তলের ওপর কতটা ভর দিয়ে কীভাবে আছে।',
  'Why the world stays still when your head does not.': 'মাথা নড়লেও দুনিয়া স্থির থাকে কেন।',
  'Shake your head from side to side. The world does not blur. The vestibulo-ocular reflex drives your eyes in the opposite direction at almost exactly equal speed, stabilising the image on the retina with a latency of a few milliseconds.':
    'মাথা ডানে-বাঁয়ে নাড়ো। দুনিয়া ঝাপসা হয় না। Vestibulo-ocular reflex প্রায় সমান গতিতে উল্টো দিকে চোখ ঘোরায়, আর কয়েক মিলিসেকেন্ডের মধ্যে ছবিটা retina-তে স্থির করে রাখে।',
  'Gain 1.0 means eye velocity matches head velocity. Below ~0.7, retinal slip becomes visible — the world would smear.':
    'Gain 1.0 মানে চোখের গতি মাথার গতির সমান। ~0.7-এর নিচে retinal slip চোখে পড়তে শুরু করে — দুনিয়াটা টেনে-হিঁচড়ে যাওয়া লাগত।',
  'The same signals your vestibular system uses — rotation and linear acceleration — are available in your browser. With your permission, this page can read them and drive the 3D scene live. Nothing is uploaded. Everything is processed on this device.':
    'তোমার vestibular system যেসব সংকেত ব্যবহার করে — ঘূর্ণন আর linear acceleration — সেগুলোই তোমার ব্রাউজারে আছে। তোমার অনুমতি পেলে এই পেজ সেগুলো পড়ে 3D দৃশ্য সরাসরি চালাতে পারে। কিছুই আপলোড হয় না, সব তোমার ডিভাইসেই হিসাব হয়।',
  'What happens when gravity changes?': 'gravity বদলে গেলে কী হয়?',
  'Six demonstrations. Each one shows what is being measured, what the mathematics does, and where the science comes from — with a clear line between what is documented and what is simulated here.':
    'ছয়টা ডেমো। প্রতিটা দেখায় — কী মাপা হচ্ছে, অঙ্কটা কী করছে, আর বিজ্ঞানটা কোথা থেকে এসেছে; সাথে কোনটা প্রমাণিত আর কোনটা এখানে সিমুলেট করা, সেটার পরিষ্কার দাগ।',
  'The instrument, not just the explanation.': 'শুধু ব্যাখ্যা নয় — যন্ত্রটা নিজেই।',
  'The measurement frame': 'মাপার ফ্রেম',
  'This is the instrument view: a standing subject, arms extended, turning slowly while the reference frame stays fixed. The number you read anywhere else on this page comes from the same idea — comparing a person against their own reference, not against a crowd.':
    'এটা যন্ত্রের দৃশ্য: দাঁড়িয়ে থাকা একজন মানুষ, হাত দুটো প্রসারিত, ধীরে ঘুরছে — আর reference frame স্থির। এই পেজে তুমি অন্য যেখানেই একটা সংখ্যা পড়ো, সেটা একই ধারণা থেকে আসে: মানুষকে তার নিজের রেফারেন্সের সাথে মেলা, ভিড়ের সাথে নয়।',
  'How this connects to real instruments.': 'এটা আসল যন্ত্রপাতির সাথে কীভাবে জোড়া লাগে।',
  'Where the science comes from.': 'বিজ্ঞানটা কোথা থেকে এসেছে।',
  'The index cannot report until a personal reference exists. Capture at least three baseline sessions — from the live channels, from the simulator in section 06, or by ingesting a payload in section 10. Until then the console says so rather than inventing a number.':
    'নিজের একটা রেফারেন্স তৈরি না হলে ইনডেক্স কিছু বলবে না। অন্তত তিনটা baseline session নাও — live channel থেকে, সেকশন ০৬-এর simulator থেকে, অথবা সেকশন ১০-এ একটা payload ingest করে। ততক্ষণ কনসোল সংখ্যা বানিয়ে দেখাবে না, বরং সেটাই বলে দেবে।',

  /* ── integrity and consent ───────────────────────────── */
  'Integrity statement': 'সততার বয়ান',
  'No clinical claim is made anywhere on this site. Nothing here diagnoses, screens for, or treats any condition.':
    'এই সাইটের কোথাও কোনো clinical দাবি করা হয়নি। এখানে কিছুই রোগ নির্ণয় করে না, screen করে না, চিকিৎসা করে না।',
  'This project is inspired by publicly documented spaceflight and vestibular research. It is not affiliated with, approved by, or endorsed by NASA or any agency.':
    'এই প্রজেক্টটি প্রকাশিত spaceflight ও vestibular গবেষণা থেকে অনুপ্রাণিত। এটি NASA বা কোনো সংস্থার সাথে সম্পৃক্ত নয়, তাদের অনুমোদিত বা endorsed নয়।',
  'Educational visualization built on publicly documented research. Not a medical device. No agency affiliation.':
    'প্রকাশিত গবেষণার ওপর দাঁড়ানো শিক্ষামূলক ভিজুয়ালাইজেশন। মেডিকেল ডিভাইস নয়। কোনো সংস্থার সাথে সম্পৃক্ততা নেই।',
  'Anatomical models are interactive illustrations built from procedural geometry. They are anatomically informed but not patient-derived imaging.':
    'Anatomical model-গুলো প্রসিডিউরাল geometry দিয়ে বানানো ইন্টারঅ্যাকটিভ ছবি। এগুলো anatomy অনুসরণ করে বানানো, কিন্তু কোনো রোগীর ইমেজিং ডেটা নয়।',
  'Illustration only. This is not a biomechanical model, not a clinical assessment, and not a measurement of any real person.':
    'শুধুই illustration। এটি biomechanical model নয়, clinical assessment নয়, আর কোনো প্রকৃত মানুষের মাপও নয়।',
  'Consent first': 'আগে অনুমতি',
  'Each sensor is requested separately, with a plain-language reason. Refusing any of them leaves the rest of the experience fully usable.':
    'প্রতিটা সেন্সরের অনুমতি আলাদা করে চাওয়া হয়, সোজা ভাষায় কারণ জানিয়ে। যেকোনোটা না দিলেও বাকি সবকিছু পুরোপুরি ব্যবহার করা যায়।',
  'All generated data is labelled': 'যা বানানো, সবকিছুর গায়ে লেখা আছে',
  'Capture the stream, then play it back. Stored in memory on this device only — never uploaded.':
    'stream টা রেকর্ড করো, তারপর আবার চালাও। শুধু এই ডিভাইসের মেমরিতে থাকে — কোথাও আপলোড হয় না।',
  'No sensor connected. Values are mathematically generated and labelled as simulation everywhere they appear.':
    'কোনো সেন্সর জোড়া নেই। মানগুলো অঙ্ক দিয়ে বানানো, আর যেখানেই দেখা যায় সেখানেই simulation বলে লেখা থাকে।',
  'Real loading progress — no simulated percentage.': 'আসল loading progress — বানানো শতাংশ নয়।',
  'Derived from the same state that drives the 3D scene.': 'যে state 3D দৃশ্য চালায়, এটাও সেটার থেকেই আসে।',
  'Rolling window of angular rate, in degrees per second.': 'angular rate-এর rolling window, degree per second-এ।',
  'No hardware needed. Drive the entire pipeline by hand to reproduce any state.':
    'কোনো হার্ডওয়্যার লাগে না। হাত দিয়েই পুরো pipeline চালিয়ে যেকোনো অবস্থা আবার বানানো যায়।',
  'Switch between a live device sensor and a generated signal. The interface always states which one is driving the scene.':
    'live device sensor আর বানানো সংকেতের মধ্যে বদল করো। কোনটা দৃশ্য চালাচ্ছে, ইন্টারফেস সবসময় সেটা লিখে দেয়।',
  'Drag to orbit the model. Select a structure to read what it senses and how. Rotate the head controller and watch which canal responds.':
    'মডেলটা টেনে ঘোরাও। যেকোনো structure বেছে নিয়ে পড়ো সেটা কী টের পায় আর কীভাবে। head controller ঘুরিয়ে দেখো কোন canal সাড়া দেয়।',
  'Pick one of the six demonstrations above.': 'উপরের ছয়টা ডেমোর একটা বেছে নাও।',
  'Step through the route from end organ to cortex.': 'end organ থেকে cortex পর্যন্ত পথটা ধাপে ধাপে দেখো।',
  'This section is a documented ingestion contract — how this would connect to real instruments.':
    'এই সেকশনটা একটা লিখিত ingestion contract — আসল যন্ত্রপাতির সাথে এটা কীভাবে জোড়া লাগবে।',

  /* ── buttons and controls ────────────────────────────── */
  'ENTER VESTIBULAR LAB': 'ভেস্টিবুলার ল্যাবে ঢুকো',
  'CAPTURE BASELINE SESSION': 'baseline session নাও',
  'START RECORDING': 'রেকর্ড শুরু',
  'PLAY BACK': 'আবার চালাও',
  'RESET VIEW': 'দৃশ্য আগের মতো',
  'EXPORT CSV': 'CSV নামাও',
  'EXPORT JSON': 'JSON নামাও',
  'ALLOW LOCATION': 'location-এর অনুমতি দাও',
  'ALLOW MOTION': 'motion-এর অনুমতি দাও',
  'ALLOW ORIENTATION': 'orientation-এর অনুমতি দাও',
  'NOT REQUESTED': 'চাওয়া হয়নি',
  'SOUND ON': 'সাউন্ড চালু',
  'SOUND OFF': 'সাউন্ড বন্ধ',
  'SOUND ENABLED': 'সাউন্ড চালু',
  'SOUND MUTED': 'সাউন্ড বন্ধ',
  'GRAPHICS QUALITY': 'গ্রাফিক্স কোয়ালিটি',
  'Ambient tone generated in the browser. Off by default, and never autoplays on load.':
    'ambient tone ব্রাউজারেই তৈরি হয়। ডিফল্টে বন্ধ, লোড হওয়ার সাথে সাথেই কখনো নিজে থেকে চালু হয় না।',

  /* ── provenance labels ───────────────────────────────── */
  'SIMULATION': 'সিমুলেশন',
  'LIVE SENSOR': 'লাইভ সেন্সর',
  'REPLAY': 'রিপ্লে',
  'MODEL': 'মডেল',

  /* ── live HUD labels ─────────────────────────────────── */
  '3D ENGINE': '3D ইঞ্জিন',
  'ACTIVE OBJS': 'সক্রিয় অবজেক্ট',
  'DRAW CALLS': 'ড্র কল',
  'SOURCE': 'সোর্স',
  'MODE': 'মোড',
  'RATE': 'রেট',
  'JERK': 'জার্ক',
  'ORIENTATION': 'অরিয়েন্টেশন',
  'SIGNAL LINES': 'সিগন্যাল লাইন',
  'ORIENTATION VECTORS': 'অরিয়েন্টেশন ভেক্টর',
  'BODY AXIS': 'শরীরের অক্ষ',
  'HEAD AXIS': 'মাথার অক্ষ',
  'CENTRE OF GRAVITY': 'ভরকেন্দ্র',
  'REFLEX GAIN': 'রিফ্লেক্স gain',
  'GAZE STABILIZATION': 'gaze স্থির রাখা',
  'LINEAR ACCEL': 'linear accel',
  'MOTION SYMPTOMS (SELF-REPORT)': 'motion symptoms (নিজের বলা)',
  'LIVE TRACE': 'লাইভ ট্রেস',
  'Live trace': 'লাইভ ট্রেস',

  /* ── camera panel (INTEGRATION) ────────────────────────
     The panel the user reported as "still English". Row labels, states and the
     captions under the verification block.                          */
  'ANALYSIS RATE': 'অ্যানালাইসিস রেট',
  'SAMPLES': 'স্যাম্পল',
  'FACE LOCK': 'ফেস লক',
  'LOCK HELD BY': 'লক ধরে রেখেছে',
  'FACE EVIDENCE IN BOX': 'বক্সে মুখের পরিমাণ',
  'BOX AREA OF FRAME': 'ফ্রেমে বক্সের অংশ',
  'LIVE HEAD MOTION': 'লাইভ মাথার motion',
  'LIVE EYE–HEAD / VOR': 'লাইভ eye–head / VOR',
  'EYE–HEAD / VOR': 'eye–head / VOR',
  'SIGNAL QUALITY': 'সিগন্যাল কোয়ালিটি',
  'MOTION ENERGY (ABOVE FLOOR)': 'motion energy (noise floor-এর ওপরে)',
  'JITTER (ABOVE FLOOR)': 'jitter (noise floor-এর ওপরে)',
  'SECURE CONTEXT': 'secure context',
  'HEAD YAW · COARSE ESTIMATE': 'মাথার yaw · মোটা অনুমান',
  'HEAD PITCH · COARSE ESTIMATE': 'মাথার pitch · মোটা অনুমান',
  'HEAD ROLL · COARSE ESTIMATE': 'মাথার roll · মোটা অনুমান',
  'HEAD MOTION + COARSE HEAD POSE · NOT GAZE': 'মাথার motion + মোটা head pose · gaze নয়',
  'HEAD MOTION + COARSE HEAD POSE': 'মাথার motion + মোটা head pose',
  'FACE VERIFICATION': 'ফেস ভেরিফিকেশন',
  'VERDICT': 'রায়',
  'LOCK': 'লক',
  'NEUTRAL': 'neutral',
  'EVIDENCE': 'প্রমাণ',
  'STABILITY': 'স্থিরতা',
  'POSE': 'pose',
  'VERIFIED FOR': 'ভেরিফায়েড সময়',
  'CALIBRATION': 'ক্যালিব্রেশন',
  'CALIBRATED': 'ক্যালিব্রেটেড',
  'HOLD STILL': 'স্থির থাকো',
  'SCANNING': 'স্ক্যান চলছে',
  'SEARCHING': 'খুঁজছি',
  'LOST': 'হারিয়ে গেছে',
  'LOCKED': 'লক হয়েছে',
  'NO FACE': 'মুখ নেই',
  'NOT MEASURED': 'মাপা হয়নি',
  'NOT STARTED': 'চালু করা হয়নি',
  'NOT CALIBRATED': 'ক্যালিব্রেট হয়নি',
  'NOT CALIBRATED — HOLD-STILL FLOOR NOT MEASURED': 'ক্যালিব্রেট হয়নি — hold-still noise floor মাপা হয়নি',
  'STORED AT CALIBRATION': 'calibration-এ সংরক্ষিত',
  'NO — CAMERA BLOCKED': 'না — ক্যামেরা বন্ধ',
  'EVIDENCE WEAK': 'প্রমাণ দুর্বল',
  'VERIFIED': 'ভেরিফায়েড',
  'PASS LOCKED': 'পাস — লক হয়েছে',
  'PASS STRUCTURE': 'পাস — গঠন (structure)',
  'WAY': 'উপায়',
  'START CAMERA SCAN': 'ক্যামেরা স্ক্যান শুরু',
  'CAMERA RUNNING': 'ক্যামেরা চলছে',
  'RETRY CAMERA SCAN': 'আবার চেষ্টা করো',
  'REQUESTING PERMISSION…': 'অনুমতি চাওয়া হচ্ছে…',
  'CALIBRATE (HOLD STILL 2s)': 'ক্যালিব্রেট (২ সেকেন্ড স্থির)',
  'CALIBRATE (HOLD STILL 2s, FACE THE CAMERA)': 'ক্যালিব্রেট (২ সেকেন্ড স্থির, ক্যামেরার দিকে)',
  'STOP': 'বন্ধ করো',
  'INGEST PAYLOAD': 'payload ingest',
  'PAYLOAD INGESTED': 'payload ঢুকেছে',
  'UNAVAILABLE — CAMERA HAS NO EYE LANDMARKS': 'পাওয়া যাচ্ছে না — ক্যামেরায় eye landmark নেই',
  'Face scan overlay': 'face scan overlay',
  'Live camera preview': 'লাইভ ক্যামেরা প্রিভিউ',
  'Front camera — face scan + head motion': 'সামনের ক্যামেরা — face scan + মাথার motion',
  'Hold your head still and face the camera for about two seconds. This measures the noise floor AND your neutral head pose.':
    'মাথা স্থির রেখে প্রায় দুই সেকেন্ড ক্যামেরার দিকে তাকাও। এতে noise floor আর তোমার neutral head pose — দুটোই মাপা হয়।',
  'Noise floor measured and subtracted, and your neutral head pose is stored — the pose readout is now relative to you, not to a population.':
    'noise floor মাপা ও বাদ দেওয়া হয়েছে, আর তোমার neutral head pose সংরক্ষিত — pose-এর মান এখন তোমার সাপেক্ষে, জনগণের গড়ের নয়।',
  'straight ahead': 'সোজা সামনে',
  'how far have I turned': 'কতটা ঘুরেছি',
  'no face seen': 'মুখ দেখা যায়নি',
  'not set up yet': 'এখনো সেট করা হয়নি',
  'lock held by structure': 'লক ধরে রেখেছে গঠন (structure)',
  'no gravity': 'gravity নেই',
  'none external': 'বাইরের কিছু নেই',
  'Sound muted.': 'সাউন্ড বন্ধ।',
  'mm RMS sway': 'mm RMS দোল',
  'deg (gaze error proxy)': 'ডিগ্রি (gaze error-এর proxy)',
  'per day': 'প্রতিদিন',
  'ms': 'ms',

  /* ── integration narrative ───────────────────────────── */
  'DeviceMotion': 'DeviceMotion',
  'DeviceOrientation': 'DeviceOrientation',
  'Geolocation (separate layer)': 'Geolocation (আলাদা স্তর)',
  'Simulation (always available)': 'সিমুলেশন (সবসময় পাওয়া যায়)',
  'Replay (recorded session)': 'রিপ্লে (রেকর্ড করা session)',
  'File or manual ingestion': 'ফাইল বা হাতে ingest',
  'Local bridge over WebSocket': 'WebSocket-এ লোকাল bridge',
  'Any crew tablet or phone': 'ক্রু-র যেকোনো ট্যাব বা ফোন',
  'Browser-native sensors': 'ব্রাউজারের নিজস্ব সেন্সর',
  'Instrument or device produces a signal': 'যন্ত্র বা ডিভাইস সংকেত দেয়',
  'Body-worn IMU (chest / head)': 'শরীরে পরা IMU (বুক / মাথা)',
  'Force plate / computerized dynamic posturography': 'force plate / কম্পিউটারাইজড dynamic posturography',
  'Video head-impulse goggles (vHIT)': 'video head-impulse goggles (vHIT)',
  'Functional Task Test battery': 'Functional Task Test ব্যাটারি',
  'Motion-sickness questionnaire': 'motion-sickness প্রশ্নমালা',
  'Computed in-app from captured sessions.': 'অ্যাপের ভেতরেই, capture করা session থেকে হিসাব করা।',
  'Stored sessions, ground analysis, rehearsal': 'সংরক্ষিত session, পরে বিশ্লেষণ, রিহার্সাল',
  'Mapped into the v1 contract, one value per domain': 'v1 contract-এ ম্যাপ করা, প্রতি domain-এ একটা মান',
  'OSI with a bootstrap interval and an MDC floor': 'bootstrap interval আর MDC floor সহ OSI',
  'Ranked countermeasure, pre-authorized where needed': 'ক্রম অনুযায়ী countermeasure, দরকারে আগেই অনুমোদিত',
  'Level, authority and the comm-delay rule applied': 'স্তর, authority আর comm-delay নিয়ম প্রয়োগ করা',
  'Delta against the noise floor — or it is not reported': 'noise floor-এর সাপেক্ষে পার্থক্য — নইলে কিছু বলা হয় না',
  'Paste a JSON payload below, or capture from the live channels. This is the same contract the bridge would emit.':
    'নিচে একটা JSON payload পেস্ট করো, বা live channel থেকে capture করো। bridge যে contract দিত, এটা সেটাই।',
  'Native SDK export → CSV/JSON on the tablet → ingested over the contract below.':
    'যন্ত্রের SDK থেকে CSV/JSON → নিচের contract দিয়ে ingest।',
  'The subjective instrument NASA uses alongside the measured domains, during and after G-transitions.':
    'মাপা domain-গুলোর পাশে NASA যে ব্যক্তিনিষ্ঠ প্রশ্নমালা ব্যবহার করে — G-transition-এর সময় ও পরে।',
  'Centre-of-pressure time series across the six sensory conditions. This is where NASA records its largest post-flight decrements.':
    'ছয়টা sensory condition-এ centre-of-pressure-এর সময়-সিরিজ। ফ্লাইটের পরে সবচেয়ে বড় পতন NASA এখানেই দেখে।',
  'Angular rate and linear acceleration. NASA uses body-worn inertial sensors and a head-mounted motion sensor for dynamic head-tilt assessment.':
    'angular rate আর linear acceleration। গতিশীল head-tilt মাপতে NASA শরীরে পরা inertial sensor আর মাথায় motion sensor ব্যবহার করে।',
  'A high-frame-rate camera in goggles measures eye movement against imposed head impulses and returns VOR gain per canal. NASA runs exactly this in the CIPHER Neuro-Vestibular Examination during and after flight.':
    'চশমায় লাগানো উচ্চ-ফ্রেমরেট ক্যামেরা imposed head impulse-এর বিপরীতে চোখের নড়াচড়া মেপে প্রতি canal-এর VOR gain বের করে। NASA ফ্লাইটের সময় ও পরে CIPHER Neuro-Vestibular Examination-এ ঠিক এটাই করে।',
  'A small process on the tablet reads the instrument (serial / USB / BLE / vendor SDK), maps it into the ingest contract, and pushes it over ws://localhost. The page subscribes and the index updates.':
    'ট্যাবে একটা ছোট প্রসেস যন্ত্রটা পড়ে (serial / USB / BLE / vendor SDK), ingest contract-এ ম্যাপ করে ws://localhost দিয়ে পাঠায়; পেজ subscribe করে আর ইনডেক্স আপডেট হয়।',
  'Serial or USB at 100 Hz → local bridge process → WebSocket → browser.':
    'serial বা USB ১০০ Hz → লোকাল bridge প্রসেস → WebSocket → ব্রাউজার।',
  'Bluetooth LE → Web Bluetooth, or a bridge process over WebSocket.':
    'Bluetooth LE → Web Bluetooth, বা WebSocket-এ একটা bridge।',
  'Needs the bridge running. The bridge is deliberately not included, because every instrument speaks a different dialect.':
    'bridge চালু থাকা দরকার। bridge ইচ্ছে করেই দেওয়া হয়নি — কারণ প্রতিটা যন্ত্র আলাদা ভাষায় কথা বলে।',
  'Tablet app timings, or manual entry, over the same contract.':
    'ট্যাব অ্যাপের টাইমিং, বা হাতে লেখা — একই contract দিয়ে।',
  'Relative orientation only, and Chrome requires a tap before the first event. Not a substitute for an IMU.':
    'শুধু আপেক্ষিক orientation, আর Chrome-এ প্রথম ইভেন্টের আগে ট্যাপ লাগে। IMU-র বিকল্প নয়।',
  'DeviceOrientation and DeviceMotion after an explicit permission prompt. Works today, no extra hardware.':
    'স্পষ্ট অনুমতির পর DeviceOrientation আর DeviceMotion। আজই কাজ করে, বাড়তি হার্ডওয়্যার লাগে না।',
  'Protocol PA-1, seated, 5 min rest before capture.': 'প্রোটোকল PA-1: বসে, capture-এর আগে ৫ মিনিট বিশ্রাম।',
  'Force plate, IMU, vHIT goggles, any lab instrument': 'force plate, IMU, vHIT goggles — যেকোনো ল্যাব যন্ত্র',
  'Not real time by definition.': 'সংজ্ঞা অনুযায়ী এটা real-time নয়।',

  /* ── console panel ───────────────────────────────────── */
  'BASELINE SESSION CAPTURED': 'baseline session সংরক্ষিত',
  'CI is a bootstrap interval over the baseline window.': 'CI হলো baseline উইন্ডোর ওপর একটা bootstrap interval।',
  'CONCLUSION SENSITIVE': 'সিদ্ধান্ত সংবেদনশীল',
  'CONCLUSION STABLE': 'সিদ্ধান্ত স্থির',
  'COUNTERMEASURE STARTED': 'countermeasure শুরু',
  'Change in baseline centre over days': 'কয়েক দিনে baseline-এর কেন্দ্র কতটা সরল',
  'Changes smaller than MDC95 are not reported as real.': 'MDC95-এর চেয়ে ছোট পরিবর্তনকে আমরা আসল বলি না।',
  'Crew self-report, entered here': 'ক্রু-র নিজের বলা, এখানে ঢোকানো',
  'DOWNLOAD JSON': 'JSON নামাও',
  'DeviceMotion stream (live sensor)': 'DeviceMotion স্ট্রিম (live sensor)',
  'DeviceOrientation stream (live sensor)': 'DeviceOrientation স্ট্রিম (live sensor)',
  'It is wide because the baseline window is still thin — more sessions will narrow it.':
    'এটা চওড়া কারণ baseline উইন্ডো এখনো পাতলা — আরও session নিলে সংকুচিত হবে।',
  'Lab test 04 reaction time, measured this session': 'ল্যাব টেস্ট ০৪ reaction time, এই session-এ মাপা',
  'Mars surface EVA': 'মঙ্গলপৃষ্ঠে EVA',
  'NOT ENOUGH SIGNAL': 'যথেষ্ট সংকেত নেই',
  'ONE-WAY LIGHT TIME': 'একমুখী আলোর সময়',
  'RECORD EXPORTED': 'রেকর্ড নামানো হয়েছে',
  'RUN RECHECK NOW': 'এখনই আবার মাপো',
  'RUNNING — RECHECK WHEN DONE': 'চলছে — শেষ হলে আবার মাপো',
  'Simulator stream — generated on this device, not a measurement': 'simulator স্ট্রিম — এই ডিভাইসেই বানানো, এটা মাপ নয়',
  'The JSON contract was written to your downloads folder.': 'JSON contract তোমার downloads ফোল্ডারে লেখা হয়েছে।',
  'The reference is ready.': 'রেফারেন্স তৈরি।',
  'Three or more are needed before the index is stable.': 'ইনডেক্স স্থির হতে অন্তত তিনটা দরকার।',
  'WEIGHT SENSITIVITY ±20%': 'ওজনের সংবেদনশীলতা ±২০%',
  'at your own baseline': 'তোমার নিজের baseline-এ',
  'no live channel — the index renormalises without it': 'কোনো live channel নেই — ইনডেক্স ওটা ছাড়াই ওজন ভাগ করে নেয়',
  'no signal': 'সংকেত নেই',
  'unavailable — camera measures head motion, not gaze': 'পাওয়া যাচ্ছে না — ক্যামেরা মাথার motion মাপে, gaze নয়',
  'unavailable — first and last session must both carry this channel': 'পাওয়া যাচ্ছে না — প্রথম ও শেষ session দুটোতেই এই channel থাকতে হবে',
  'unavailable — needs eye-landmark or vHIT input': 'পাওয়া যাচ্ছে না — eye-landmark বা vHIT ইনপুট দরকার',
  'At least two channels must be live before a session can be captured. Start the simulator or connect a sensor.':
    'session capture করতে অন্তত দুটো channel live থাকতে হবে। simulator চালাও বা একটা সেন্সর জোড়াও।',
  'run the sensor simulator from section 06, or connect the camera in section 10, then press CAPTURE BASELINE SESSION. Each click stores one session and the counter above moves.':
    'সেকশন ০৬-এর sensor simulator চালাও, বা সেকশন ১০-এ ক্যামেরা জোড়াও, তারপর CAPTURE BASELINE SESSION চাপো। প্রতি চাপে একটা session জমা হয় আর উপরের কাউন্টার বাড়ে।',
  'camera (calibrated)': 'ক্যামেরা (calibrated)',
  'camera (uncalibrated)': 'ক্যামেরা (uncalibrated)',
  'CameraProvider head-motion estimator, noise floor calibrated': 'CameraProvider head-motion estimator, noise floor calibrated',
  'CameraProvider head-motion estimator, noise floor not yet measured': 'CameraProvider head-motion estimator, noise floor এখনো মাপা হয়নি',
  'Simulator stream': 'simulator স্ট্রিম',

  /* ── console section ───────────────────────────────────
     The lower half of the page, which a browser check reported as still
     English. These live in src/ui/console.js, in the same file as the panel
     rows above — the earlier pass simply had not covered them.   */
  'Session controls': 'session কন্ট্রোল',
  'ORIENTATION STABILITY INDEX': 'অরিয়েন্টেশন স্ট্যাবিলিটি ইনডেক্স',
  'ORIENTATION STABILITY INDEX · PROPOSED METRIC': 'অরিয়েন্টেশন স্ট্যাবিলিটি ইনডেক্স · প্রস্তাবিত মেট্রিক',
  'DOMAIN BREAKDOWN': 'ডোমেইন ভাগ করে',
  'WHY THIS?': 'কেন এমন?',
  'READINESS ADVISORY · ROUTINE MONITORING': 'রেডিনেস পরামর্শ · রুটিন মনিটরিং',
  'CREW AUTHORITY MATRIX': 'ক্রু authority ম্যাট্রিক্স',
  'ACTION CENTER': 'অ্যাকশন সেন্টার',
  'RECHECK': 'আবার মাপা',
  'TRACEABILITY': 'ট্রেসেবিলিটি',
  'DOMAIN': 'ডোমেইন',
  'NASA DAG NODE': 'NASA DAG নোড',
  'TIME CONSTANT': 'টাইম কনস্ট্যান্ট',
  'RECORD + CREW BURDEN': 'রেকর্ড + ক্রু-র পরিশ্রম',
  'LEVEL': 'স্তর',
  'WHO ACTS': 'কে ব্যবস্থা নেয়',
  'RULE': 'নিয়ম',
  'EFFECT OF DELAY': 'দেরির প্রভাব',
  'NASA MEASUREMENT': 'NASA-র মাপ',
  'UNAVAILABLE': 'পাওয়া যাচ্ছে না',
  'PROVISIONAL': 'সাময়িক',
  'MICROGRAVITY': 'মাইক্রোগ্রাভিটি',
  'CAPTURE AS BASELINE': 'baseline হিসেবে নাও',
  'No index available yet': 'এখনো কোনো ইনডেক্স নেই',
  'Did it actually work?': 'আসলেই কি কাজ করল?',
  'What to do next': 'এরপর কী করবে',
  'Where the number comes from': 'সংখ্যাটা কোথা থেকে এল',
  'How to get a reading: ': 'রিডিং পেতে হলে: ',
  'Who decides, given the light-time delay': 'আলোর দেরি মাথায় রেখে কে সিদ্ধান্ত নেয়',
  'The handoff packet a flight surgeon would receive': 'flight surgeon যে handoff প্যাকেট পাবেন',
  'The plain-language explanation': 'সোজা ভাষার ব্যাখ্যা',
  "Crew status, against this person's own reference": 'ক্রু-র অবস্থা — তার নিজের রেফারেন্সের সাপেক্ষে',
  'Every domain maps to a NASA Sensorimotor Risk DAG node': 'প্রতিটা domain একটা NASA Sensorimotor Risk DAG নোডে ম্যাপ করা',
  'Channels with no live source are stored as null, never as zero, so the reference never contains a fabricated value.':
    'যে channel-এর live source নেই সেটা null হিসেবে জমা হয়, শূন্য হিসেবে নয় — তাই রেফারেন্সে কখনো বানানো মান ঢোকে না।',
  "Not a NASA metric and not a diagnosis. The domain structure is mapped from NASA's published Sensorimotor Risk DAG; the weights are declared heuristics.":
    'এটা NASA-র মেট্রিক নয়, রোগনির্ণয়ও নয়। domain structure NASA-র প্রকাশিত Sensorimotor Risk DAG থেকে ম্যাপ করা; ওজনগুলো ঘোষিত heuristic।',
  "Time constants and measured values are from NASA's Sensorimotor Evidence Report. They drive the synthetic trajectory, which is why the simulation can be described as calibrated rather than invented.":
    'টাইম কনস্ট্যান্ট আর মাপা মান NASA-র Sensorimotor Evidence Report থেকে। এগুলোই synthetic trajectory চালায় — সেজন্যই simulation-টা বানানো নয়, calibrated বলা যায়।',
  'Ranked against the domains that are actually out of range. Every countermeasure ends in a recheck, because an intervention without a verification step is just an activity.':
    'যে domain-গুলো সত্যিই সীমার বাইরে, তাদের সাপেক্ষে সাজানো। প্রতিটা countermeasure শেষ হয় একটা recheck-এ — কারণ যাচাই ছাড়া কোনো হস্তক্ষেপ শুধুই একটা কাজ।',
  'Nothing triggered. No domain is far enough from baseline to warrant a countermeasure.':
    'কিছুই ট্রিগার হয়নি। কোনো domain baseline থেকে এতটা দূরে নয় যে countermeasure দরকার।',
  'No domain is outside its usual range.': 'কোনো domain নিজের স্বাভাবিক সীমার বাইরে নেই।',
  'Software does not ground a crew member. This is an advisory and an escalation path; the flight surgeon holds the authority.':
    'সফটওয়্যার কোনো ক্রু-কে আটকায় না। এটা একটা পরামর্শ আর একটা escalation পথ; authority flight surgeon-এর হাতে।',
  'Start a countermeasure and a recheck will appear here.': 'countermeasure শুরু করো — recheck এখানে এসে যাবে।',
  'Mars one-way light time runs from about 3 to 22 minutes. Beyond roughly 6 minutes round trip you cannot wait for an answer, so the crew acts under standing authority and the review happens afterwards.':
    'মঙ্গলে একমুখী আলোর সময় প্রায় ৩ থেকে ২২ মিনিট। round trip ৬ মিনিটের বেশি হলে উত্তরের জন্য অপেক্ষা করা যায় না — তাই ক্রু নিজেই standing authority-তে কাজ করে, পর্যালোচনা হয় পরে।',
  'Structured, bandwidth-cheap and delay-tolerant, because on a Mars transit you cannot stream video to a doctor and wait.':
    'সাজানো, কম ব্যান্ডউইথে চলে, আর দেরি সয় — কারণ মঙ্গলযাত্রায় ডাক্তারকে ভিডিও স্ট্রিম করে অপেক্ষা করা যায় না।',

  /* ── camera panel chrome (headings and captions) ─────── */
  'CAMERA PIPELINE': 'ক্যামেরা পাইপলাইন',
  'Face scan — head pose and head motion from the front camera':
    'ফেস স্ক্যান — সামনের ক্যামেরা থেকে head pose আর মাথার motion',
  'Runs entirely on this device. No frame is uploaded, ever. The scan searches face-shaped windows on colour, contrast, dark features and motion, locks onto the best one, and reports a coarse head pose against your own calibrated neutral. Head motion is measured separately, by block-matching consecutive frames. It does not measure gaze and it uses no facial landmarks.':
    'সবটাই তোমার ডিভাইসেই চলে। একটা ফ্রেমও কোথাও আপলোড হয় না। স্ক্যানটা colour, contrast, অন্ধকার ফিচার আর motion — এই চারটে চ্যানেলে মুখের-আকৃতির window খোঁজে, সবচেয়ে ভালোটার ওপর লক বসায়, আর তোমার নিজের calibrate করা neutral-এর সাপেক্ষে মোটা একটা head pose জানায়। মাথার motion আলাদাভাবে মাপা হয়, পরপর ফ্রেম মিলিয়ে। এটা gaze মাপে না, আর কোনো facial landmark ব্যবহার করে না।',
  'How the face scan works: each frame is searched for face-shaped windows on four channels — colour, contrast, dark features such as eyes, brows and beard, and frame-to-frame motion — weighted by shape, position, brightness and size. Nothing is fetched and no model file ships, so the offline guarantee holds. The winning window seeds a fit by image moments, which is what gives the lock its centre and spread.':
    'ফেস স্ক্যান কীভাবে কাজ করে: প্রতি ফ্রেমে চারটে চ্যানেলে মুখের-আকৃতির window খোঁজা হয় — colour, contrast, অন্ধকার ফিচার (চোখ, ভুরু, দাড়ি) আর পরপর ফ্রেমের motion — সাথে আকৃতি, অবস্থান, উজ্জ্বলতা ও আকারের ওজন। কিছুই ডাউনলোড হয় না, কোনো মডেল ফাইলও পাঠানো হয় না, তাই অফলাইন গ্যারান্টি অটুট। জেতা window থেকে image moments দিয়ে ফিট বের করা হয় — সেটাই লকের কেন্দ্র ও বিস্তার ঠিক করে।',

  /* A no-op entry (same words, different case) is a wasted line, not a
     translation. These three used to be exactly that. */
  'SECURE CONTEXT': 'নিরাপদ কনটেক্সট (secure context)',
  'NEUTRAL': 'neutral (বেসলাইন)',
  'POSE': 'head pose',
  'STATUS': 'স্টেটাস',
  'GRANTED': 'দেওয়া হয়েছে',
  'YES': 'হ্যাঁ',
  'NO': 'না',
};
