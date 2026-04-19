import fs from "fs";

/**
 * Extracts text from PDF or DOCX files.
 */
export async function extractTextFromFile(filePath: string, mimetype: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  if (mimetype === "application/pdf") {
    // pdf-parse/pdfjs-dist needs DOMMatrix polyfill at load time in many environments
    if (typeof global !== "undefined" && !(global as any).DOMMatrix) {
      try {
        // Try real canvas first
        const canvas = require("@napi-rs/canvas");
        (global as any).DOMMatrix = canvas.DOMMatrix;
      } catch (e) {
        // Minimal dummy polyfill to prevent top-level ReferenceError in pdfjs-dist
        (global as any).DOMMatrix = class DOMMatrix {
          constructor() {}
          static fromFloat32Array() { return new DOMMatrix(); }
          static fromFloat64Array() { return new DOMMatrix(); }
          multiply() { return this; }
          translate() { return this; }
          scale() { return this; }
          rotate() { return this; }
          inverse() { return this; }
        };
      }
    }
    const pdf = require("pdf-parse");
    const data = await pdf(buffer);
    return data.text;
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimetype === "application/msword"
  ) {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimetype.startsWith("text/")) {
    return buffer.toString("utf-8");
  }

  throw new Error(`Mimetype ${mimetype} tidak didukung untuk ekstraksi teks.`);
}
