// src/services/pdf.ts
// ─────────────────────────────────────────────────────────────────────────────
// אלגוריתם פענוח PDF חכם — גרסה 2.0
// ─────────────────────────────────────────────────────────────────────────────

import * as pdfjs from "pdfjs-dist";
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

// ─── קבועים ───────────────────────────────────────────────────────────────────

/** כמה תווים מינימום ומקסימום בכל "עמוד תצוגה" */
const TARGET_PAGE_CHARS = 1800;
const MIN_PAGE_CHARS    = 800;
const MAX_PAGE_CHARS    = 2800;

/** כמה תווים לדגום בתחילת/סוף המסמך לזיהוי Artifacts */
const ARTIFACT_SAMPLE_PAGES = 8;

/** רגקס לזיהוי שורת מספר עמוד עצמאית (למשל "42", "- 42 -", "Page 42") */
const PAGE_NUMBER_LINE_RE =
  /^[\s\-–—]*(?:page\s*)?\d{1,4}[\s\-–—]*$/i;

/** רגקס לזיהוי כותרות פרק נפוצות */
const CHAPTER_HEADING_RE =
  /^(?:(?:chapter|פרק|פרק\s+\w+|חלק|part)\s+[\divxlcdmIVXLCDM\u05d0-\u05ea]+[\s:.\-–]?)/i;

// ─── טיפוסים ──────────────────────────────────────────────────────────────────

export interface ParsedBook {
  /** מערך הפסקאות הגולמיות לאחר ניקוי */
  paragraphs: string[];
  /** מחרוזת סופית עם סימני עמוד למסד הנתונים */
  content: string;
  /** מספר עמודי תצוגה שנוצרו */
  totalPages: number;
  /** שמות פרקים שזוהו ומיקומם בעמודים */
  chapters: { title: string; page: number }[];
}

// ─── פונקציית כניסה ראשית ─────────────────────────────────────────────────────

export async function parsePDF(arrayBuffer: ArrayBuffer): Promise<ParsedBook> {
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const totalPdfPages = doc.numPages;

  // שלב 1: קריאת כל הטקסט הגולמי מה-PDF
  const rawPages = await extractRawPages(doc, totalPdfPages);

  // שלב 2: בניית רשימת Artifacts שיש להסיר
  const artifacts = detectArtifacts(rawPages);

  // שלב 3: ניקוי כל עמוד PDF בנפרד (שמירה על חלוקת העמודים המקורית)
  const pages: string[] = [];
  const chapters: { title: string; page: number }[] = [];
  const allParagraphs: string[] = [];

  for (const rawPage of rawPages) {
    const cleanedLines: string[] = [];

    for (const line of rawPage.lines) {
      const trimmed = line.trim();

      // דילוג על Artifacts ושורות ריקות
      if (!trimmed || artifacts.has(trimmed)) continue;

      // ניקוי תווים בעייתיים שנוצרים בחילוץ PDF
      const clean = trimmed
        .replace(/\uFFFD/g, "")       // תו חלופי חסר
        .replace(/\u00AD/g, "")       // מקף רך
        .replace(/\s{2,}/g, " ");     // רווחים מרובים

      if (clean.length > 0) cleanedLines.push(clean);
    }

    if (cleanedLines.length > 0) {
      // חיבור שורות העמוד
      const joined = cleanedLines.join("\n");

      // תיקון מילים שנשברו עם מקף בסוף שורה
      const hyphenFixed = joined.replace(/-\n([a-zA-Z\u05d0-\u05ea])/g, "$1");

      // שורה שמסתיימת באמצע משפט + שורה הבאה שמתחילה באות קטנה -> חיבור
      const lineJoined = hyphenFixed.replace(
        /([^\.\!\?\:\n])\n([a-z\u05d0-\u05ea\u0590-\u05ff])/g,
        "$1 $2"
      );

      // פיצול לפסקאות בתוך העמוד
      const pageParagraphs = splitIntoParagraphs(lineJoined);
      allParagraphs.push(...pageParagraphs);

      // זיהוי פרקים בעמוד הנוכחי
      for (const para of pageParagraphs) {
        if (CHAPTER_HEADING_RE.test(para) || isLikelyHeading(para)) {
          chapters.push({ title: para, page: pages.length + 1 });
        }
      }

      // שמירת העמוד הנקי
      pages.push(pageParagraphs.join("\n\n"));
    } else {
      // עמוד ריק
      pages.push("");
    }
  }

  // שלב 4: הרכבת מחרוזת ה-content עם סימניות
  const content = pages
    .map((page, i) => `<<PAGE:${i + 1}>>\n${page}\n<<LUMINA_PAGE_BREAK>>\n`)
    .join("");

  return {
    paragraphs: allParagraphs,
    content,
    totalPages: pages.length,
    chapters,
  };
}

// ─── שלב 1: קריאת עמודים גולמיים ─────────────────────────────────────────────

