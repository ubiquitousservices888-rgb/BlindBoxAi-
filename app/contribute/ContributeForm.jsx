"use client";

import { upload } from "@vercel/blob/client";
import { useMemo, useState } from "react";

const SERIES = [
  ["hirono-mist-walker", "Hirono Mist-Walker"],
  ["hirono-city-of-mercy", "Hirono City of Mercy"],
  [
    "skullpanda-petals-in-four-acts",
    "SKULLPANDA Petals in Four Acts",
  ],
  [
    "skullpanda-limpressionnisme",
    "SKULLPANDA L'impressionnisme",
  ],
  ["skullpanda-the-mirage", "SKULLPANDA The Mirage"],
  ["skullpanda-the-sound", "SKULLPANDA The Sound"],
  ["skullpanda-you-found-me", "SKULLPANDA You Found Me"],
  ["smiski-series-1", "Smiski Series 1"],
  ["unicorno-series-12", "Unicorno Series 12"],
  ["other", "Other collection or series"],
];

const VIEWPOINTS = [
  ["front", "Front"],
  ["back", "Back"],
  ["face-closeup", "Face and paint close-up"],
  ["base-stamp", "Base stamp or markings"],
  ["security-label", "Security label or verification area"],
  ["card-and-figure", "Identity card beside figure"],
  ["packaging", "Packaging"],
  ["material-stitching", "Material or stitching"],
  ["other", "Other detail"],
];

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid currentColor",
  borderRadius: "8px",
  background: "transparent",
  color: "inherit",
};

const fieldStyle = {
  display: "grid",
  gap: "7px",
  marginBottom: "18px",
};

function createSubmissionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return (
    `${Date.now()}-` +
    Math.random().toString(36).slice(2, 14)
  );
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(
            new Error("Image conversion failed."),
          );
        }
      },
      "image/jpeg",
      quality,
    );
  });
}

async function detectAndRedactBarcodes(
  bitmap,
  canvas,
  context,
) {
  if (
    typeof window === "undefined" ||
    !("BarcodeDetector" in window)
  ) {
    return {
      supported: false,
      detections: 0,
    };
  }

  try {
    const preferredFormats = [
      "qr_code",
      "data_matrix",
      "code_128",
      "code_39",
      "ean_13",
      "ean_8",
      "upc_a",
      "upc_e",
    ];

    const supportedFormats =
      typeof window.BarcodeDetector
        .getSupportedFormats === "function"
        ? await window.BarcodeDetector
            .getSupportedFormats()
        : preferredFormats;

    const selectedFormats =
      preferredFormats.filter((format) =>
        supportedFormats.includes(format),
      );

    if (!selectedFormats.length) {
      return {
        supported: false,
        detections: 0,
      };
    }

    const detector =
      new window.BarcodeDetector({
        formats: selectedFormats,
      });

    const results =
      await detector.detect(bitmap);

    const scaleX =
      canvas.width / bitmap.width;

    const scaleY =
      canvas.height / bitmap.height;

    for (const result of results) {
      const box = result.boundingBox;
      const padding = 16;

      const x = Math.max(
        0,
        box.x * scaleX - padding,
      );

      const y = Math.max(
        0,
        box.y * scaleY - padding,
      );

      const width = Math.min(
        canvas.width - x,
        box.width * scaleX + padding * 2,
      );

      const height = Math.min(
        canvas.height - y,
        box.height * scaleY + padding * 2,
      );

      const temporary =
        document.createElement("canvas");

      temporary.width = Math.max(
        1,
        Math.ceil(width),
      );

      temporary.height = Math.max(
        1,
        Math.ceil(height),
      );

      const temporaryContext =
        temporary.getContext("2d");

      temporaryContext.drawImage(
        canvas,
        x,
        y,
        width,
        height,
        0,
        0,
        width,
        height,
      );

      context.save();
      context.filter = "blur(26px)";

      context.drawImage(
        temporary,
        0,
        0,
        width,
        height,
        x,
        y,
        width,
        height,
      );

      context.restore();

      context.fillStyle =
        "rgba(0, 0, 0, 0.35)";

      context.fillRect(
        x,
        y,
        width,
        height,
      );
    }

    return {
      supported: true,
      detections: results.length,
    };
  } catch {
    return {
      supported: false,
      detections: 0,
    };
  }
}

