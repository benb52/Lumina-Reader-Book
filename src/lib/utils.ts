import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCleanText(text: string) {
  if (!text) return '';
  return text.replace(/(<<BOLD_START>>|<<BOLD_END>>|<<UNDERLINE_START>>|<<UNDERLINE_END>>|<<QUOTE_START>>|<<QUOTE_END>>|<<PAGE:\d+>>)/g, '');
}
