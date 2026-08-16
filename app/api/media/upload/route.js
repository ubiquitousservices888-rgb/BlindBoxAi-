import { put } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { assertUploadCode } from "../../../../lib/evidence";

export const runtime = "nodejs";

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

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
          validUntil: Date.now() + 10 * 60 * 1000,
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify({ kind: "approved-social-video" }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        const createdAt = new Date().toISOString();
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
          const date = createdAt.slice(0, 10);
          const id = `${Date.now().toString(36)}-${randomUUID().replaceAll("-", "")}`;
          await put(
            `owner/notifications/${date}/${id}.json`,
            JSON.stringify(event, null, 2),
            {
              access: "private",
              contentType: "application/json",
              addRandomSuffix: false,
              allowOverwrite: false,
            },
          );
        } catch (cause) {
          console.error("owner_upload_notification_failed", {
            pathname: blob.pathname,
            message: cause instanceof Error ? cause.message : "Unknown notification error",
          });
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
