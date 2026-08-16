import { put } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { createHash } from "node:crypto";
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
      onUploadCompleted: async ({ blob }) => {
        const createdAt = new Date().toISOString();
        const uploadTimestamp = /^media\/approved\/(\d{13})-/.exec(blob.pathname)?.[1];
        const uploadDate = uploadTimestamp
          ? new Date(Number(uploadTimestamp)).toISOString().slice(0, 10)
          : createdAt.slice(0, 10);
        const id = createHash("sha256").update(blob.pathname).digest("hex");
        const event = {
          schemaVersion: 1,
          event: "approved_media_upload_completed",
          createdAt,
          message: "Approved social video finished uploading and is ready for the publish gate.",
          mediaUrl: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType || "video/mp4",
          piiStored: false,
        };

        try {
          await put(
            `owner/notifications/${uploadDate}/${id}.json`,
            JSON.stringify(event, null, 2),
            {
              access: "private",
              contentType: "application/json",
              addRandomSuffix: false,
              // Callback retries replace the same media-specific notice
              // instead of creating duplicates or failing on a conflict.
              allowOverwrite: true,
            },
          );
        } catch (cause) {
          console.error("owner_upload_notification_failed", {
            pathname: blob.pathname,
            message: cause instanceof Error ? cause.message : "Unknown notification error",
          });
          // A non-success callback response lets Vercel retry instead of
          // permanently acknowledging an upload whose owner notice was lost.
          throw cause;
        }
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