interface RawPage {
  pageNum: number;
  lines: string[];    // שורות הטקסט כפי שנקראו
  rawText: string;    // הכל מחובר
}

async function extractRawPages(
  doc: pdfjs.PDFDocumentProxy,
  totalPages: number
): Promise<RawPage[]> {
  const results: RawPage[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent = await page.getTextContent();

    // pdfjs מחזיר TextItem-ים עם מידע גיאומטרי (x, y).
    // אנחנו קוראים אותם בסדר, ומזהים שבירת שורה לפי קפיצת y.
    const lines = groupItemsIntoLines(textContent.items as any[]);

    results.push({
      pageNum,
      lines,
      rawText: lines.join("\n"),
    });
  }

  return results;
}

/**
 * ממיין TextItem-ים לפי y (מלמעלה למטה) ואז x,
 * ומקבץ אותם לשורות לפי קרבה אנכית.
 */
function groupItemsIntoLines(items: any[]): string[] {
  if (items.length === 0) return [];

  // מיון: y יורד (PDF y=0 בתחתית), x עולה
  const sorted = [...items].sort((a, b) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > 2) return yDiff;
    return a.transform[4] - b.transform[4];
  });

  const lines: string[] = [];
  let currentLine: string[] = [];
  let lastY = sorted[0].transform[5];

  for (const item of sorted) {
    const y = item.transform[5];
    // קפיצת y גדולה מ-4 נקודות = שורה חדשה
    if (Math.abs(y - lastY) > 4) {
      const lineText = currentLine.join(" ").trim();
      if (lineText) lines.push(lineText);
      currentLine = [];
      lastY = y;
    }
    currentLine.push(item.str);
  }
  const last = currentLine.join(" ").trim();
  if (last) lines.push(last);

  return lines;
}

// ─── שלב 2: זיהוי Artifacts ───────────────────────────────────────────────────

/**
 * מחזיר Set של מחרוזות שמופיעות בעמודים רבים ברצף
 * ולכן ככל הנראה הן כותרות/שוליות/מספרי עמוד.
 *
 * האלגוריתם: דוגמים את ה-N עמודים הראשונים ו-N האחרונים,
 * מאחדים את השורות הקצרות ובודקים אילו מהן חוזרות.
 */
function detectArtifacts(rawPages: RawPage[]): Set<string> {
  const artifacts = new Set<string>();
  if (rawPages.length < 4) return artifacts;

  // דגימה: עמודים מתחילה ומסוף
  const sampleSize = Math.min(ARTIFACT_SAMPLE_PAGES, Math.floor(rawPages.length / 3));
  const samplePages = [
    ...rawPages.slice(0, sampleSize),
    ...rawPages.slice(-sampleSize),
  ];

  // ספירת תדירות שורות קצרות
  const freq = new Map<string, number>();
  for (const page of samplePages) {
    // רק שורות קצרות (עד 80 תווים) — כותרות ומספרים
    const candidates = page.lines.filter((l) => l.length <= 80 && l.trim().length > 0);
    // שורה ראשונה ואחרונה בלבד (כותרת ושורית)
    for (const line of [candidates[0], candidates[candidates.length - 1]]) {
      if (!line) continue;
      freq.set(line, (freq.get(line) ?? 0) + 1);
    }
  }

  // מספר עמוד עצמאי — כמעט תמיד Artifact
  for (const page of rawPages) {
    for (const line of page.lines) {
      if (PAGE_NUMBER_LINE_RE.test(line)) {
        artifacts.add(line.trim());
      }
    }
  }

  // שורות שחוזרות ב-40%+ מהדגימה
  const threshold = Math.max(2, Math.floor(sampleSize * 0.4));
  for (const [line, count] of freq.entries()) {
    if (count >= threshold) {
      artifacts.add(line.trim());
    }
  }

  return artifacts;
}

// ─── שלב 3: בניית זרם טקסט נקי ───────────────────────────────────────────────

/**
 * מעבד כל עמוד PDF, מסיר Artifacts, מתקן מקפים בסוף שורה,
 * ומחבר הכל למחרוזת אחת שבה פסקאות מופרדות בשורה ריקה.
 */
