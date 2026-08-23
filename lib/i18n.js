// Localisation for health reports.
//
// One file to add a language. Everything a locale needs lives here:
//   1. an entry in LOCALES
//   2. a CHROME[locale] dictionary (the fixed UI strings)
//   3. a STAGES[locale] entry (glyph + label + subtitle per stage)
//   4. a TRANSLATE_PROMPT[locale] line naming the target language and its house terms
//
// Report prose is stored ONCE in the canonical language (English) and each other
// locale is a parallel overlay of the same shape holding only the translated leaves.
// There are no per-language field suffixes, so nothing here has to change when a
// language is added, and no renderer code branches on which language it is drawing.

const CANONICAL = 'en';
const LOCALES = ['en', 'zh', 'es', 'hi'];

/* ---------------------------------------------------------------- chrome ---- */

const CHROME = {
  en: {
    heroLabel: 'Personalized Health Analysis', consultant: 'Consultant', recheck: 'Recheck in 4 Weeks',
    overview: 'Client Overview', name: 'Name', age: 'Age', gender: 'Gender', height: 'Height',
    bodyComp: 'Body Composition', signals: 'Top 3 Priority Signals', rca: 'Root Cause Analysis',
    summary: 'Summary', lifestyle: 'Lifestyle Plan',
    lifestyleSub: 'What to change, stage by stage. This is the foundation and it is free.',
    supps: 'Supplement Protocol',
    suppsSub: 'What to take, why, and when. Each one answers a specific finding in your assessment.',
    wins: 'What to Track', next: 'Next Step', optA: 'Option A: Lifestyle Only',
    optB: 'Option B: Lifestyle + Supplements', recheckItems: 'Track at 4 Weeks',
    disclaimer: 'This report is for wellness education only and does not constitute medical advice.',
    tier: 'Tier', takeWith: 'How to take it',
    docTitle: (n) => `Health Progress Report for ${n}`, siteLogo: 'Health Progress Report',
    confidential: 'Confidential',
    ctaTitle: 'Your Personalized Product Stack', ctaBtn: 'View My Products →',
    ctaSub: 'Pre-loaded based on your assessment. View pricing and order in one click.',
    ctaPasscode: 'For member pricing: tap ··· in the top right and enter the passcode your consultant gave you',
    cWeight: 'Weight', cBmi: 'BMI', cFat: 'Body Fat %', cVisc: 'Visceral Fat',
    cMuscle: 'Skeletal Muscle', cWater: 'Body Water', cMetAge: 'Metabolic Age', cProtein: 'Protein %',
    rHealthy: 'Healthy range', rAbove: 'Above ideal', rViscOk: 'Healthy (<10)', rViscHigh: 'High (10+)',
    rWaterOk: 'Good (60%+)', rWaterLow: 'Low-normal (60%+ ideal)', rProteinOk: 'Adequate (>18%)',
    bUnder: 'Underweight', bHealthy: 'Healthy (18.5-24.9)', bOver: 'Overweight (25-29.9)', bObese: 'Obese (30+)',
    mYounger: (n) => `${n} years younger than actual`, mMatch: 'Matches actual age',
    mOlder: (n) => `${n} years older than actual`
  },
  zh: {
    heroLabel: '个人健康分析', consultant: '顾问', recheck: '四周后复查',
    overview: '客户概况', name: '姓名', age: '年龄', gender: '性别', height: '身高',
    bodyComp: '身体成分', signals: '三大优先信号', rca: '根本原因分析',
    summary: '总结', lifestyle: '生活方式方案',
    lifestyleSub: '清调补养四个阶段，分别要改什么。这是基础，也是免费的。',
    supps: '营养补充方案',
    suppsSub: '吃什么、为什么、什么时候吃。每一项都对应你评估中的具体发现。',
    wins: '需要追踪的指标', next: '下一步', optA: '方案A：只调整生活方式',
    optB: '方案B：生活方式 + 营养补充', recheckItems: '四周后复查项目',
    disclaimer: '本报告仅供健康教育参考，不构成医疗建议。',
    tier: '等级', takeWith: '服用方法',
    docTitle: (n) => `${n} 的健康进展报告`, siteLogo: '健康进展报告',
    confidential: '保密',
    ctaTitle: '为你定制的产品方案', ctaBtn: '查看我的产品 →',
    ctaSub: '已根据你的评估结果预先选好。一键查看价格并下单。',
    ctaPasscode: '会员价格：点击右上角 ··· 输入顾问给你的通行码',
    cWeight: '体重', cBmi: '身体质量指数', cFat: '体脂率', cVisc: '内脏脂肪',
    cMuscle: '骨骼肌', cWater: '身体水分', cMetAge: '代谢年龄', cProtein: '蛋白质',
    rHealthy: '正常范围', rAbove: '高于理想值', rViscOk: '健康（低于10）', rViscHigh: '偏高（10以上）',
    rWaterOk: '良好（60%以上）', rWaterLow: '偏低（理想为60%以上）', rProteinOk: '充足（高于18%）',
    bUnder: '偏瘦', bHealthy: '健康范围（18.5-24.9）', bOver: '超重（25-29.9）', bObese: '肥胖（30以上）',
    mYounger: (n) => `比实际年龄小 ${n} 岁`, mMatch: '与实际年龄相同',
    mOlder: (n) => `比实际年龄大 ${n} 岁`
  },
  es: {
    heroLabel: 'Análisis de Salud Personalizado', consultant: 'Consultor', recheck: 'Revisión en 4 semanas',
    overview: 'Perfil del Cliente', name: 'Nombre', age: 'Edad', gender: 'Sexo', height: 'Estatura',
    bodyComp: 'Composición Corporal', signals: 'Las 3 señales prioritarias', rca: 'Análisis de causa raíz',
    summary: 'Resumen', lifestyle: 'Plan de estilo de vida',
    lifestyleSub: 'Qué cambiar, etapa por etapa. Esta es la base, y no cuesta nada.',
    supps: 'Protocolo de suplementación',
    suppsSub: 'Qué tomar, por qué y cuándo. Cada uno responde a un hallazgo concreto de tu evaluación.',
    wins: 'Qué medir', next: 'Siguiente paso', optA: 'Opción A: solo estilo de vida',
    optB: 'Opción B: estilo de vida + suplementos', recheckItems: 'Revisar a las 4 semanas',
    disclaimer: 'Este informe es solo para educación en bienestar y no constituye consejo médico.',
    tier: 'Nivel', takeWith: 'Cómo tomarlo',
    docTitle: (n) => `Informe de salud de ${n}`, siteLogo: 'Informe de Salud',
    confidential: 'Confidencial',
    ctaTitle: 'Tu plan de productos personalizado', ctaBtn: 'Ver mis productos →',
    ctaSub: 'Preseleccionado según tu evaluación. Consulta precios y pide en un clic.',
    ctaPasscode: 'Para precio de miembro: toca ··· arriba a la derecha e introduce el código que te dio tu consultor',
    cWeight: 'Peso', cBmi: 'IMC', cFat: '% de grasa corporal', cVisc: 'Grasa visceral',
    cMuscle: 'Músculo esquelético', cWater: 'Agua corporal', cMetAge: 'Edad metabólica', cProtein: '% de proteína',
    rHealthy: 'Rango saludable', rAbove: 'Por encima de lo ideal', rViscOk: 'Saludable (<10)', rViscHigh: 'Alta (10+)',
    rWaterOk: 'Buena (60%+)', rWaterLow: 'Baja-normal (ideal 60%+)', rProteinOk: 'Adecuada (>18%)',
    bUnder: 'Bajo peso', bHealthy: 'Saludable (18.5-24.9)', bOver: 'Sobrepeso (25-29.9)', bObese: 'Obesidad (30+)',
    mYounger: (n) => `${n} años menos que la edad real`, mMatch: 'Igual a la edad real',
    mOlder: (n) => `${n} años más que la edad real`
  },
  /* Hindi chrome was written to match the main site's language set. It is machine-written
     and has not been reviewed by a native speaker; the report prose itself is translated by
     the model at request time. Worth a read-through before this is put in front of a client. */
  hi: {
    heroLabel: 'व्यक्तिगत स्वास्थ्य विश्लेषण', consultant: 'सलाहकार', recheck: '4 सप्ताह में पुनः जाँच',
    overview: 'ग्राहक विवरण', name: 'नाम', age: 'आयु', gender: 'लिंग', height: 'कद',
    bodyComp: 'शारीरिक संरचना', signals: 'तीन प्रमुख संकेत', rca: 'मूल कारण विश्लेषण',
    summary: 'सारांश', lifestyle: 'जीवनशैली योजना',
    lifestyleSub: 'चरण दर चरण क्या बदलना है। यही आधार है, और यह नि:शुल्क है।',
    supps: 'पोषण अनुपूरक योजना',
    suppsSub: 'क्या लेना है, क्यों और कब। हर एक आपके मूल्यांकन के किसी विशेष निष्कर्ष का उत्तर देता है।',
    wins: 'क्या मापें', next: 'अगला कदम', optA: 'विकल्प A: केवल जीवनशैली',
    optB: 'विकल्प B: जीवनशैली + अनुपूरक', recheckItems: '4 सप्ताह में जाँचें',
    disclaimer: 'यह रिपोर्ट केवल स्वास्थ्य शिक्षा के लिए है और चिकित्सकीय सलाह नहीं है।',
    tier: 'स्तर', takeWith: 'कैसे लें',
    docTitle: (n) => `${n} की स्वास्थ्य रिपोर्ट`, siteLogo: 'स्वास्थ्य प्रगति रिपोर्ट',
    confidential: 'गोपनीय',
    ctaTitle: 'आपके लिए चुने गए उत्पाद', ctaBtn: 'मेरे उत्पाद देखें →',
    ctaSub: 'आपके मूल्यांकन के आधार पर पहले से चुने गए। एक क्लिक में मूल्य देखें और ऑर्डर करें।',
    ctaPasscode: 'सदस्य मूल्य के लिए: ऊपर दाईं ओर ··· दबाएँ और सलाहकार का दिया पासकोड डालें',
    cWeight: 'वज़न', cBmi: 'बीएमआई', cFat: 'शरीर में वसा %', cVisc: 'आंतरिक वसा',
    cMuscle: 'कंकाल पेशी', cWater: 'शरीर में जल', cMetAge: 'चयापचय आयु', cProtein: 'प्रोटीन %',
    rHealthy: 'स्वस्थ सीमा', rAbove: 'आदर्श से अधिक', rViscOk: 'स्वस्थ (<10)', rViscHigh: 'अधिक (10+)',
    rWaterOk: 'अच्छा (60%+)', rWaterLow: 'कम-सामान्य (आदर्श 60%+)', rProteinOk: 'पर्याप्त (>18%)',
    bUnder: 'कम वज़न', bHealthy: 'स्वस्थ (18.5-24.9)', bOver: 'अधिक वज़न (25-29.9)', bObese: 'मोटापा (30+)',
    mYounger: (n) => `वास्तविक आयु से ${n} वर्ष कम`, mMatch: 'वास्तविक आयु के बराबर',
    mOlder: (n) => `वास्तविक आयु से ${n} वर्ष अधिक`
  }
};

