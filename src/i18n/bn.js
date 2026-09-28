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
};
