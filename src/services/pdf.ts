// src/services/pdf.ts
// ─────────────────────────────────────────────────────────────────────────────
// אלגוריתם פענוח PDF חכם — גרסה 2.0
// ─────────────────────────────────────────────────────────────────────────────

import * as pdfjs from "pdfjs-dist";
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

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
  /^(?:(?:chapter|פרק|פרק\s+\w+|חלק|part|preface|prologue|introduction|foreword|הקדמה|מבוא|פתיחה|פרולוג)\s*[\divxlcdmIVXLCDM\u05d0-\u05ea]*[\s:.\-–]?)/i;

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

  // שלב 3: איסוף כל הפסקאות מכל העמודים
  const allParagraphs: string[] = [];

  for (const rawPage of rawPages) {
    const cleanedLines: string[] = [];

    for (const line of rawPage.lines) {
      const trimmed = line.trim();
      if (!trimmed || artifacts.has(trimmed)) continue;

      const clean = trimmed
        .replace(/\uFFFD/g, "")
        .replace(/\u00AD/g, "")
        .replace(/\s{2,}/g, " ");

      if (clean.length > 0) cleanedLines.push(clean);
    }

    if (cleanedLines.length > 0) {
      const joined = cleanedLines.join("\n");
      const hyphenFixed = joined.replace(/-\n([a-zA-Z\u05d0-\u05ea])/g, "$1");
      const lineJoined = hyphenFixed.replace(
        /([^\.\!\?\:\n])\n([a-z\u05d0-\u05ea\u0590-\u05ff])/g,
        "$1 $2"
      );

      const pageParagraphs = splitIntoParagraphs(lineJoined);
      allParagraphs.push(...pageParagraphs);
    }
  }

  // שלב 4: חלוקה חכמה לעמודי תצוגה (מבטיח סיום בנקודה והתחלת דף חדש בפרקים)
  const { pages, chapters } = buildDisplayPages(allParagraphs);

  // שלב 5: הרכבת מחרוזת ה-content עם סימניות
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
  // Split by double newline first
  const blocks = text.split(/\n{2,}/);
  const result: string[] = [];

  for (const block of blocks) {
    // Check for headings inside a block that might be separated by only one newline
    const lines = block.split('\n');
    let current = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (CHAPTER_HEADING_RE.test(trimmed) || isLikelyHeading(trimmed)) {
        if (current) result.push(current.trim());
        result.push(trimmed);
        current = '';
      } else {
        current += (current ? ' ' : '') + trimmed;
      }
    }
    if (current) result.push(current.trim());
  }

  return result.filter((p) => p.trim().length > 0);
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

  let currentParagraphs: { text: string; isHeading: boolean }[] = [];
  let currentChars = 0;
  let hasContentOnPage = false;

  const flushPage = () => {
    if (currentParagraphs.length === 0) return;
    
    let pageContent = "";
    for (let i = 0; i < currentParagraphs.length; i++) {
      const p = currentParagraphs[i];
      if (i > 0) {
        const prevWasHeading = currentParagraphs[i - 1].isHeading;
        const currentIsHeading = p.isHeading;
        // מניעת רווחים מיותרים סביב כותרות (BOLD_START)
        // נשתמש בירידת שורה אחת בלבד אם אחת מהפסקאות היא כותרת כדי לשמור על רצף ויזואלי נקי.
        if (prevWasHeading || currentIsHeading) {
          pageContent += "\n";
        } else {
          pageContent += "\n\n";
        }
      }
      pageContent += p.text;
    }
    
    pages.push(pageContent);
    currentParagraphs = [];
    currentChars = 0;
    hasContentOnPage = false;
  };

  for (const para of paragraphs) {
    const isChapterHeading = CHAPTER_HEADING_RE.test(para) || isLikelyHeading(para);
    const processedPara = isChapterHeading ? `<<BOLD_START>>${para}<<BOLD_END>>` : para;

    // כותרת פרק: פותחת עמוד חדש רק אם העמוד הקודם מכיל מספיק תוכן.
    if (isChapterHeading) {
      const shouldFlush = currentChars > 600 || (hasContentOnPage && currentChars > 300);
      
      if (shouldFlush) {
        flushPage();
      }
      chapters.push({ title: para, page: pages.length + 1 });
    } else {
      if (para.length > 40) {
        hasContentOnPage = true;
      }
    }

    // פסקה ארוכה מאוד: נפצל אותה למשפטים כדי לא לחרוג מהמקסימום
    if (para.length > MAX_PAGE_CHARS) {
      const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
      let currentChunk = "";
      
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence) continue;
        
        if (trimmedSentence.length > MAX_PAGE_CHARS) {
          if (currentChunk.trim()) {
            currentParagraphs.push({ text: currentChunk.trim(), isHeading: false });
            flushPage();
            currentChunk = "";
          }
          
          let remaining = trimmedSentence;
          while (remaining.length > 0) {
            const part = remaining.substring(0, MAX_PAGE_CHARS);
            currentParagraphs.push({ text: part, isHeading: false });
            flushPage();
            remaining = remaining.substring(MAX_PAGE_CHARS);
          }
          continue;
        }
        
        if (currentChunk.length + trimmedSentence.length > MAX_PAGE_CHARS) {
          if (currentChars + currentChunk.length > MAX_PAGE_CHARS && currentChars >= MIN_PAGE_CHARS) {
            // אם הפסקה האחרונה היא כותרת, נעביר אותה לעמוד הבא במקום להשאיר אותה לבד בסוף העמוד
            let headingToMove: { text: string; isHeading: boolean } | null = null;
            if (currentParagraphs.length > 0 && currentParagraphs[currentParagraphs.length - 1].isHeading) {
              headingToMove = currentParagraphs.pop()!;
            }
            
            flushPage();
            
            if (headingToMove) {
              currentParagraphs.push(headingToMove);
              currentChars = headingToMove.text.length + 2;
            }
          }
          currentParagraphs.push({ text: currentChunk.trim(), isHeading: false });
          currentChars += currentChunk.length + 2;
          
          if (currentChars >= TARGET_PAGE_CHARS) {
            flushPage();
          }
          
          currentChunk = trimmedSentence + " ";
        } else {
          currentChunk += trimmedSentence + " ";
        }
      }
      
      if (currentChunk.trim()) {
        if (currentChars + currentChunk.length > MAX_PAGE_CHARS && currentChars >= MIN_PAGE_CHARS) {
          let headingToMove: { text: string; isHeading: boolean } | null = null;
          if (currentParagraphs.length > 0 && currentParagraphs[currentParagraphs.length - 1].isHeading) {
            headingToMove = currentParagraphs.pop()!;
          }
          
          flushPage();
          
          if (headingToMove) {
            currentParagraphs.push(headingToMove);
            currentChars = headingToMove.text.length + 2;
          }
        }
        currentParagraphs.push({ text: currentChunk.trim(), isHeading: false });
        currentChars += currentChunk.length + 2;
      }
      continue;
    }

    // האם הוספת הפסקה תחרוג מהמקסימום?
    const wouldExceed = currentChars + processedPara.length > MAX_PAGE_CHARS;
    const hasEnough   = currentChars >= MIN_PAGE_CHARS;

    if (wouldExceed && hasEnough) {
      // אם הפסקה האחרונה היא כותרת, נעביר אותה לעמוד הבא
      let headingToMove: { text: string; isHeading: boolean } | null = null;
      if (currentParagraphs.length > 0 && currentParagraphs[currentParagraphs.length - 1].isHeading) {
        headingToMove = currentParagraphs.pop()!;
      }
      
      flushPage();
      
      if (headingToMove) {
        currentParagraphs.push(headingToMove);
        currentChars = headingToMove.text.length + 2;
      }
    }

    currentParagraphs.push({ text: processedPara, isHeading: isChapterHeading });
    currentChars += processedPara.length + 2;
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

  // עברית: שורה קצרה
  const hebrewHeading = /[\u05d0-\u05ea]/.test(text) && text.length < 40;

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

// ─── פענוח קבצי DOCX ──────────────────────────────────────────────────────────
export async function parseDOCX(arrayBuffer: ArrayBuffer): Promise<ParsedBook> {
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value;
  return parseTXT(text);
}