async function prepareImage(file) {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      `${file.name}: unsupported file type.`,
    );
  }

  if (file.size > 20 * 1024 * 1024) {
    throw new Error(
      `${file.name}: original file exceeds 20 MB.`,
    );
  }

  const bitmap =
    await createImageBitmap(file);

  const maximumDimension = 2200;

  const scale = Math.min(
    1,
    maximumDimension /
      Math.max(
        bitmap.width,
        bitmap.height,
      ),
  );

  const canvas =
    document.createElement("canvas");

  canvas.width = Math.max(
    1,
    Math.round(bitmap.width * scale),
  );

  canvas.height = Math.max(
    1,
    Math.round(bitmap.height * scale),
  );

  const context =
    canvas.getContext("2d", {
      alpha: false,
    });

  if (!context) {
    bitmap.close?.();

    throw new Error(
      `${file.name}: canvas processing is unavailable.`,
    );
  }

  context.fillStyle = "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height,
  );

  context.drawImage(
    bitmap,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const privacyScan =
    await detectAndRedactBarcodes(
      bitmap,
      canvas,
      context,
    );

  bitmap.close?.();

  let output =
    await canvasToBlob(canvas, 0.86);

  if (
    output.size >
    7.5 * 1024 * 1024
  ) {
    output =
      await canvasToBlob(
        canvas,
        0.68,
      );
  }

  if (
    output.size >
    8 * 1024 * 1024
  ) {
    throw new Error(
      `${file.name}: processed image remains too large.`,
    );
  }

  const baseName =
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-z0-9-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 60) || "photo";

  const cleanedFile = new File(
    [output],
    `${baseName}-privacy-clean.jpg`,
    {
      type: "image/jpeg",
    },
  );

  return {
    file: cleanedFile,
    privacyScan,
  };
}

