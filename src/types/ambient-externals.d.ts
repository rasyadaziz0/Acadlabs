declare module "pdf-parse" {
  export type PdfParseInput = Buffer | Uint8Array | ArrayBuffer;
  export interface PdfParseResult {
    text?: string;
    [key: string]: unknown;
  }
  const pdfParse: (dataBuffer: PdfParseInput) => Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  export type PdfParseInput = Buffer | Uint8Array | ArrayBuffer;
  export interface PdfParseResult {
    text?: string;
    [key: string]: unknown;
  }
  const pdfParse: (dataBuffer: PdfParseInput) => Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "mammoth" {
  export function extractRawText(input: { buffer: Buffer }): Promise<{ value: string }>;
}

declare module "jszip" {
  export interface JSZipObject {
    async(type: "uint8array"): Promise<Uint8Array>;
  }
  export interface JSZipInstance {
    files: Record<string, JSZipObject>;
  }
  const JSZip: {
    loadAsync(data: Buffer | Uint8Array | ArrayBuffer): Promise<JSZipInstance>;
  };
  export default JSZip;
}

declare module "tesseract.js" {
  export interface RecognizeData { text?: string }
  export interface RecognizeResult { data: RecognizeData }
  export function recognize(
    image: Buffer | Uint8Array | ArrayBuffer | string,
    lang?: string,
    options?: Record<string, unknown>
  ): Promise<RecognizeResult>;
}
