import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker path to use the local one provided by the package
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = '';
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    
    // Simple extraction for now, ignoring layout analysis for prototype speed
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
      
    fullText += `<<PAGE:${i}>>\n${pageText}\n<<LUMINA_PAGE_BREAK>>\n`;
  }

  return fullText;
};

export const extractTextFromTXT = async (file: File): Promise<string> => {
  const text = await file.text();
  // Simple pagination logic for TXT: split by 2000 chars
  const chunkSize = 2000;
  let fullText = '';
  let pageNum = 1;
  
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.substring(i, i + chunkSize);
    fullText += `<<PAGE:${pageNum}>>\n${chunk}\n<<LUMINA_PAGE_BREAK>>\n`;
    pageNum++;
  }
  
  return fullText;
};
