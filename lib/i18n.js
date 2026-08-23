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
    profile: 'Client Profile', dosing: 'How Much To Take',
    findings: 'Findings and Root Cause',
    solution: 'Knowledge and Suggestion',
    solutionSub: 'What is happening at each stage, what to change, and where a supplement earns its place.',
    expect: 'What To Expect', expectSub: 'Against each finding above: what should change, and roughly when.',
    detailBtn: 'How to take it, and what it replaces', detailHide: 'Hide',
    foodInstead: 'Or from food', perDay: 'per day', monthly: 'A month is',
    findingsSub: 'Everything the assessment surfaced, each with what is driving it. Not a ranked list: they are connected.',
    plan: 'Your Plan', planSub: 'Each change twice over: what it takes from food, and what it takes from a supplement. Same result, your choice.',
    fromFood: 'From food', fromSupp: 'From a supplement', trackThis: 'Track',
    stagesTitle: 'The Four Stages',
    stagesSub: 'What to change and in what order. Each stage sets up the one after it.',
    dosingSub: 'Three different numbers get called "the dose". They are not the same thing, and the gap between them is where results live.',
    dLabel: 'On the bottle', dLabelSub: 'The manufacturer\u2019s serving. A maintenance amount, set for a general adult.',
    dAI: 'Adequate Intake (AI)', dAISub: 'What your own habits and symptoms call for. Individual, so it is calculated, not looked up.',
    dUL: 'Upper Limit (UL)', dULSub: 'The ceiling for daily intake over the long term. Never exceeded in this plan.',
    dWhen: 'When', dHow: 'How much', dWhy: 'Why', dLimiting: 'Limiting nutrient',
    dOfUL: 'of UL', dSource: 'Source', dMonth: 'One month supply', dBottles: 'bottles',
    dCitation: 'Reference intakes cited per nutrient below. Amounts on the label are from the product\u2019s own Supplement Facts panel.',
    dFlush: 'Tolerability note',
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
    profile: '客户档案', dosing: '摄入量',
    findings: '发现与根本原因',
    solution: '原理与建议',
    solutionSub: '每个阶段身体在发生什么、要改什么，以及补充剂在哪里真正有用。',
    expect: '预期变化', expectSub: '对照上面每一条发现：会有什么变化，大约多久。',
    detailBtn: '怎么吃，以及能用什么食物替代', detailHide: '收起',
    foodInstead: '或者从食物拿', perDay: '每天', monthly: '一个月需要',
    findingsSub: '评估中出现的全部问题，每一条都写清背后的原因。不是排名，因为它们本来就是连在一起的。',
    plan: '你的方案', planSub: '每一项都给两条路：从食物拿，或从补充剂拿。效果一样，你自己选。',
    fromFood: '从食物', fromSupp: '从补充剂', trackThis: '追踪',
    stagesTitle: '清调补养',
    stagesSub: '每个阶段要改什么。顺序是有原因的：前一步没做，后一步事倍功半。',
    dosingSub: '有三个数字都被叫做"用量",它们不是一回事。改善效果就发生在它们之间的差距里。',
    dLabel: '瓶子上的量', dLabelSub: '厂商标示的每份用量。这是维持量，按一般成年人设定。',
    dAI: '适宜摄入量 (AI)', dAISub: '你自己的生活习惯和症状所需要的量。因人而异，所以要算，查不到。',
    dUL: '可耐受最高量 (UL)', dULSub: '长期每日摄入的上限。本方案绝不超过。',
    dWhen: '什么时候吃', dHow: '吃多少', dWhy: '为什么', dLimiting: '限制营养素',
    dOfUL: '占UL', dSource: '出处', dMonth: '一个月用量', dBottles: '瓶',
    dCitation: '每种营养素的参考摄入量出处见下。产品含量取自该产品自己的营养成分表。',
    dFlush: '耐受性说明',
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
    profile: 'Perfil del Cliente', dosing: 'Cuánto tomar',
    findings: 'Hallazgos y causa raíz',
    solution: 'Explicación y recomendación',
    solutionSub: 'Qué ocurre en cada etapa, qué cambiar, y dónde un suplemento se gana su lugar.',
    expect: 'Qué esperar', expectSub: 'Para cada hallazgo de arriba: qué debería cambiar y aproximadamente cuándo.',
    detailBtn: 'Cómo tomarlo, y a qué sustituye', detailHide: 'Ocultar',
    foodInstead: 'O con comida', perDay: 'al día', monthly: 'Al mes',
    findingsSub: 'Todo lo que reveló la evaluación, cada punto con lo que lo provoca. No es un ranking: están conectados.',
    plan: 'Su plan', planSub: 'Cada cambio de dos formas: lo que cuesta con comida y lo que cuesta con un suplemento. Mismo resultado, usted elige.',
    fromFood: 'Con comida', fromSupp: 'Con un suplemento', trackThis: 'Medir',
    stagesTitle: 'Las cuatro etapas',
    stagesSub: 'Qué cambiar y en qué orden. Cada etapa prepara la siguiente.',
    dosingSub: 'Tres cifras distintas se llaman "la dosis". No son lo mismo, y en la diferencia entre ellas está el resultado.',
    dLabel: 'En el envase', dLabelSub: 'La porción del fabricante. Una cantidad de mantenimiento, para un adulto general.',
    dAI: 'Ingesta Adecuada (AI)', dAISub: 'Lo que piden sus propios hábitos y síntomas. Es individual, así que se calcula, no se consulta.',
    dUL: 'Límite Superior (UL)', dULSub: 'El techo de ingesta diaria a largo plazo. Este plan nunca lo supera.',
    dWhen: 'Cuándo', dHow: 'Cuánto', dWhy: 'Por qué', dLimiting: 'Nutriente limitante',
    dOfUL: 'del UL', dSource: 'Fuente', dMonth: 'Suministro para un mes', dBottles: 'envases',
    dCitation: 'Las ingestas de referencia se citan por nutriente abajo. Las cantidades provienen del panel de información nutricional del producto.',
    dFlush: 'Nota de tolerabilidad',
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
    profile: 'ग्राहक प्रोफ़ाइल', dosing: 'कितना लेना है',
    findings: 'निष्कर्ष और मूल कारण',
    solution: 'व्याख्या और सुझाव',
    solutionSub: 'हर चरण में क्या हो रहा है, क्या बदलना है, और अनुपूरक कहाँ वास्तव में उपयोगी है।',
    expect: 'क्या अपेक्षा करें', expectSub: 'ऊपर के हर निष्कर्ष के लिए: क्या बदलेगा और लगभग कब।',
    detailBtn: 'कैसे लें, और किसकी जगह लेता है', detailHide: 'छिपाएँ',
    foodInstead: 'या भोजन से', perDay: 'प्रतिदिन', monthly: 'एक महीने के लिए',
    findingsSub: 'मूल्यांकन में मिली हर बात, और उसके पीछे का कारण। यह क्रम नहीं है: ये आपस में जुड़े हैं।',
    plan: 'आपकी योजना', planSub: 'हर बदलाव दो तरह से: भोजन से कितना, और अनुपूरक से कितना। परिणाम एक, चुनाव आपका।',
    fromFood: 'भोजन से', fromSupp: 'अनुपूरक से', trackThis: 'मापें',
    stagesTitle: 'चार चरण',
    stagesSub: 'क्या बदलना है और किस क्रम में। हर चरण अगले की तैयारी करता है।',
    dosingSub: 'तीन अलग संख्याओं को "खुराक" कहा जाता है। वे एक जैसी नहीं हैं, और परिणाम उन्हीं के बीच के अंतर में है।',
    dLabel: 'डिब्बे पर', dLabelSub: 'निर्माता की सर्विंग। यह रखरखाव की मात्रा है, सामान्य वयस्क के लिए।',
    dAI: 'पर्याप्त सेवन (AI)', dAISub: 'आपकी अपनी आदतें और लक्षण जितना माँगते हैं। यह व्यक्तिगत है, इसलिए गणना की जाती है।',
    dUL: 'ऊपरी सीमा (UL)', dULSub: 'लंबे समय तक दैनिक सेवन की अधिकतम सीमा। यह योजना इसे कभी पार नहीं करती।',
    dWhen: 'कब', dHow: 'कितना', dWhy: 'क्यों', dLimiting: 'सीमित पोषक तत्व',
    dOfUL: 'UL का', dSource: 'स्रोत', dMonth: 'एक महीने की आपूर्ति', dBottles: 'बोतलें',
    dCitation: 'प्रत्येक पोषक तत्व के संदर्भ मान नीचे उद्धृत हैं। मात्राएँ उत्पाद के अपने सप्लीमेंट फैक्ट्स पैनल से हैं।',
    dFlush: 'सहनशीलता टिप्पणी',
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