/* The label shown on the button that switches away from the current locale.
   Each locale names the others in their own script, so a reader always recognises
   the language they are switching to. */
const LOCALE_NAME = { en: 'English', zh: '中文', es: 'Español', hi: 'हिन्दी' };
/* Short code shown on the closed button, matching the main site's LANGS table so the
   report and the product site present the same control. */
const LOCALE_SHORT = { en: 'EN', zh: '中', es: 'ES', hi: 'HI' };

/* ---------------------------------------------------------------- stages ---- */

/* Stages are identified by a locale-independent key. The Chinese characters are a
   RENDERING of a stage, never its identity, which is what stops them leaking into
   English or Spanish prose. Legacy analyses stored the character as the key, so
   stageKey() accepts either. */
const STAGE_KEYS = ['clear', 'regulate', 'replenish', 'sustain'];
const LEGACY_GLYPH = { '清': 'clear', '调': 'regulate', '补': 'replenish', '养': 'sustain' };

function stageKey(v) {
  if (!v) return null;
  const s = String(v).trim();
  return LEGACY_GLYPH[s] || (STAGE_KEYS.includes(s.toLowerCase()) ? s.toLowerCase() : null);
}

const STAGES = {
  en: {
    clear:     { g: '1', label: 'Clear',     sub: 'Take the load off first' },
    regulate:  { g: '2', label: 'Regulate',  sub: 'Stop what is feeding the problem' },
    replenish: { g: '3', label: 'Replenish', sub: 'Supply what is missing' },
    sustain:   { g: '4', label: 'Sustain',   sub: 'Hold the daily rhythm' }
  },
  zh: {
    clear:     { g: '清', label: '清', sub: '清肠毒 · 清血毒' },
    regulate:  { g: '调', label: '调', sub: '调生活方式 · 调五脏六腑' },
    replenish: { g: '补', label: '补', sub: '补细胞营养 · 补隐性饥饿' },
    sustain:   { g: '养', label: '养', sub: '四季时令 · 子午流注' }
  },
  es: {
    clear:     { g: '1', label: 'Limpiar',    sub: 'Primero, quitar la carga' },
    regulate:  { g: '2', label: 'Regular',    sub: 'Cortar lo que alimenta el problema' },
    replenish: { g: '3', label: 'Reponer',    sub: 'Aportar lo que falta' },
    sustain:   { g: '4', label: 'Mantener',   sub: 'Sostener el ritmo diario' }
  },
  hi: {
    clear:     { g: '1', label: 'साफ़ करें',   sub: 'पहले बोझ हटाएँ' },
    regulate:  { g: '2', label: 'संतुलन',     sub: 'समस्या को जो बढ़ा रहा है उसे रोकें' },
    replenish: { g: '3', label: 'पूर्ति',      sub: 'जो कमी है वह दें' },
    sustain:   { g: '4', label: 'बनाए रखें',   sub: 'रोज़ की लय बनाए रखें' }
  }
};

