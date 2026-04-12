import fs from "fs";

/**
 * Extracts text from PDF or DOCX files.
 */
export async function extractTextFromFile(filePath: string, mimetype: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);

  if (mimetype === "application/pdf") {
    // pdf-parse needs DOMMatrix polyfill in some environments
    if (typeof global !== "undefined" && !(global as any).DOMMatrix) {
      try {
        const canvas = require("@napi-rs/canvas");
        (global as any).DOMMatrix = canvas.DOMMatrix;
      } catch (e) {
        // Fallback or ignore
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
