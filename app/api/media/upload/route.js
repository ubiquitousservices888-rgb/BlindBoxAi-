import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";

export const runtime = "nodejs";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const CLIENT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload;
        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {
          throw new Error("Invalid upload metadata.");
        }

        assertUploadCode(payload.accessCode);

        if (!/^media\/approved\/[a-zA-Z0-9._-]+\.mp4$/.test(pathname)) {
          throw new Error("Invalid media upload destination.");
        }

        return {
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: MAX_VIDEO_SIZE,
          addRandomSuffix: true,
          allowOverwrite: false,
          // Vercel supports signed Blob tokens up to 7 days. Two hours gives
          // mobile uploads enough time to finish while keeping the token short-lived.
          validUntil: Date.now() + CLIENT_TOKEN_TTL_MS,
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify({ kind: "approved-social-video" }),
        };
      },
      onUploadCompleted: async () => {
        // Upload completion does not publish anything. Buffer still requires
        // the explicit approval/publish gate in the video pipeline.
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload authorization failed." },
      { status: 400 },
    );
  }
}