/* ------------------------------------------------------- translatable shape -- */

/* The single description of which leaves carry prose. The collector, the merge and
   the completeness check all read this, so they cannot drift apart. Adding a field
   to a report means adding it here once. */
const SHAPE = {
  scalars: ['tierNote', 'summary', 'bodyCompNote', 'optionA', 'optionB', 'recheckItems'],
  lists:   ['wins'],
  objects: {
    signals:     { fields: ['name', 'badge', 'description'] },
    rcaSections: { fields: ['label', 'text'] },
    stages:      { fields: ['focus', 'horizon'], lists: ['items'] },
    products:    { fields: ['rationale', 'note'] }
  }
};

/* Every translatable leaf in an analysis, as {path, text}. Paths are stable strings
   so a translation can be written back into any locale overlay. */
function collect(a) {
  const out = [];
  const add = (path, text) => {
    if (text === null || text === undefined) return;
    if (!String(text).trim()) return;
    out.push({ path, text: String(text) });
  };
  SHAPE.scalars.forEach(k => add(k, a[k]));
  SHAPE.lists.forEach(k => (a[k] || []).forEach((v, i) => add(`${k}.${i}`, v)));
  Object.entries(SHAPE.objects).forEach(([key, def]) => {
    (a[key] || []).forEach((obj, i) => {
      (def.fields || []).forEach(f => add(`${key}.${i}.${f}`, obj[f]));
      (def.lists || []).forEach(l => (obj[l] || []).forEach((v, j) => add(`${key}.${i}.${l}.${j}`, v)));
    });
  });
  return out;
}

