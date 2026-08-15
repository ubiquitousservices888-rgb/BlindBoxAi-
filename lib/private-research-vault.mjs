import crypto from "node:crypto";

const VAULT_SCHEMA = "blindboxai/owner-private-vault/v1";
const ALGORITHM = "aes-256-gcm";
const AAD = Buffer.from(VAULT_SCHEMA, "utf8");

function vaultKey(value) {
  const encoded = String(value ?? "").trim();
  let key;
  try {
    key = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("MR_RESEARCH_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("MR_RESEARCH_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key");
  }
  return key;
}

export function encryptPrivateResearch(value, keyValue) {
  const key = vaultKey(keyValue);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(AAD);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    schema: VAULT_SCHEMA,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}

export function decryptPrivateResearch(envelopeText, keyValue) {
  const key = vaultKey(keyValue);
  let envelope;
  try {
    envelope = JSON.parse(String(envelopeText));
  } catch {
    throw new Error("Owner-private envelope is not valid JSON");
  }
  if (envelope?.schema !== VAULT_SCHEMA || envelope?.algorithm !== ALGORITHM) {
    throw new Error("Owner-private envelope schema is invalid");
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, "base64"));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error("Owner-private data could not be decrypted with this key");
  }
}

export function createVaultKey() {
  return crypto.randomBytes(32).toString("base64");
}
