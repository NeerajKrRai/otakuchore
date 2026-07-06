/* ═══════════════════════════════════════════════════════════
   CTAvatar — self-contained kawaii avatar creator
   ---------------------------------------------------------------
   Ported verbatim (SVG artwork + part arrays) from OtakuChore's
   inline avatar module, rewired to a small public interface with
   NO dependency on any outside global (no currentUser, no app
   state). All state is module-local.

   Public interface (see bottom):
     window.CTAvatar = {
       defaultCfg(),
       randomCfg(),
       svg(cfg),        // -> "data:image/svg+xml;base64,..."
       render(containerEl, cfg, opts)
     }

   Inline onclick handlers in the emitted markup reach this
   module through namespaced globals: window.__ctAvSet,
   window.__ctAvSave, window.__ctAvRandom. These are internal
   plumbing, not part of the public API.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── Default config ──
  var AV_DEF = {
    face: 0, skin: '#f5c5a0', eye: 0, eyeColor: '#3b2f2f', brow: 0,
    mouth: 0, mouthColor: '#e05080',
    hair: 0, hairColor: '#3b2f2f',
    outfit: 0, outfitA: '#7c3aed', outfitB: '#c084fc',
    acc: 0, accColor: '#f472b6',
    bg: 0, bgA: '#1a0038', bgB: '#2a0060',
    blush: true, freckles: false,
    pose: 0
  };

  // ── Color palettes ──
  var SKINS   = ['#fde8d0', '#f5c5a0', '#e8a87c', '#c68642', '#8d5524', '#5c3317', '#4a2512'];
  var HAIRS   = ['#0a0500', '#3d1f00', '#6b3a1f', '#c07820', '#e8d44d', '#e83a5e', '#9b4dca', '#4dabf7', '#34d399', '#f87171', '#ffffff', '#ff8c00'];
  var EYES_C  = ['#1a0a00', '#1a3a6b', '#1a5c2e', '#6b1a6b', '#c07820', '#e83a5e', '#4dabf7', '#8b0000'];
  var OUTFIT_C = ['#7c3aed', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#ffffff', '#1a0038', '#ff8c00', '#2d6a4f'];
  var ACC_C   = ['#f472b6', '#fbbf24', '#34d399', '#60a5fa', '#f87171', '#c084fc', '#ffffff', '#ff8c00'];
  var BGS     = ['#1a0038', '#0d2040', '#1a3020', '#2d1a00', '#0d0020', '#000000', '#1a1a2e', '#2c003e'];

  // ── SVG builders (verbatim from source — do not reindent) ──
function col(hex,amount){ // lighten/darken
  const n=parseInt(hex.slice(1),16);
  const r=Math.min(255,Math.max(0,((n>>16)&0xff)+amount));
  const g=Math.min(255,Math.max(0,((n>>8)&0xff)+amount));
  const b=Math.min(255,Math.max(0,(n&0xff)+amount));
  return`#${((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)}`;
}

function avSVG(c){
  const sk=c.skin, hr=c.hairColor, ey=c.eyeColor, oc=c.outfitA, oc2=c.outfitB, ac=c.accColor;
  const ol='#1a0020'; // outline color
  const sk2=col(sk,-30); // shadow skin tone

  // FACE SHAPES
  const faces=[
    `<ellipse cx="100" cy="108" rx="52" ry="60" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
    `<circle cx="100" cy="110" r="56" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
    `<rect x="46" y="52" width="108" height="116" rx="22" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
    `<path d="M100,168 C80,155 46,138 46,100 C46,64 70,50 100,58 C130,50 154,64 154,100 C154,138 120,155 100,168Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
    `<ellipse cx="100" cy="108" rx="48" ry="66" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
  ];

  // HAIR BACKS
  const hairBacks=[
    // 0 short
    `<ellipse cx="100" cy="72" rx="54" ry="36" fill="${hr}"/><rect x="46" y="70" width="108" height="20" fill="${hr}"/>`,
    // 1 long straight
    `<rect x="40" y="68" width="22" height="120" rx="11" fill="${hr}"/><rect x="138" y="68" width="22" height="120" rx="11" fill="${hr}"/><ellipse cx="100" cy="72" rx="56" ry="38" fill="${hr}"/>`,
    // 2 pigtails
    `<ellipse cx="100" cy="72" rx="56" ry="38" fill="${hr}"/><ellipse cx="34" cy="130" rx="18" ry="40" fill="${hr}" stroke="${ol}" stroke-width="1"/><ellipse cx="166" cy="130" rx="18" ry="40" fill="${hr}" stroke="${ol}" stroke-width="1"/>`,
    // 3 bun
    `<ellipse cx="100" cy="72" rx="56" ry="38" fill="${hr}"/><circle cx="100" cy="44" r="26" fill="${hr}" stroke="${ol}" stroke-width="1"/>`,
    // 4 spiky
    `<path d="M52,90 L44,44 L64,76 L72,40 L88,72 L100,36 L112,72 L128,40 L136,76 L156,44 L148,90Z" fill="${hr}"/><ellipse cx="100" cy="82" rx="56" ry="24" fill="${hr}"/>`,
    // 5 wavy long
    `<path d="M42,80 Q30,130 38,180 Q46,210 42,240 L62,240 Q58,210 62,180 Q68,140 52,90Z" fill="${hr}"/><path d="M158,80 Q170,130 162,180 Q154,210 158,240 L138,240 Q142,210 138,180 Q132,140 148,90Z" fill="${hr}"/><ellipse cx="100" cy="72" rx="56" ry="38" fill="${hr}"/>`,
    // 6 bob
    `<path d="M44,90 Q40,140 50,155 Q75,168 100,168 Q125,168 150,155 Q160,140 156,90Z" fill="${hr}"/><ellipse cx="100" cy="72" rx="56" ry="38" fill="${hr}"/>`,
    // 7 braids
    `<rect x="38" y="70" width="16" height="150" rx="8" fill="${hr}"/><rect x="146" y="70" width="16" height="150" rx="8" fill="${hr}"/><line x1="46" y1="90" x2="46" y2="220" stroke="${col(hr,-20)}" stroke-width="3" stroke-dasharray="8,6"/><line x1="154" y1="90" x2="154" y2="220" stroke="${col(hr,-20)}" stroke-width="3" stroke-dasharray="8,6"/><ellipse cx="100" cy="72" rx="56" ry="38" fill="${hr}"/>`,
  ];

  // OUTFITS (body below neck)
  const neckY=168, bodyTop=185;
  const outfits=[
    // 0 casual tee
    `<path d="M60,${bodyTop} Q50,${bodyTop-10} 30,${bodyTop} L30,280 L170,280 L170,${bodyTop} Q150,${bodyTop-10} 140,${bodyTop} L130,${bodyTop-15} L100,${bodyTop-5} L70,${bodyTop-15}Z" fill="${oc}" stroke="${ol}" stroke-width="1.5"/><path d="M70,${bodyTop-15} Q80,${bodyTop+20} 80,280" fill="none" stroke="${col(oc,-20)}" stroke-width="1"/><path d="M130,${bodyTop-15} Q120,${bodyTop+20} 120,280" fill="none" stroke="${col(oc,-20)}" stroke-width="1"/>`,
    // 1 school uniform
    `<path d="M60,${bodyTop} Q50,${bodyTop-10} 30,${bodyTop} L30,280 L170,280 L170,${bodyTop} Q150,${bodyTop-10} 140,${bodyTop} L130,${bodyTop-15} L100,${bodyTop-5} L70,${bodyTop-15}Z" fill="${oc}" stroke="${ol}" stroke-width="1.5"/><rect x="88" y="${bodyTop}" width="24" height="90" fill="${oc2}"/><polygon points="88,${bodyTop} 100,${bodyTop+30} 112,${bodyTop}" fill="${ac}"/><rect x="30" y="${bodyTop+100}" width="140" height="180" fill="${oc2}" stroke="${ol}" stroke-width="1"/>`,
    // 2 hoodie
    `<path d="M60,${bodyTop} Q50,${bodyTop-10} 26,${bodyTop} L26,280 L174,280 L174,${bodyTop} Q150,${bodyTop-10} 140,${bodyTop} L130,${bodyTop-15} L100,${bodyTop-5} L70,${bodyTop-15}Z" fill="${oc}" stroke="${ol}" stroke-width="1.5"/><ellipse cx="100" cy="${bodyTop+5}" rx="18" ry="14" fill="${col(oc,-15)}" stroke="${ol}" stroke-width="1"/><rect x="85" y="${bodyTop+19}" width="30" height="50" rx="4" fill="${col(oc,-20)}"/>`,
    // 3 ninja
    `<path d="M60,${bodyTop} Q50,${bodyTop-10} 26,${bodyTop} L26,280 L174,280 L174,${bodyTop} Q150,${bodyTop-10} 140,${bodyTop} L130,${bodyTop-15} L100,${bodyTop-5} L70,${bodyTop-15}Z" fill="${oc}" stroke="${ol}" stroke-width="1.5"/><rect x="82" y="${bodyTop-8}" width="36" height="12" rx="4" fill="${oc2}"/><line x1="30" y1="${bodyTop+50}" x2="170" y2="${bodyTop+50}" stroke="${oc2}" stroke-width="3"/><line x1="30" y1="${bodyTop+80}" x2="170" y2="${bodyTop+80}" stroke="${oc2}" stroke-width="3"/>`,
    // 4 magical girl
    `<path d="M60,${bodyTop} Q50,${bodyTop-8} 30,${bodyTop} L30,${bodyTop+60} Q100,${bodyTop+80} 170,${bodyTop+60} L170,${bodyTop} Q150,${bodyTop-8} 140,${bodyTop} L130,${bodyTop-15} L100,${bodyTop-5} L70,${bodyTop-15}Z" fill="${oc}" stroke="${ol}" stroke-width="1.5"/>
     <path d="M30,${bodyTop+55} Q100,${bodyTop+90} 170,${bodyTop+55} L180,280 L20,280Z" fill="${oc2}" stroke="${ol}" stroke-width="1"/>
     <path d="M30,${bodyTop+55} Q100,${bodyTop+75} 170,${bodyTop+55}" fill="none" stroke="${ac}" stroke-width="3"/>`,
    // 5 sporty
    `<path d="M60,${bodyTop} Q50,${bodyTop-10} 28,${bodyTop} L28,${bodyTop+70} L172,${bodyTop+70} L172,${bodyTop} Q150,${bodyTop-10} 140,${bodyTop} L130,${bodyTop-15} L100,${bodyTop-5} L70,${bodyTop-15}Z" fill="${oc}" stroke="${ol}" stroke-width="1.5"/><rect x="28" y="${bodyTop+70}" width="144" height="160" fill="${oc2}" stroke="${ol}" stroke-width="1"/><line x1="28" y1="${bodyTop+30}" x2="72" y2="${bodyTop+30}" stroke="${oc2}" stroke-width="4"/><line x1="128" y1="${bodyTop+30}" x2="172" y2="${bodyTop+30}" stroke="${oc2}" stroke-width="4"/>`,
    // 6 kimono
    `<path d="M55,${bodyTop} Q40,${bodyTop-5} 26,${bodyTop+10} L26,280 L174,280 L174,${bodyTop+10} Q160,${bodyTop-5} 145,${bodyTop} L130,${bodyTop-15} L100,${bodyTop-5} L70,${bodyTop-15}Z" fill="${oc}" stroke="${ol}" stroke-width="1.5"/>
     <path d="M100,${bodyTop-5} L80,${bodyTop+60} L100,${bodyTop+55} L120,${bodyTop+60}Z" fill="${oc2}"/>
     <line x1="26" y1="${bodyTop+100}" x2="174" y2="${bodyTop+100}" stroke="${oc2}" stroke-width="6"/>`,
    // 7 knight
    `<path d="M58,${bodyTop} Q46,${bodyTop-12} 28,${bodyTop} L28,280 L172,280 L172,${bodyTop} Q154,${bodyTop-12} 142,${bodyTop} L132,${bodyTop-16} L100,${bodyTop-6} L68,${bodyTop-16}Z" fill="${oc}" stroke="${ol}" stroke-width="2"/>
     <line x1="28" y1="${bodyTop+40}" x2="172" y2="${bodyTop+40}" stroke="${col(oc,30)}" stroke-width="3"/>
     <line x1="28" y1="${bodyTop+80}" x2="172" y2="${bodyTop+80}" stroke="${col(oc,30)}" stroke-width="3"/>
     <circle cx="100" cy="${bodyTop+20}" r="10" fill="${oc2}" stroke="${ol}" stroke-width="1.5"/>`,
  ];

  // POSES (arm variants appended)
  const poses=[
    // 0 standing - no extra arms
    ``,
    // 1 arms up
    `<path d="M30,${bodyTop} Q10,${bodyTop-30} 14,${bodyTop-60} Q18,${bodyTop-65} 26,${bodyTop-50} Q22,${bodyTop-20} 34,${bodyTop+5}Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>
     <path d="M170,${bodyTop} Q190,${bodyTop-30} 186,${bodyTop-60} Q182,${bodyTop-65} 174,${bodyTop-50} Q178,${bodyTop-20} 166,${bodyTop+5}Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
    // 2 peace sign (right arm up)
    `<path d="M170,${bodyTop} Q188,${bodyTop-20} 182,${bodyTop-55} Q178,${bodyTop-62} 172,${bodyTop-50} Q176,${bodyTop-18} 166,${bodyTop+4}Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>
     <line x1="178" y1="${bodyTop-48}" x2="186" y2="${bodyTop-38}" stroke="${sk}" stroke-width="8" stroke-linecap="round"/>
     <line x1="182" y1="${bodyTop-52}" x2="190" y2="${bodyTop-44}" stroke="${sk}" stroke-width="8" stroke-linecap="round"/>`,
    // 3 waving
    `<path d="M170,${bodyTop+10} Q195,${bodyTop-10} 188,${bodyTop-40} Q184,${bodyTop-50} 174,${bodyTop-40} Q180,${bodyTop-16} 168,${bodyTop+14}Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
    // 4 thumbs up
    `<path d="M168,${bodyTop+30} Q190,${bodyTop+30} 190,${bodyTop+50} Q190,${bodyTop+70} 168,${bodyTop+70}Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>
     <rect x="162" y="${bodyTop+10}" width="16" height="14" rx="5" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
    // 5 crossed arms
    `<path d="M28,${bodyTop+10} Q28,${bodyTop+60} 80,${bodyTop+65} Q100,${bodyTop+65} 100,${bodyTop+55} Q60,${bodyTop+50} 46,${bodyTop+14}Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>
     <path d="M172,${bodyTop+10} Q172,${bodyTop+60} 120,${bodyTop+65} Q100,${bodyTop+65} 100,${bodyTop+55} Q140,${bodyTop+50} 154,${bodyTop+14}Z" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>`,
  ];

  // EYES
  const eyeW=18, eyeH=c.eye===4?4:c.eye===5?20:14;
  const eyeLX=74, eyeRX=126, eyeY=104;
  const eyeStyles=[
    // 0 big anime
    `<ellipse cx="${eyeLX}" cy="${eyeY}" rx="${eyeW}" ry="15" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <ellipse cx="${eyeRX}" cy="${eyeY}" rx="${eyeW}" ry="15" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <ellipse cx="${eyeLX}" cy="${eyeY+2}" rx="11" ry="12" fill="${ey}"/>
     <ellipse cx="${eyeRX}" cy="${eyeY+2}" rx="11" ry="12" fill="${ey}"/>
     <ellipse cx="${eyeLX}" cy="${eyeY+2}" rx="6" ry="7" fill="${col(ey,-30)}"/>
     <ellipse cx="${eyeRX}" cy="${eyeY+2}" rx="6" ry="7" fill="${col(ey,-30)}"/>
     <circle cx="${eyeLX+6}" cy="${eyeY-4}" r="4" fill="white"/><circle cx="${eyeRX+6}" cy="${eyeY-4}" r="4" fill="white"/>
     <circle cx="${eyeLX-5}" cy="${eyeY+4}" r="2" fill="white"/><circle cx="${eyeRX-5}" cy="${eyeY+4}" r="2" fill="white"/>`,
    // 1 round cute
    `<circle cx="${eyeLX}" cy="${eyeY}" r="15" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <circle cx="${eyeRX}" cy="${eyeY}" r="15" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <circle cx="${eyeLX}" cy="${eyeY+1}" r="10" fill="${ey}"/>
     <circle cx="${eyeRX}" cy="${eyeY+1}" r="10" fill="${ey}"/>
     <circle cx="${eyeLX}" cy="${eyeY+1}" r="5" fill="${col(ey,-30)}"/>
     <circle cx="${eyeRX}" cy="${eyeY+1}" r="5" fill="${col(ey,-30)}"/>
     <circle cx="${eyeLX+5}" cy="${eyeY-4}" r="4" fill="white"/><circle cx="${eyeRX+5}" cy="${eyeY-4}" r="4" fill="white"/>`,
    // 2 cat/sharp
    `<path d="M${eyeLX-17},${eyeY+6} Q${eyeLX},${eyeY-14} ${eyeLX+17},${eyeY+6} Q${eyeLX},${eyeY+8} ${eyeLX-17},${eyeY+6}Z" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <path d="M${eyeRX-17},${eyeY+6} Q${eyeRX},${eyeY-14} ${eyeRX+17},${eyeY+6} Q${eyeRX},${eyeY+8} ${eyeRX-17},${eyeY+6}Z" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <ellipse cx="${eyeLX}" cy="${eyeY+1}" rx="5" ry="10" fill="${ey}"/>
     <ellipse cx="${eyeRX}" cy="${eyeY+1}" rx="5" ry="10" fill="${ey}"/>
     <circle cx="${eyeLX+6}" cy="${eyeY-3}" r="3" fill="white"/><circle cx="${eyeRX+6}" cy="${eyeY-3}" r="3" fill="white"/>`,
    // 3 star eyes
    `<ellipse cx="${eyeLX}" cy="${eyeY}" rx="${eyeW}" ry="15" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <ellipse cx="${eyeRX}" cy="${eyeY}" rx="${eyeW}" ry="15" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <path d="M${eyeLX},${eyeY-9} L${eyeLX+3},${eyeY-2} L${eyeLX+9},${eyeY-2} L${eyeLX+4},${eyeY+2} L${eyeLX+6},${eyeY+9} L${eyeLX},${eyeY+5} L${eyeLX-6},${eyeY+9} L${eyeLX-4},${eyeY+2} L${eyeLX-9},${eyeY-2} L${eyeLX-3},${eyeY-2}Z" fill="${ey}"/>
     <path d="M${eyeRX},${eyeY-9} L${eyeRX+3},${eyeY-2} L${eyeRX+9},${eyeY-2} L${eyeRX+4},${eyeY+2} L${eyeRX+6},${eyeY+9} L${eyeRX},${eyeY+5} L${eyeRX-6},${eyeY+9} L${eyeRX-4},${eyeY+2} L${eyeRX-9},${eyeY-2} L${eyeRX-3},${eyeY-2}Z" fill="${ey}"/>
     <circle cx="${eyeLX+5}" cy="${eyeY-4}" r="3" fill="white"/><circle cx="${eyeRX+5}" cy="${eyeY-4}" r="3" fill="white"/>`,
    // 4 happy closed (arcs)
    `<path d="M${eyeLX-16},${eyeY} Q${eyeLX},${eyeY+16} ${eyeLX+16},${eyeY}" fill="${ey}" stroke="${ol}" stroke-width="2"/>
     <path d="M${eyeRX-16},${eyeY} Q${eyeRX},${eyeY+16} ${eyeRX+16},${eyeY}" fill="${ey}" stroke="${ol}" stroke-width="2"/>`,
    // 5 sparkle eyes
    `<ellipse cx="${eyeLX}" cy="${eyeY}" rx="${eyeW}" ry="16" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <ellipse cx="${eyeRX}" cy="${eyeY}" rx="${eyeW}" ry="16" fill="white" stroke="${ol}" stroke-width="1.5"/>
     <ellipse cx="${eyeLX}" cy="${eyeY+2}" rx="11" ry="12" fill="${ey}"/>
     <ellipse cx="${eyeRX}" cy="${eyeY+2}" rx="11" ry="12" fill="${ey}"/>
     <ellipse cx="${eyeLX}" cy="${eyeY+2}" rx="5" ry="7" fill="${col(ey,-40)}"/>
     <ellipse cx="${eyeRX}" cy="${eyeY+2}" rx="5" ry="7" fill="${col(ey,-40)}"/>
     <circle cx="${eyeLX+7}" cy="${eyeY-5}" r="5" fill="white"/><circle cx="${eyeRX+7}" cy="${eyeY-5}" r="5" fill="white"/>
     <circle cx="${eyeLX-7}" cy="${eyeY+3}" r="3" fill="white"/><circle cx="${eyeRX-7}" cy="${eyeY+3}" r="3" fill="white"/>
     <path d="M${eyeLX-3},${eyeY-12} L${eyeLX},${eyeY-17} L${eyeLX+3},${eyeY-12}" fill="white"/>
     <path d="M${eyeRX-3},${eyeY-12} L${eyeRX},${eyeY-17} L${eyeRX+3},${eyeY-12}" fill="white"/>`,
  ];

  // BROWS
  const brows=[
    `<path d="M${eyeLX-16},${eyeY-20} Q${eyeLX},${eyeY-28} ${eyeLX+16},${eyeY-20}" fill="none" stroke="${hr}" stroke-width="3" stroke-linecap="round"/>
     <path d="M${eyeRX-16},${eyeY-20} Q${eyeRX},${eyeY-28} ${eyeRX+16},${eyeY-20}" fill="none" stroke="${hr}" stroke-width="3" stroke-linecap="round"/>`,
    // angled
    `<line x1="${eyeLX-16}" y1="${eyeY-18}" x2="${eyeLX+16}" y2="${eyeY-26}" stroke="${hr}" stroke-width="3" stroke-linecap="round"/>
     <line x1="${eyeRX-16}" y1="${eyeY-26}" x2="${eyeRX+16}" y2="${eyeY-18}" stroke="${hr}" stroke-width="3" stroke-linecap="round"/>`,
    // thick
    `<path d="M${eyeLX-17},${eyeY-22} Q${eyeLX},${eyeY-32} ${eyeLX+17},${eyeY-22}" fill="none" stroke="${hr}" stroke-width="5" stroke-linecap="round"/>
     <path d="M${eyeRX-17},${eyeY-22} Q${eyeRX},${eyeY-32} ${eyeRX+17},${eyeY-22}" fill="none" stroke="${hr}" stroke-width="5" stroke-linecap="round"/>`,
    // worried
    `<path d="M${eyeLX-16},${eyeY-26} Q${eyeLX},${eyeY-20} ${eyeLX+16},${eyeY-26}" fill="none" stroke="${hr}" stroke-width="3" stroke-linecap="round"/>
     <path d="M${eyeRX-16},${eyeY-26} Q${eyeRX},${eyeY-20} ${eyeRX+16},${eyeY-26}" fill="none" stroke="${hr}" stroke-width="3" stroke-linecap="round"/>`,
  ];

  // MOUTHS
  const mouths=[
    // 0 happy smile
    `<path d="M84,143 Q100,158 116,143" fill="none" stroke="${c.mouthColor}" stroke-width="2.5" stroke-linecap="round"/>`,
    // 1 big grin
    `<path d="M80,142 Q100,162 120,142" fill="${c.mouthColor}" stroke="${ol}" stroke-width="1.5"/>
     <path d="M80,142 Q100,148 120,142" fill="white"/>`,
    // 2 excited/wow
    `<ellipse cx="100" cy="147" rx="14" ry="10" fill="${c.mouthColor}" stroke="${ol}" stroke-width="1.5"/>
     <ellipse cx="100" cy="145" rx="10" ry="5" fill="${col(c.mouthColor,30)}"/>`,
    // 3 sad
    `<path d="M84,152 Q100,140 116,152" fill="none" stroke="${c.mouthColor}" stroke-width="2.5" stroke-linecap="round"/>`,
    // 4 smirk
    `<path d="M88,145 Q104,150 116,143" fill="none" stroke="${c.mouthColor}" stroke-width="2.5" stroke-linecap="round"/>`,
    // 5 tiny shy
    `<path d="M94,146 Q100,150 106,146" fill="none" stroke="${c.mouthColor}" stroke-width="2.5" stroke-linecap="round"/>`,
    // 6 determined
    `<line x1="84" y1="146" x2="116" y2="146" stroke="${c.mouthColor}" stroke-width="2.5" stroke-linecap="round"/>`,
    // 7 surprised O
    `<ellipse cx="100" cy="148" rx="9" ry="11" fill="${c.mouthColor}" stroke="${ol}" stroke-width="1.5"/>`,
  ];

  // ACCESSORIES
  const accessories=[
    ``, // 0 none
    // 1 cat ears
    `<path d="M56,76 L46,42 L72,64Z" fill="${ac}" stroke="${ol}" stroke-width="1.5"/>
     <path d="M144,76 L154,42 L128,64Z" fill="${ac}" stroke="${ol}" stroke-width="1.5"/>
     <path d="M58,74 L50,50 L70,66Z" fill="${col(ac,40)}"/>
     <path d="M142,74 L150,50 L130,66Z" fill="${col(ac,40)}"/>`,
    // 2 bow / flower
    `<path d="M78,56 Q86,44 100,52 Q86,60 78,56Z" fill="${ac}" stroke="${ol}" stroke-width="1"/>
     <path d="M122,56 Q114,44 100,52 Q114,60 122,56Z" fill="${ac}" stroke="${ol}" stroke-width="1"/>
     <circle cx="100" cy="52" r="7" fill="${col(ac,40)}" stroke="${ol}" stroke-width="1"/>`,
    // 3 crown
    `<path d="M66,68 L70,46 L84,60 L100,40 L116,60 L130,46 L134,68Z" fill="${ac}" stroke="${ol}" stroke-width="1.5"/>
     <circle cx="84" cy="60" r="4" fill="white"/><circle cx="100" cy="40" r="5" fill="white"/><circle cx="116" cy="60" r="4" fill="white"/>`,
    // 4 glasses
    `<circle cx="${eyeLX}" cy="${eyeY}" r="18" fill="none" stroke="${ac}" stroke-width="2.5"/>
     <circle cx="${eyeRX}" cy="${eyeY}" r="18" fill="none" stroke="${ac}" stroke-width="2.5"/>
     <line x1="${eyeLX+18}" y1="${eyeY}" x2="${eyeRX-18}" y2="${eyeY}" stroke="${ac}" stroke-width="2.5"/>
     <line x1="${eyeLX-18}" y1="${eyeY}" x2="${eyeLX-28}" y2="${eyeY-4}" stroke="${ac}" stroke-width="2"/>
     <line x1="${eyeRX+18}" y1="${eyeY}" x2="${eyeRX+28}" y2="${eyeY-4}" stroke="${ac}" stroke-width="2"/>`,
    // 5 headband
    `<path d="M46,90 Q100,70 154,90" fill="none" stroke="${ac}" stroke-width="8" stroke-linecap="round"/>
     <circle cx="100" cy="72" r="10" fill="${col(ac,30)}" stroke="${ol}" stroke-width="1"/>`,
    // 6 halo
    `<ellipse cx="100" cy="44" rx="32" ry="8" fill="none" stroke="${ac}" stroke-width="4"/>`,
    // 7 witch hat
    `<path d="M68,78 L100,28 L132,78Z" fill="${ac}" stroke="${ol}" stroke-width="1.5"/>
     <rect x="54" y="76" width="92" height="10" rx="5" fill="${col(ac,20)}" stroke="${ol}" stroke-width="1"/>
     <path d="M88,70 Q100,62 112,70" fill="none" stroke="${col(ac,50)}" stroke-width="2"/>`,
  ];

  // BLUSH
  const blush = c.blush
    ? `<ellipse cx="72" cy="130" rx="14" ry="8" fill="${col(sk2,20)}" opacity="0.55"/>
       <ellipse cx="128" cy="130" rx="14" ry="8" fill="${col(sk2,20)}" opacity="0.55"/>`
    : ``;

  // FRECKLES
  const freckles = c.freckles
    ? `<circle cx="82" cy="128" r="2" fill="${col(sk,-40)}" opacity=".6"/>
       <circle cx="90" cy="132" r="2" fill="${col(sk,-40)}" opacity=".6"/>
       <circle cx="86" cy="134" r="1.5" fill="${col(sk,-40)}" opacity=".6"/>
       <circle cx="118" cy="128" r="2" fill="${col(sk,-40)}" opacity=".6"/>
       <circle cx="110" cy="132" r="2" fill="${col(sk,-40)}" opacity=".6"/>
       <circle cx="114" cy="134" r="1.5" fill="${col(sk,-40)}" opacity=".6"/>`
    : ``;

  // NOSE
  const nose=`<path d="M97,122 Q100,128 103,122" fill="none" stroke="${col(sk,-35)}" stroke-width="1.5" stroke-linecap="round"/>`;

  // BG
  const bg=`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c.bgA}"/><stop offset="100%" stop-color="${c.bgB||col(c.bgA,-30)}"/></linearGradient></defs><rect width="200" height="300" fill="url(#bg)"/>`;

  // EARS (simple)
  const ears=`<ellipse cx="48" cy="112" rx="10" ry="14" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>
              <ellipse cx="152" cy="112" rx="10" ry="14" fill="${sk}" stroke="${ol}" stroke-width="1.5"/>
              <ellipse cx="48" cy="112" rx="5" ry="8" fill="${col(sk,-15)}"/>
              <ellipse cx="152" cy="112" rx="5" ry="8" fill="${col(sk,-15)}"/>`;

  // NECK
  const neck=`<rect x="88" y="165" width="24" height="22" fill="${sk}"/><rect x="86" y="183" width="28" height="6" fill="${col(sk,-10)}"/>`;

  return `<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg">
    ${bg}
    ${hairBacks[c.hair]||hairBacks[0]}
    ${outfits[c.outfit]||outfits[0]}
    ${poses[c.pose]||''}
    ${ears}
    ${neck}
    ${faces[c.face]||faces[0]}
    ${eyeStyles[c.eye]||eyeStyles[0]}
    ${brows[c.brow]||brows[0]}
    ${nose}
    ${mouths[c.mouth]||mouths[0]}
    ${blush}
    ${freckles}
    ${accessories[c.acc]||''}
  </svg>`;
}


  // ── SVG -> data URL ──
  function svgDataUrl(cfg) {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(avSVG(cfg))))}`;
  }

  // ═══════════════════════════════════
  // ── Module-local creator state ──
  // ═══════════════════════════════════
  var _cfg = null;       // config being edited while the creator is open
  var _container = null; // the element render() was given
  var _opts = null;      // { onSave }

  function defaultCfg() {
    var o = {};
    for (var k in AV_DEF) { if (Object.prototype.hasOwnProperty.call(AV_DEF, k)) o[k] = AV_DEF[k]; }
    return o;
  }

  function randomCfg() {
    var rnd = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
    var rndI = function (max) { return Math.floor(Math.random() * max); };
    return {
      face: rndI(5), skin: rnd(SKINS), eye: rndI(6), eyeColor: rnd(EYES_C), brow: rndI(4),
      mouth: rndI(8), mouthColor: rnd(['#e05080', '#c03060', '#ff6080', '#e07000']),
      hair: rndI(8), hairColor: rnd(HAIRS),
      outfit: rndI(8), outfitA: rnd(OUTFIT_C), outfitB: rnd(OUTFIT_C),
      acc: rndI(8), accColor: rnd(ACC_C),
      bgA: rnd(BGS), bgB: null,
      blush: Math.random() > .4, freckles: Math.random() > .7,
      pose: rndI(6)
    };
  }

  // ── Creator UI ──
  function renderCreator() {
    if (!_container) return;

    var colorDots = function (arr, key) {
      return arr.map(function (c) {
        return `<div class="ctav-color${_cfg[key] === c ? ' sel' : ''}" style="background:${c}" onclick="__ctAvSet('${key}','${c}')"></div>`;
      }).join('');
    };
    var pickerDot = function (key) {
      return `<div class="ctav-color-pick" title="Custom color"><input type="color" value="${_cfg[key] || '#7c3aed'}" oninput="__ctAvSet('${key}',this.value)"></div>`;
    };
    var opts = function (items, key) {
      return items.map(function (lbl, i) {
        return `<div class="ctav-opt${_cfg[key] === i ? ' sel' : ''}" onclick="__ctAvSet('${key}',${i})" title="${lbl}">${lbl}</div>`;
      }).join('');
    };

    _container.innerHTML = `<div class="ctav-wrap">
    <!-- Preview -->
    <div class="ctav-preview-box">
      <div id="ctav-preview" class="ctav-preview-svg">${avSVG(_cfg)}</div>
    </div>

    <!-- Save -->
    <div class="ctav-save-strip">
      <button class="ctav-save-btn" onclick="__ctAvSave()">💾 Save to Profile</button>
      <button class="ctav-rand-btn" onclick="__ctAvRandom()" title="Random!">🎲</button>
    </div>
    <div class="ctav-saved-badge" id="ctav-saved-badge">✓ Avatar saved to your profile! 🌸</div>

    <!-- Face + Skin -->
    <div class="ctav-section">
      <div class="ctav-section-title">Face & Skin</div>
      <div class="ctav-options" style="margin-bottom:8px">${opts(['😶', '🌕', '⬜', '💎', '🥚'], 'face')}</div>
      <div class="ctav-colors">${colorDots(SKINS, 'skin')}${pickerDot('skin')}</div>
    </div>

    <!-- Hair -->
    <div class="ctav-section">
      <div class="ctav-section-title">Hair</div>
      <div class="ctav-options" style="margin-bottom:8px">${opts(['💆', '📏', '🎀', '🎱', '⚡', '🌊', '💇', '🪢'], 'hair')}</div>
      <div class="ctav-colors">${colorDots(HAIRS, 'hairColor')}${pickerDot('hairColor')}</div>
    </div>

    <!-- Eyes -->
    <div class="ctav-section">
      <div class="ctav-section-title">Eyes & Brows</div>
      <div class="ctav-options" style="margin-bottom:6px">${opts(['✨', '⭕', '😼', '⭐', '😊', '💫'], 'eye')}</div>
      <div class="ctav-colors" style="margin-bottom:8px">${colorDots(EYES_C, 'eyeColor')}${pickerDot('eyeColor')}</div>
      <div class="ctav-sub-label">Eyebrows</div>
      <div class="ctav-options">${opts(['〰️', '📐', '🖊️', '😟'], 'brow')}</div>
    </div>

    <!-- Expression -->
    <div class="ctav-section">
      <div class="ctav-section-title">Expression</div>
      <div class="ctav-options" style="margin-bottom:6px">${opts(['😊', '😁', '😮', '😢', '😏', '☺️', '😤', '😯'], 'mouth')}</div>
      <div class="ctav-colors">${colorDots(['#e05080', '#c03060', '#ff6080', '#e07000', '#d04040', '#904080', '#806000'], 'mouthColor')}${pickerDot('mouthColor')}</div>
    </div>

    <!-- Outfit -->
    <div class="ctav-section">
      <div class="ctav-section-title">Outfit</div>
      <div class="ctav-options" style="margin-bottom:8px">${opts(['👕', '🎓', '🧥', '🥷', '✨', '🏃', '👘', '⚔️'], 'outfit')}</div>
      <div class="ctav-row">
        <div class="ctav-col"><div class="ctav-sub-label">Main</div><div class="ctav-colors">${colorDots(OUTFIT_C, 'outfitA')}${pickerDot('outfitA')}</div></div>
        <div class="ctav-col"><div class="ctav-sub-label">Accent</div><div class="ctav-colors">${colorDots(OUTFIT_C, 'outfitB')}${pickerDot('outfitB')}</div></div>
      </div>
    </div>

    <!-- Accessories -->
    <div class="ctav-section">
      <div class="ctav-section-title">Accessories</div>
      <div class="ctav-options" style="margin-bottom:6px">${opts(['❌', '🐱', '🎀', '👑', '👓', '🎗️', '😇', '🧙'], 'acc')}</div>
      <div class="ctav-colors">${colorDots(ACC_C, 'accColor')}${pickerDot('accColor')}</div>
    </div>

    <!-- Pose -->
    <div class="ctav-section">
      <div class="ctav-section-title">Pose</div>
      <div class="ctav-options">${opts(['🧍', '🙌', '✌️', '👋', '👍', '🤗'], 'pose')}</div>
    </div>

    <!-- Details -->
    <div class="ctav-section">
      <div class="ctav-section-title">Details</div>
      <div class="ctav-row">
        <div class="ctav-col">
          <div class="ctav-sub-label">Blush</div>
          <div class="ctav-toggle">
            <button class="ctav-tog-btn${_cfg.blush ? ' on' : ''}" onclick="__ctAvSet('blush',true)">On</button>
            <button class="ctav-tog-btn${!_cfg.blush ? ' on' : ''}" onclick="__ctAvSet('blush',false)">Off</button>
          </div>
        </div>
        <div class="ctav-col">
          <div class="ctav-sub-label">Freckles</div>
          <div class="ctav-toggle">
            <button class="ctav-tog-btn${_cfg.freckles ? ' on' : ''}" onclick="__ctAvSet('freckles',true)">On</button>
            <button class="ctav-tog-btn${!_cfg.freckles ? ' on' : ''}" onclick="__ctAvSet('freckles',false)">Off</button>
          </div>
        </div>
      </div>
      <div class="ctav-sub-label" style="margin-top:8px">Background</div>
      <div class="ctav-colors">${colorDots(BGS, 'bgA')}${pickerDot('bgA')}</div>
    </div>
  </div>`;
  }

  // ── Handlers (namespaced globals so inline onclick can reach them) ──
  function avSet(key, val) {
    _cfg[key] = typeof val === 'number' ? val : (val === 'true' ? true : val === 'false' ? false : val);
    // re-render preview immediately, then refresh selection highlights
    var prev = document.getElementById('ctav-preview');
    if (prev) prev.innerHTML = avSVG(_cfg);
    renderCreator();
  }

  function avSave() {
    if (_opts && typeof _opts.onSave === 'function') {
      _opts.onSave(_cfg, svgDataUrl(_cfg));
    }
    var badge = document.getElementById('ctav-saved-badge');
    if (badge) { badge.style.display = 'block'; setTimeout(function () { badge.style.display = 'none'; }, 2500); }
  }

  function avRandom() {
    _cfg = randomCfg();
    renderCreator();
  }

  window.__ctAvSet = avSet;
  window.__ctAvSave = avSave;
  window.__ctAvRandom = avRandom;

  // ═══════════════════════════════════
  // ── Public interface ──
  // ═══════════════════════════════════
  window.CTAvatar = {
    defaultCfg: defaultCfg,
    randomCfg: randomCfg,
    svg: svgDataUrl,
    render: function (containerEl, cfg, opts) {
      _container = containerEl;
      _opts = opts || {};
      _cfg = cfg ? cfg : defaultCfg();
      renderCreator();
    }
  };
})();
