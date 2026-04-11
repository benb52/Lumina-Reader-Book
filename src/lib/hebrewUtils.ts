/**
 * Utility for Hebrew "Keri and Ketiv" (written vs read) transformations.
 * This is especially useful for religious texts and prayers.
 */

export const applyKeriKetiv = (text: string): string => {
  if (!text) return text;

  let processed = text;

  // 1. Normalization: Remove Cantillation marks (Ta'amei Mikra)
  // Range: U+0591 to U+05AF
  processed = processed.replace(/[\u0591-\u05af]/g, '');

  // 2. Divine Names (Tetragrammaton)
  // Context-aware: אֲדֹנָי יְהֹוִה -> אֲדֹנָי אֱלֹהִים
  // We handle this first to avoid partial replacements
  processed = processed.replace(/(אֲדֹנָי|אדני)\s+(יְהֹוִה|יהוה|יְהֹוָה|ה'|יי)/g, '$1 אֱלֹהִים');

  // Handle prefixes for Divine Names
  // Special case: לַּה' (Lamed + Dagesh \u05BC + Patah \u05B7) -> Emphasized Lad-donai
  processed = processed.replace(/\u05DC\u05BC\u05B7(ה'|יהוה|יי|יְהֹוָה)/g, 'לַּאדֹנָי');

  const divineNamePatterns = [
    { pattern: /לַ(ה'|יהוה|יי|יְהֹוָה)/g, replacement: 'לַאדֹנָי' },
    { pattern: /וַ(ה'|יהוה|יי|יְהֹוָה)/g, replacement: 'וַאדֹנָי' },
    { pattern: /בַּ(ה'|יהוה|יי|יְהֹוָה)/g, replacement: 'בַּאדֹנָי' },
    { pattern: /כַּ(ה'|יהוה|יי|יְהֹוָה)/g, replacement: 'כַּאדֹנָי' },
    { pattern: /מֵ(ה'|יהוה|יי|יְהֹוָה)/g, replacement: 'מֵאֲדֹנָי' },
    // Non-niqqud versions
    { pattern: /לה'/g, replacement: 'לאדוני' },
    { pattern: /וה'/g, replacement: 'ואדוני' },
    { pattern: /בה'/g, replacement: 'באדוני' },
    { pattern: /כה'/g, replacement: 'כאדוני' },
    { pattern: /מה'/g, replacement: 'מאדוני' },
  ];

  divineNamePatterns.forEach(({ pattern, replacement }) => {
    processed = processed.replace(pattern, replacement);
  });

  // Standard Divine Name replacements
  processed = processed.replace(/יְהֹוָה/g, 'אֲדֹנָי');
  processed = processed.replace(/יְהֹוִה/g, 'אֱלֹהִים');
  processed = processed.replace(/(^|\s)(יהוה|ה'|יי)(?=\s|$|[.,!?;:])/g, '$1אֲדֹנָי');

  // 3. Silent Aleph (א' נחה)
  processed = processed.replace(/לֵאמֹר/g, 'לֵמֹר');
  processed = processed.replace(/וַיָּבֵא(?=\s|$|[.,!?;:])/g, 'וַיָּבֵ');
  processed = processed.replace(/תָּבִיא(?=\s|$|[.,!?;:])/g, 'תָּבִ');
  processed = processed.replace(/חַטָּאת/g, 'חַטָּת');
  processed = processed.replace(/מָלֵא/g, 'מָלֵ');
  processed = processed.replace(/רֹאשׁ/g, 'רֹשׁ');

  // 4. Patah Gnuva (פתח גנובה)
  // If word ends with [Vowel] + [חַ/עַ/הַּ]
  // We insert an Aleph with Patah before the final consonant to force correct TTS pronunciation
  processed = processed.replace(/([וּוֹיִֵָ])(חַ|עַ|הַּ)(?=\s|$|[.,!?;:])/g, '$1אַ$2');

  // 5. Fixed Keri & Ketiv Mapping
  processed = processed.replace(/יְרוּשָׁלַםִ/g, 'יְרוּשָׁלַיִם');
  processed = processed.replace(/יְרוּשָׁלַם/g, 'יְרוּשָׁלַיִם');
  processed = processed.replace(/ירושלם/g, 'ירושלים');
  
  // הוא -> היא (when niqquded with hiriq in biblical context)
  processed = processed.replace(/הִוא/g, 'הִיא');
  
  processed = processed.replace(/יִשָּׂשכָר/g, 'יִשָּׂכָר');
  processed = processed.replace(/יששכר/g, 'ישכר');
  
  processed = processed.replace(/שְׁנַיִם/g, 'שְׁנַיִם');
  
  // עְפָלִים -> טְחֹרִים
  processed = processed.replace(/עְפָלִים/g, 'טְחֹרִים');
  processed = processed.replace(/עפלים/g, 'טחורים');

  return processed;
};