function buildCleanTextStream(
  rawPages: RawPage[],
  artifacts: Set<string>
): string {
  const pageTexts: string[] = [];

  for (const page of rawPages) {
    const cleanedLines: string[] = [];

    for (const line of page.lines) {
      const trimmed = line.trim();

      // דילוג על Artifacts ושורות ריקות
      if (!trimmed || artifacts.has(trimmed)) continue;

      // ניקוי תווים בעייתיים שנוצרים בחילוץ PDF
      const clean = trimmed
        .replace(/\uFFFD/g, "")       // תו חלופי חסר
        .replace(/\u00AD/g, "")       // מקף רך
        .replace(/\s{2,}/g, " ");     // רווחים מרובים

      if (clean.length > 0) cleanedLines.push(clean);
    }

    if (cleanedLines.length > 0) {
      pageTexts.push(cleanedLines.join("\n"));
    }
  }

  // חיבור עמודי ה-PDF לטקסט אחד
  const joined = pageTexts.join("\n");

  // תיקון מילים שנשברו עם מקף בסוף שורה (word- \n continuation)
  const hyphenFixed = joined.replace(/-\n([a-zA-Z\u05d0-\u05ea])/g, "$1");

  // שורה שמסתיימת באמצע משפט (לא נקודה/סימן פיסוק) + שורה הבאה שמתחילה באות קטנה
  // → ככל הנראה המשך ישיר; מחברים אותן
  const lineJoined = hyphenFixed.replace(
    /([^\.\!\?\:\n])\n([a-z\u05d0-\u05ea\u0590-\u05ff])/g,
    "$1 $2"
  );

  return lineJoined;
}

// ─── שלב 4: פיצול לפסקאות ────────────────────────────────────────────────────

/**
 * מפצל את הטקסט הנקי לפסקאות עצמאיות.
 * פסקה = בלוק טקסט שמופרד מהבא אחריו בשורה ריקה אחת לפחות.
 */
function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p.length >= 20); // הסרת שברים קצרים מדי
}

// ─── שלב 5: בניית עמודי תצוגה חכמים ─────────────────────────────────────────

interface DisplayPages {
  pages: string[];
  chapters: { title: string; page: number }[];
}

/**
 * מחלק את הפסקאות לעמודי תצוגה תוך שמירה על עקרונות אלה:
 *
 * א. כל עמוד מכיל בין MIN_PAGE_CHARS ל-MAX_PAGE_CHARS תווים.
 * ב. לעולם לא חוצים פסקה לשניים.
 * ג. כותרת פרק תמיד מתחילה עמוד חדש.
 * ד. אם פסקה בודדת ארוכה מ-MAX_PAGE_CHARS — היא מקבלת עמוד משלה.
 */
function buildDisplayPages(paragraphs: string[]): DisplayPages {
  const pages: string[] = [];
  const chapters: { title: string; page: number }[] = [];

  let currentParagraphs: string[] = [];
  let currentChars = 0;

  const flushPage = () => {
    if (currentParagraphs.length === 0) return;
    pages.push(currentParagraphs.join("\n\n"));
    currentParagraphs = [];
    currentChars = 0;
  };

  for (const para of paragraphs) {
    const isChapterHeading = CHAPTER_HEADING_RE.test(para) || isLikelyHeading(para);

    // כותרת פרק: תמיד פותחת עמוד חדש
    if (isChapterHeading) {
      flushPage();
      chapters.push({ title: para, page: pages.length + 1 });
    }

    // פסקה ארוכה מאוד: נותנים לה עמוד לבד
    if (para.length > MAX_PAGE_CHARS) {
      flushPage();
      pages.push(para);
      continue;
    }

    // האם הוספת הפסקה תחרוג מהמקסימום?
    const wouldExceed = currentChars + para.length > MAX_PAGE_CHARS;
    const hasEnough   = currentChars >= MIN_PAGE_CHARS;

    if (wouldExceed && hasEnough) {
      flushPage();
    }

    currentParagraphs.push(para);
    currentChars += para.length + 2; // +2 לרווח הפסקה
  }

  flushPage(); // שמירת השאריות

  return { pages, chapters };
}

/**
 * מנסה לזהות האם פסקה היא כותרת לפי:
 * — קצרה (עד 80 תווים)
 * — לא מסתיימת בנקודה
 * — אותיות ראשיות (עברית/אנגלית)
 */
function isLikelyHeading(text: string): boolean {
  if (text.length > 80) return false;
  if (/[.!?,;]$/.test(text)) return false;

  // אנגלית: כל מילה באות גדולה (Title Case)
  const englishTitleCase = /^[A-Z][a-zA-Z\s\-:]+$/.test(text);

  // עברית: שורה קצרה ב-all-caps אינה רלוונטית, נסתמך על אורך
  const hebrewHeading = /[\u05d0-\u05ea]/.test(text) && text.length < 50;

  return englishTitleCase || hebrewHeading;
}

// ─── פענוח קבצי TXT ───────────────────────────────────────────────────────────

/**
 * עבור קובץ טקסט רגיל — אותה חלוקה חכמה לפי פסקאות.
 */
export function parseTXT(text: string): ParsedBook {
  const paragraphs = splitIntoParagraphs(text);
  const { pages, chapters } = buildDisplayPages(paragraphs);

  const content = pages
    .map((page, i) => `<<PAGE:${i + 1}>>\n${page}\n<<LUMINA_PAGE_BREAK>>\n`)
    .join("");

  return { paragraphs, content, totalPages: pages.length, chapters };
}
