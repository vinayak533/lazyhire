import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { cvUploads } from "@/lib/db/schema";
import { CvParseError, MAX_CV_BYTES, parseCv } from "@/lib/cv/parser";
import { scoreCv } from "@/lib/cv/rules";
import { readLimitedBody } from "@/lib/http";
import { requireSession, verifyCsrf } from "@/lib/auth/service";
import { audit } from "@/lib/security/audit";
import { encryptJson, encryptText } from "@/lib/security/crypto";
import { authError, forbidden, jsonResponse } from "@/lib/security/http";
import { scanUploadedCv, UploadSecurityError } from "@/lib/security/uploads";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const db = getDb();
  try {
    const session = requireSession(db, request);
    verifyCsrf(request, session);
    const bytes = await readLimitedBody(request, MAX_CV_BYTES + 100_000);
    const form = await new Response(Buffer.from(bytes), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new CvParseError("Please choose a PDF or DOCX file.");
    const filename = file.name
      .split(/[\\/]/)
      .pop()!
      .replace(/[\u0000-\u001f]/g, "")
      .slice(0, 180);
    const buffer = Buffer.from(await file.arrayBuffer());
    scanUploadedCv(buffer, filename, file.type);
    const parsed = await parseCv(
      buffer,
      filename,
    );
    const analysis = scoreCv(parsed);
    const id = randomUUID();
    const result = { id, filename, parsed, analysis };
    db.insert(cvUploads)
      .values({
        id,
        userId: session.userId,
        filename,
        textCiphertext: encryptText(parsed.text),
        resultJson: encryptJson(result),
        fileSha256: createHash("sha256").update(buffer).digest("hex"),
        mimeType: file.type || "application/octet-stream",
        scanStatus: "passed",
        createdAt: new Date(),
      })
      .run();
    audit(db, request, "cv.uploaded", session.userId, {
      cvId: id,
      mimeType: file.type || null,
    });
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_REQUIRED")
      return authError();
    if (error instanceof Error && error.message === "CSRF_INVALID")
      return forbidden("Refresh the page and try again.");
    const tooLarge =
      error instanceof Error && error.message === "BODY_TOO_LARGE";
    const message = tooLarge
      ? "Choose a file under 5 MB."
      : error instanceof UploadSecurityError
        ? error.message
      : error instanceof CvParseError
        ? error.message
        : "The CV could not be analyzed. Check the file and try again.";
    return jsonResponse(
      { error: { message } },
      {
        status:
          tooLarge || error instanceof UploadSecurityError
            ? 413
            : error instanceof CvParseError
              ? 422
              : 400,
      },
    );
  }
}
