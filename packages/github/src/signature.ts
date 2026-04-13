import crypto from "node:crypto";

export function verifyWebhookSignature(input: {
  secret: string;
  payload: string | Buffer;
  signatureHeader: string | null;
}): boolean {
  if (!input.signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", input.secret)
    .update(input.payload)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(input.signatureHeader, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
