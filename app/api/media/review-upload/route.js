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

        if (!/^media\/review\/[a-zA-Z0-9._-]+\.mp4$/.test(pathname)) {
          throw new Error("Invalid review upload destination.");
        }

        return {
          allowedContentTypes: ["video/mp4"],
          maximumSizeInBytes: MAX_VIDEO_SIZE,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + CLIENT_TOKEN_TTL_MS,
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify({ kind: "owner-review-video" }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        const createdAt = new Date().toISOString();
        const uploadTimestamp = /^media\/review\/(\d{13})-/.exec(blob.pathname)?.[1];
        const uploadDate = uploadTimestamp
          ? new Date(Number(uploadTimestamp)).toISOString().slice(0, 10)
          : createdAt.slice(0, 10);
        const id = createHash("sha256").update(blob.pathname).digest("hex");
        const event = {
          schemaVersion: 1,
          event: "review_media_upload_completed",
          createdAt,
          message: "Video upload finished and is waiting for owner review. It is not approved or published.",
          mediaUrl: blob.url,
          pathname: blob.pathname,
          contentType: blob.contentType || "video/mp4",
          reviewState: "READY_FOR_REVIEW",
          approved: false,
          piiStored: false,
        };

        await put(
          `owner/notifications/${uploadDate}/${id}.json`,
          JSON.stringify(event, null, 2),
          {
            access: "private",
            contentType: "application/json",
            addRandomSuffix: false,
            allowOverwrite: true,
          },
        );
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review upload authorization failed." },
      { status: 400 },
    );
  }
}
