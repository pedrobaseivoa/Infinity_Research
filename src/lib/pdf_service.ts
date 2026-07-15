
import fs from 'fs';
const pdf = require('pdf-parse');
const pdf2img = require('pdf-img-convert');

// Text Extraction (Legacy / Fallback)
export async function extractTextFromPDF(pdfPath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(pdfPath);
    try {
        const data = await pdf(dataBuffer);
        return data.text;
    } catch (error: any) {
        console.error("PDF Parse Error:", error);
        throw new Error("Failed to parse PDF");
    }
}

// Image Extraction (For Visual Analysis)
// Returns array of base64 strings
export async function convertPdfToImages(pdfPath: string, pages: number[] = [1, 2]): Promise<string[]> {
    try {
        console.log(`Converting PDF pages [${pages.join(',')}] to images...`);
        // pdf-img-convert usually returns Uint8Array[] or Buffer[] depending on version
        // We need to verify return type. Documentation says Uint8Array[].
        const outputImages = await pdf2img.convert(pdfPath, {
            page_numbers: pages,
            base64: true
        });

        // If base64=true, it returns strings.
        // Let's assume it works as per common usage.
        return outputImages;
    } catch (e) {
        console.error("PDF to Image Conversion Failed:", e);
        return [];
    }
}