/* Read a dotted path out of a nested object. */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o === null || o === undefined) ? o : o[k], obj);
}

/* Write a dotted path into a nested object, creating arrays/objects as needed. */
function setPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    const nextIsIndex = /^\d+$/.test(parts[i + 1]);
    if (cur[k] === null || cur[k] === undefined) cur[k] = nextIsIndex ? [] : {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

/* Which leaves this locale is still missing. Generic: no per-language field list. */
function missing(a, overlay) {
  const ov = overlay || {};
  return collect(a).filter(it => {
    const v = getPath(ov, it.path);
    return !(v !== null && v !== undefined && String(v).trim());
  });
}

function isComplete(a, overlay) {
  return missing(a, overlay).length === 0;
}

/* Produce the object the renderer draws from: the canonical analysis with every
   translated leaf substituted in. The renderer receives one plain object and never
   branches on language, which is what keeps a whole class of "read the wrong field"
   bugs out of it. */
function resolve(a, overlay) {
  const merged = JSON.parse(JSON.stringify(a || {}));
  if (!overlay) return merged;
  collect(a).forEach(it => {
    const v = getPath(overlay, it.path);
    if (v !== null && v !== undefined && String(v).trim()) setPath(merged, it.path, v);
  });
  return merged;
}

/* ----------------------------------------------------------- translation ----- */

/* Per-locale guidance for the translating model. The house terms are the reason
   this is per-locale text rather than a generic "translate to X" instruction:
   Chinese has established vocabulary for this practice that a literal translation
   would miss, and Spanish should NOT borrow the Chinese terms. */
const TRANSLATE_PROMPT = {
  zh: {
    language: 'Simplified Chinese',
    terms: '- Use the established terms where they apply: 清 调 补 养, 肝经当令 for the 1-3 AM liver window, '
         + '心包经当令 for the 19:30-20:40 evening window, 胃经当令 for the 7-9 AM morning window, 亚健康, 隐性饥饿.\n'
         + '- The English source describes these in plain language on purpose. In Chinese, restore the proper term.'
  },
  hi: {
    language: 'Hindi (Devanagari script)',
    terms: '- Use plain clinical Hindi. Do NOT import Chinese terms or characters.\n'
         + '- Where the English describes a traditional-framework idea in plain language, keep it in equally\n'
         + '  plain Hindi. Never introduce vocabulary the English does not have.\n'
         + '- Use the respectful आप form throughout.\n'
         + '- Keep widely-understood English medical loanwords (BMI, protein, omega) in Latin script.'
  },
  es: {
    language: 'Latin American Spanish',
    terms: '- Use plain clinical Spanish. Do NOT import Chinese terms or characters, and do not transliterate them.\n'
         + '- Where the English describes a traditional-framework idea in plain language (for example "the liver\'s window, '
         + 'roughly 1 to 3 AM"), keep it in equally plain Spanish. Never introduce vocabulary the English does not have.\n'
         + '- Use usted, not tú.'
  }
};

function systemPrompt(locale) {
  const cfg = TRANSLATE_PROMPT[locale];
  if (!cfg) throw new Error(`no translation profile for locale ${locale}`);
  return `You translate a personalised health report from English into ${cfg.language} for a client in a wellness consulting practice.\n\n`
    + 'Rules:\n'
    + '- Translate meaning, not word for word. It must read as though written in the target language.\n'
    + '- Keep the clinical register: direct, warm, specific. No marketing language.\n'
    + cfg.terms + '\n'
    + '- Keep every number, measurement, product name and English brand name exactly as written.\n'
    + '- Never add a claim, a promise, or a timeframe that is not in the source.\n'
    + '- Return ONLY a JSON object mapping each id to its translated string. No markdown, no commentary.';
}

module.exports = {
  CANONICAL, LOCALES, CHROME, LOCALE_NAME, LOCALE_SHORT, STAGES, STAGE_KEYS, stageKey,
  SHAPE, collect, getPath, setPath, missing, isComplete, resolve,
  TRANSLATE_PROMPT, systemPrompt
};
