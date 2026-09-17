import AdmZip from "adm-zip";
import mammoth from "mammoth";
import type { ParsedCv } from "./types";

export class CvParseError extends Error {}
export const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function parseCv(
  buffer: Buffer,
  filename: string,
): Promise<ParsedCv> {
  if (!buffer.length || buffer.length > MAX_CV_BYTES)
    throw new CvParseError("Choose a PDF or DOCX file under 5 MB.");
  const extension = filename.split(".").pop()?.toLowerCase();
  let text = "",
    pages: number | null = null,
    hasTables: boolean | null = null;
  const warnings: string[] = [];
  try {
    if (extension === "pdf" && buffer.subarray(0, 5).toString() === "%PDF-") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const info = await parser.getInfo();
        pages = info.total;
        if (pages > 10)
          throw new CvParseError("Please upload a CV with 10 pages or fewer.");
        text = (await parser.getText({ pageJoiner: "\n\n", lineEnforce: true }))
          .text;
        // Plain text cannot reliably prove that a PDF has no tables or columns.
        warnings.push(
          "PDF tables and reading order need a visual check; text extraction cannot confirm ATS compatibility.",
        );
      } finally {
        await parser.destroy();
      }
    } else if (
      extension === "docx" &&
      buffer.subarray(0, 2).toString() === "PK"
    ) {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();
      if (
        entries.length > 1000 ||
        entries.reduce((sum, entry) => sum + entry.header.size, 0) >
          20 * 1024 * 1024
      )
        throw new CvParseError(
          "This document expands beyond the processing limit. Export a simpler PDF or DOCX.",
        );
      const document = zip.getEntry("word/document.xml");
      if (!document)
        throw new CvParseError("This file is not a valid Word DOCX document.");
      hasTables = /<w:tbl[\s>]/.test(document.getData().toString("utf8"));
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      if (result.messages.length)
        warnings.push(
          "Some Word formatting could not be extracted; review the text below.",
        );
    } else
      throw new CvParseError(
        "The file content must be a genuine PDF or DOCX document.",
      );
  } catch (error) {
    if (error instanceof CvParseError) throw error;
    throw new CvParseError(
      "This document could not be read. Try an unencrypted PDF or a fresh DOCX export.",
    );
  }
  text = text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length > 70_000)
    throw new CvParseError(
      "This CV contains too much text. Please use a shorter document.",
    );
  const imageOnly = text.replace(/\s/g, "").length < 50;
  if (imageOnly)
    warnings.push(
      "Very little readable text was found. This may be an image-only scan; export with selectable text. OCR is not included.",
    );
  return {
    text,
    format: extension as "pdf" | "docx",
    pages,
    hasTables,
    imageOnly,
    warnings,
  };
}
