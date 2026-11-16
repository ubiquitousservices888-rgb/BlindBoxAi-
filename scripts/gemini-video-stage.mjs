// Intentionally disabled. Legacy environment opt-ins are not spending approval.
// Re-enable only with an owner-approved action and a verified max-dollar guard
// enforced before any Gemini request or upload.
console.error("Gemini rendering is disabled until owner approval and a max-dollar check are implemented and verified. No render or upload was attempted.");
process.exitCode = 1;
