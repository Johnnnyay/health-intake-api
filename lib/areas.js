/* Names of the areas a client can rank as a priority, in the four languages of the report.
   GENERATED from pm-final/intake/questions.json (priorities.o). Edit the questions there. */
const AREAS = {
  "weight": {
    "en": "Weight and body composition",
    "zh": "体重与体型",
    "es": "Peso y composición corporal",
    "hi": "वज़न और शरीर की बनावट"
  },
  "energy": {
    "en": "Energy and fatigue",
    "zh": "精力与疲劳",
    "es": "Energía y cansancio",
    "hi": "ऊर्जा और थकान"
  },
  "sleep": {
    "en": "Sleep and stress",
    "zh": "睡眠与压力",
    "es": "Sueño y estrés",
    "hi": "नींद और तनाव"
  },
  "focus": {
    "en": "Focus and memory",
    "zh": "专注与记忆",
    "es": "Concentración y memoria",
    "hi": "एकाग्रता और याददाश्त"
  },
  "digestion": {
    "en": "Digestion and gut",
    "zh": "肠胃与消化",
    "es": "Digestión e intestino",
    "hi": "पाचन और आँतों का स्वास्थ्य"
  },
  "skin": {
    "en": "Skin: acne, eczema, dullness",
    "zh": "皮肤：痘痘、湿疹、暗沉",
    "es": "Piel: acné, eccema, apagada",
    "hi": "त्वचा: मुंहासे, एक्ज़िमा, बेजान त्वचा"
  },
  "hair": {
    "en": "Hair and nails",
    "zh": "头发与指甲",
    "es": "Cabello y uñas",
    "hi": "बाल और नाखून"
  },
  "immunity": {
    "en": "Immunity and allergies",
    "zh": "免疫与过敏",
    "es": "Defensas y alergias",
    "hi": "रोग-प्रतिरोधक क्षमता और एलर्जी"
  },
  "bloodsugar": {
    "en": "Blood sugar and metabolism",
    "zh": "血糖与代谢",
    "es": "Azúcar en sangre y metabolismo",
    "hi": "ब्लड शुगर और मेटाबॉलिज़्म"
  },
  "hormones": {
    "en": "Hormones and cycle",
    "zh": "激素与生理周期",
    "es": "Hormonas y ciclo menstrual",
    "hi": "हार्मोन और मासिक चक्र"
  },
  "joints": {
    "en": "Joints, bones and muscles",
    "zh": "关节、骨骼与肌肉",
    "es": "Articulaciones, huesos y músculos",
    "hi": "जोड़, हड्डियाँ और मांसपेशियाँ"
  },
  "heart": {
    "en": "Heart and circulation",
    "zh": "心血管与血液循环",
    "es": "Corazón y circulación",
    "hi": "हृदय और रक्त-संचार"
  },
  "eyes": {
    "en": "Eye health",
    "zh": "眼睛健康",
    "es": "Salud ocular",
    "hi": "आँखों का स्वास्थ्य"
  },
  "other": {
    "en": "Something else",
    "zh": "其他",
    "es": "Otra cosa",
    "hi": "कुछ और"
  }
};

const areaLabel = (id, locale) => (AREAS[id] && (AREAS[id][locale] || AREAS[id].en)) || null;

module.exports = { AREAS, areaLabel };
