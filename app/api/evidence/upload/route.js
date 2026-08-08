import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import {
  ALLOWED_VIEWPOINTS,
  MAX_FILES,
  MAX_FILE_SIZE,
  assertChoice,
  assertSubmissionId,
  assertUploadCode,
} from "../../../../lib/evidence";

export const runtime = "nodejs";

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  try {
    const response = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (
        pathname,
        clientPayload,
      ) => {
        let payload;

        try {
          payload = JSON.parse(clientPayload || "{}");
        } catch {
          throw new Error("Invalid upload metadata.");
        }

        assertUploadCode(payload.accessCode);

        const submissionId = assertSubmissionId(
          payload.submissionId,
        );

        const viewpoint = assertChoice(
          payload.viewpoint,
          ALLOWED_VIEWPOINTS,
          "viewpoint",
        );

        const fileIndex = Number(payload.fileIndex);

        if (
          !Number.isInteger(fileIndex) ||
          fileIndex < 0 ||
          fileIndex >= MAX_FILES
        ) {
          throw new Error("Invalid file index.");
        }

        const expectedPath =
          `evidence/uploads/${submissionId}/` +
          `${viewpoint}-${fileIndex}.jpg`;

        if (pathname !== expectedPath) {
          throw new Error("Invalid upload destination.");
        }

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
          ],
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,

          tokenPayload: JSON.stringify({
            submissionId,
            viewpoint,
            fileIndex,
          }),
        };
      },

      onUploadCompleted: async () => {
        /*
         * No publication or classification happens here.
         * The manifest route independently verifies every Blob.
         */
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Upload authorization failed.",
      },
      { status: 400 },
    );
  }
}
