import AdmZip from "adm-zip";
import { MAX_CV_BYTES } from "@/lib/cv/parser";

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export class UploadSecurityError extends Error {}

export function scanUploadedCv(
  buffer: Buffer,
  filename: string,
  contentType: string,
) {
  if (!buffer.length || buffer.length > MAX_CV_BYTES)
    throw new UploadSecurityError("Choose a PDF or DOCX file under 5 MB.");
  const normalized = filename.normalize("NFKC").toLowerCase();
  if (
    /[\\/:\u0000-\u001f]/.test(normalized) ||
    normalized.split(".").length !== 2 ||
    !/\.(pdf|docx)$/.test(normalized)
  )
    throw new UploadSecurityError("Only simple .pdf or .docx filenames are allowed.");
  if (contentType && !allowedMimeTypes.has(contentType))
    throw new UploadSecurityError("The uploaded file type does not match PDF or DOCX.");
  const isPdf = normalized.endsWith(".pdf");
  if (isPdf && buffer.subarray(0, 5).toString() !== "%PDF-")
    throw new UploadSecurityError("The file content must be a genuine PDF document.");
  if (!isPdf && buffer.subarray(0, 2).toString() !== "PK")
    throw new UploadSecurityError("The file content must be a genuine DOCX document.");
  if (isPdf) {
    const sample = buffer.subarray(0, 1_000_000).toString("latin1");
    if (/\/(?:JavaScript|JS|OpenAction|Launch|EmbeddedFile|RichMedia)\b/i.test(sample))
      throw new UploadSecurityError("This PDF contains active or embedded content.");
  } else {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    if (
      entries.some((entry) =>
        /^word\/vbaProject\.bin$/i.test(entry.entryName) ||
        /(^|\/)(?:_rels\/)?[^/]+\.rels$/i.test(entry.entryName) &&
          /TargetMode="External"/i.test(entry.getData().toString("utf8")),
      )
    )
      throw new UploadSecurityError("This DOCX contains macros or external relationships.");
  }
}
