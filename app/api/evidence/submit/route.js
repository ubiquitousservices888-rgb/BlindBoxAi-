import { head, put } from "@vercel/blob";
import { NextResponse } from "next/server";

import {
  ALLOWED_AUTHENTICITY_BASES,
  ALLOWED_CLASSIFICATIONS,
  ALLOWED_RIGHTS_SOURCES,
  ALLOWED_SERIES,
  ALLOWED_VIEWPOINTS,
  MAX_FILES,
  MAX_FILE_SIZE,
  assertChoice,
  assertClassificationBasis,
  assertSubmissionId,
  assertUploadCode,
  cleanEmail,
  cleanOptionalHttpUrl,
  cleanText,
} from "../../../../lib/evidence";

export const runtime = "nodejs";

export async function POST(request) {
  let data;

  try {
    data = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  try {
    assertUploadCode(data.accessCode);

    const submissionId = assertSubmissionId(
      data.submissionId,
    );

    const series = assertChoice(
      data.series,
      ALLOWED_SERIES,
      "series",
    );

    const viewpoint = assertChoice(
      data.viewpoint,
      ALLOWED_VIEWPOINTS,
      "viewpoint",
    );

    const classification = assertChoice(
      data.classification,
      ALLOWED_CLASSIFICATIONS,
      "classification",
    );

    const rightsSource = assertChoice(
      data.rightsSource,
      ALLOWED_RIGHTS_SOURCES,
      "rights source",
    );

    const authenticityBasis = assertChoice(
      data.authenticityBasis,
      ALLOWED_AUTHENTICITY_BASES,
      "authenticity basis",
    );

    assertClassificationBasis(
      classification,
      authenticityBasis,
    );

    const customSeries =
      series === "other"
        ? cleanText(data.customSeries, 120)
        : "";

    if (series === "other" && !customSeries) {
      throw new Error(
        "Enter the collection or series name.",
      );
    }

    const contributorName = cleanText(
      data.contributorName,
      120,
    );

    const contributorEmail = cleanEmail(
      data.contributorEmail,
    );

    const itemName = cleanText(
      data.itemName,
      160,
    );

    const sourceUrl = cleanOptionalHttpUrl(
      data.sourceUrl,
    );

    const notes = cleanText(
      data.notes,
      1500,
    );

    if (!contributorName) {
      throw new Error(
        "Contributor or photographer name is required.",
      );
    }

    if (!itemName) {
      throw new Error(
        "Item or figure name is required.",
      );
    }

    if (
      rightsSource === "open-license" &&
      !sourceUrl
    ) {
      throw new Error(
        "An open-license submission requires its source URL.",
      );
    }

    if (
      rightsSource === "written-permission" &&
      !sourceUrl &&
      !notes
    ) {
      throw new Error(
        "Describe or link the written permission.",
      );
    }

    const consent = data.consent || {};

    if (
      consent.ownsRights !== true ||
      consent.licenseGrant !== true ||
      consent.noMarketplaceCopy !== true ||
      consent.privacyReviewed !== true
    ) {
      throw new Error(
        "All permission and privacy confirmations are required.",
      );
    }

    if (!Array.isArray(data.uploads)) {
      throw new Error(
        "No uploaded files were supplied.",
      );
    }

    if (
      data.uploads.length < 1 ||
      data.uploads.length > MAX_FILES
    ) {
      throw new Error(
        `Upload between 1 and ${MAX_FILES} images.`,
      );
    }

    const expectedPrefix =
      `evidence/uploads/${submissionId}/`;

    const seenPathnames = new Set();
    const verifiedUploads = [];

    for (const upload of data.uploads) {
      const pathname = cleanText(
        upload?.pathname,
        700,
      );

      if (!pathname.startsWith(expectedPrefix)) {
        throw new Error(
          "An uploaded file belongs to another submission.",
        );
      }

      if (seenPathnames.has(pathname)) {
        throw new Error(
          "The same uploaded file was submitted more than once.",
        );
      }

      seenPathnames.add(pathname);

      const metadata = await head(pathname);

      if (
        !metadata.url.includes(
          ".private.blob.vercel-storage.com/",
        )
      ) {
        throw new Error(
          "An uploaded file is not in private Blob storage.",
        );
      }

      if (
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
        ].includes(metadata.contentType)
      ) {
        throw new Error(
          "An uploaded file has an invalid content type.",
        );
      }

      if (
        !Number.isFinite(metadata.size) ||
        metadata.size < 1 ||
        metadata.size > MAX_FILE_SIZE
      ) {
        throw new Error(
          "An uploaded file has an invalid size.",
        );
      }

      verifiedUploads.push({
        pathname: metadata.pathname,
        url: metadata.url,
        contentType: metadata.contentType,
        size: metadata.size,
        etag: metadata.etag,

        privacyScan: {
          supported:
            upload?.privacyScan?.supported === true,

          detections: Math.max(
            0,
            Math.min(
              100,
              Number(
                upload?.privacyScan?.detections,
              ) || 0,
            ),
          ),
        },
      });
    }

    const manifest = {
      schemaVersion: 1,

      licenseVersion:
        "blindboxai-photo-license-v1-2026-08-06",

      status: "pending-human-review",

      submissionId,
      receivedAt: new Date().toISOString(),

      contributor: {
        name: contributorName,
        email: contributorEmail,
      },

      subject: {
        series,
        customSeries,
        itemName,
        viewpoint,
        classification,
        authenticityBasis,
      },

      rights: {
        source: rightsSource,
        sourceUrl,
        ownsRightsConfirmed: true,
        licenseGranted: true,
        noMarketplaceCopyConfirmed: true,
      },

      privacy: {
        contributorReviewed: true,
        automaticBarcodeScanIsAdvisoryOnly: true,
      },

      notes,
      uploads: verifiedUploads,
    };

    const manifestPath =
      `evidence/manifests/pending/` +
      `${submissionId}.json`;

    await put(
      manifestPath,
      JSON.stringify(manifest, null, 2),
      {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: false,
      },
    );

    return NextResponse.json({
      ok: true,
      submissionId,
      message:
        "Submission received for human review.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Submission failed.",
      },
      { status: 400 },
    );
  }
}
