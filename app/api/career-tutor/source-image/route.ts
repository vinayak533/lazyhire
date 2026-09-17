import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/auth/service";
import { sourcePreviewImage } from "@/lib/career-tutor/evidence";
import { tutorError } from "@/lib/career-tutor/http";
import { privateHeaders } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireSession(getDb(), request);
    const image = await sourcePreviewImage(
      new URL(request.url).searchParams.get("id") ?? "",
    );
    return image
      ? new Response(new Uint8Array(image.body), {
          headers: {
            ...privateHeaders,
            "Content-Type": image.type,
            "X-Content-Type-Options": "nosniff",
          },
        })
      : new Response(null, { status: 404, headers: privateHeaders });
  } catch (error) {
    return tutorError(error);
  }
}