export default function ContributeForm() {
  const [status, setStatus] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [series, setSeries] =
    useState("hirono-mist-walker");

  const [files, setFiles] =
    useState([]);

  const fileSummary = useMemo(() => {
    if (!files.length) {
      return "No images selected";
    }

    return (
      `${files.length} image` +
      `${files.length === 1 ? "" : "s"} selected`
    );
  }, [files]);

  async function submit(event) {
    event.preventDefault();

    setStatus("");
    setProgress(0);

    const form = event.currentTarget;
    const values = new FormData(form);

    if (
      files.length < 1 ||
      files.length > 6
    ) {
      setStatus(
        "Select between 1 and 6 images.",
      );

      return;
    }

    setBusy(true);

    try {
      const submissionId =
        createSubmissionId();

      const accessCode =
        String(
          values.get("accessCode") || "",
        ).trim();

      const viewpoint =
        String(
          values.get("viewpoint") || "",
        );

      const uploaded = [];

      for (
        let index = 0;
        index < files.length;
        index += 1
      ) {
        setStatus(
          `Preparing image ${index + 1} ` +
            `of ${files.length}...`,
        );

        const prepared =
          await prepareImage(files[index]);

        const pathname =
          `evidence/uploads/` +
          `${submissionId}/` +
          `${viewpoint}-${index}.jpg`;

        const blob = await upload(
          pathname,
          prepared.file,
          {
            access: "private",

            handleUploadUrl:
              "/api/evidence/upload",

            clientPayload:
              JSON.stringify({
                accessCode,
                submissionId,
                viewpoint,
                fileIndex: index,
              }),

            onUploadProgress: ({
              percentage,
            }) => {
              const completedFraction =
                index / files.length;

              const currentFraction =
                (percentage / 100) /
                files.length;

              setProgress(
                Math.round(
                  (
                    completedFraction +
                    currentFraction
                  ) * 100,
                ),
              );
            },
          },
        );

        uploaded.push({
          url: blob.url,
          pathname: blob.pathname,
          privacyScan:
            prepared.privacyScan,
        });
      }

      setStatus(
        "Saving permission and review record...",
      );

      const response = await fetch(
        "/api/evidence/submit",
        {
          method: "POST",

          headers: {
            "content-type":
              "application/json",
          },

          body: JSON.stringify({
            accessCode,
            submissionId,

            contributorName:
              values.get(
                "contributorName",
              ),

            contributorEmail:
              values.get(
                "contributorEmail",
              ),

            series:
              values.get("series"),

            customSeries:
              values.get(
                "customSeries",
              ),

            itemName:
              values.get("itemName"),

            viewpoint,

            classification:
              values.get(
                "classification",
              ),

            rightsSource:
              values.get(
                "rightsSource",
              ),

            authenticityBasis:
              values.get(
                "authenticityBasis",
              ),

            sourceUrl:
              values.get("sourceUrl"),

            notes:
              values.get("notes"),

            consent: {
              ownsRights:
                values.get(
                  "ownsRights",
                ) === "on",

              licenseGrant:
                values.get(
                  "licenseGrant",
                ) === "on",

              noMarketplaceCopy:
                values.get(
                  "noMarketplaceCopy",
                ) === "on",

              privacyReviewed:
                values.get(
                  "privacyReviewed",
                ) === "on",
            },

            uploads: uploaded,
          }),
        },
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Submission failed.",
        );
      }

      setProgress(100);

      setStatus(
        `Received. Review ID: ` +
          `${result.submissionId}`,
      );

      form.reset();
      setFiles([]);

      setSeries(
        "hirono-mist-walker",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Submission failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div style={fieldStyle}>
        <label htmlFor="accessCode">
          Private submission access code
        </label>

        <input
          id="accessCode"
          name="accessCode"
          type="password"
          required
          autoComplete="off"
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="contributorName">
          Contributor or photographer name
        </label>

        <input
          id="contributorName"
          name="contributorName"
          required
          maxLength={120}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="contributorEmail">
          Contact email — optional
        </label>

        <input
          id="contributorEmail"
          name="contributorEmail"
          type="email"
          maxLength={160}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="series">
          Collection or series
        </label>

        <select
          id="series"
          name="series"
          value={series}
          onChange={(event) =>
            setSeries(
              event.target.value,
            )
          }
          style={inputStyle}
        >
          {SERIES.map(
            ([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ),
          )}
        </select>
      </div>

      {series === "other" && (
        <div style={fieldStyle}>
          <label htmlFor="customSeries">
            Enter the collection or series
          </label>

          <input
            id="customSeries"
            name="customSeries"
            required
            maxLength={120}
            style={inputStyle}
          />
        </div>
      )}

      <div style={fieldStyle}>
        <label htmlFor="itemName">
          Item or figure name
        </label>

        <input
          id="itemName"
          name="itemName"
          required
          maxLength={160}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="viewpoint">
          Photo detail
        </label>

        <select
          id="viewpoint"
          name="viewpoint"
          style={inputStyle}
        >
          {VIEWPOINTS.map(
            ([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ),
          )}
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="classification">
          How should reviewers treat
          these photos?
        </label>

        <select
          id="classification"
          name="classification"
          style={inputStyle}
        >
          <option
            value="verified-genuine-reference"
          >
            Verified-genuine reference
          </option>

          <option
            value="warning-sign-example"
          >
            Warning-sign example —
            not proof by itself
          </option>

          <option
            value="unclassified-review"
          >
            Unclassified — reviewer
            must determine use
          </option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="authenticityBasis">
          Basis for the classification
        </label>

        <select
          id="authenticityBasis"
          name="authenticityBasis"
          style={inputStyle}
        >
          <option
            value="official-verification-result"
          >
            Official verification result
          </option>

          <option
            value="authorized-retailer-purchase"
          >
            Purchased from an
            authorized retailer
          </option>

          <option
            value="documented-provenance"
          >
            Documented purchase or
            ownership provenance
          </option>

          <option
            value="visual-warning-only"
          >
            Visual warning only —
            not authenticated
          </option>

          <option value="unknown">
            Unknown — reviewer must
            investigate
          </option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="rightsSource">
          Why do you have permission
          to submit the photos?
        </label>

        <select
          id="rightsSource"
          name="rightsSource"
          style={inputStyle}
        >
          <option value="photographer">
            I took the photographs
          </option>

          <option
            value="copyright-owner"
          >
            I own the photograph
            copyright
          </option>

          <option
            value="written-permission"
          >
            I have written permission
            from the copyright owner
          </option>

          <option value="open-license">
            The photographs have a
            verified reuse license
          </option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="sourceUrl">
          Permission or open-license
          source URL — when applicable
        </label>

        <input
          id="sourceUrl"
          name="sourceUrl"
          type="url"
          maxLength={500}
          style={inputStyle}
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="photos">
          Photos — 1 to 6 JPEG, PNG,
          or WebP files
        </label>

        <input
          id="photos"
          name="photos"
          type="file"
          accept={
            "image/jpeg," +
            "image/png," +
            "image/webp"
          }
          multiple
          required
          onChange={(event) => {
            const selected =
              Array.from(
                event.target.files ||
                  [],
              ).slice(0, 6);

            setFiles(selected);
          }}
          style={inputStyle}
        />

        <small>
          {fileSummary}. Images are
          resized, converted to JPEG,
          and stripped of embedded
          metadata before upload.
        </small>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="notes">
          Provenance, verification,
          permission, or comparison notes
        </label>

        <textarea
          id="notes"
          name="notes"
          rows={6}
          maxLength={1500}
          style={inputStyle}
        />
      </div>

      <fieldset
        style={{
          margin: "24px 0",
          padding: "16px",
          border:
            "1px solid currentColor",
          borderRadius: "12px",
        }}
      >
        <legend>
          Required permission and
          privacy confirmations
        </legend>

        <label
          style={{
            display: "block",
            margin: "12px 0",
            lineHeight: 1.5,
          }}
        >
          <input
            name="ownsRights"
            type="checkbox"
            required
          />{" "}
          I took these photographs,
          own the rights, have written
          permission, or verified an
          applicable reuse license.
        </label>

        <label
          style={{
            display: "block",
            margin: "12px 0",
            lineHeight: 1.5,
          }}
        >
          <input
            name="licenseGrant"
            type="checkbox"
            required
          />{" "}
          I grant BlindBoxAI a
          non-exclusive, worldwide,
          royalty-free license to store,
          crop, resize, annotate, redact,
          display, and publish these
          photographs for its
          collector-reference content.
        </label>

        <label
          style={{
            display: "block",
            margin: "12px 0",
            lineHeight: 1.5,
          }}
        >
          <input
            name="noMarketplaceCopy"
            type="checkbox"
            required
          />{" "}
          These are not copied eBay,
          marketplace, retailer, or
          social-media listing photos
          unless I separately hold
          documented permission or a
          valid reuse license.
        </label>

        <label
          style={{
            display: "block",
            margin: "12px 0",
            lineHeight: 1.5,
          }}
        >
          <input
            name="privacyReviewed"
            type="checkbox"
            required
          />{" "}
          I reviewed the images for
          names, addresses, receipts,
          order numbers, complete
          verification codes, and other
          personal information.
          Automatic QR and barcode
          detection is only an
          additional aid and may miss
          details.
        </label>
      </fieldset>

      {busy && (
        <progress
          value={progress}
          max="100"
          style={{
            width: "100%",
            marginBottom: "12px",
          }}
        />
      )}

      <button
        type="submit"
        disabled={busy}
        style={{
          padding: "12px 18px",
          border:
            "1px solid currentColor",
          borderRadius: "999px",
          fontWeight: 700,
          cursor:
            busy ? "wait" : "pointer",
        }}
      >
        {busy
          ? "Submitting…"
          : "Submit for private review"}
      </button>

      {status && (
        <p
          role="status"
          style={{
            marginTop: "16px",
            padding: "12px",
            border:
              "1px solid currentColor",
            borderRadius: "8px",
            lineHeight: 1.5,
          }}
        >
          {status}
        </p>
      )}
    </form>
  );
}
