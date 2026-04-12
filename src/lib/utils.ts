import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCleanText(text: string) {
  if (!text) return '';
  return text.replace(/(<<BOLD_START>>|<<BOLD_END>>|<<UNDERLINE_START>>|<<UNDERLINE_END>>|<<QUOTE_START>>|<<QUOTE_END>>|<<PAGE:\d+>>)/g, '');
}

export const getSentences = (text: string) => {
  if (!text) return [];
  return text.split(/(?<=[.!?\n])\s+/).filter(s => s.trim().length > 0);
};

export function getUniqueWords(text: string) {
  if (!text) return [];
  const clean = getCleanText(text);
  // Remove punctuation but keep casing
  const words = clean.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/);
  // Filter out empty, single chars, and duplicates (case-insensitive for uniqueness but keep one version)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of words) {
    const trimmed = w.trim();
    if (trimmed.length > 1 && !seen.has(trimmed.toLowerCase())) {
      seen.add(trimmed.toLowerCase());
      unique.push(trimmed);
    }
  }
  return unique;
}
