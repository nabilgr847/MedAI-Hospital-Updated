import test from "node:test";
import assert from "node:assert/strict";
import { escapeRegex, detectMimeFromBytes } from "../apps/api/src/util.js";

test("escapeRegex neutralises regex metacharacters", () => {
  const re = new RegExp(escapeRegex("(a+)+$"), "i");
  assert.equal(re.test("x(a+)+$y"), true);
  assert.equal(re.test("aaaa"), false);
  assert.equal(escapeRegex("a.b*c"), "a\\.b\\*c");
});

test("detectMimeFromBytes recognises real file signatures only", () => {
  assert.equal(detectMimeFromBytes(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(detectMimeFromBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "image/jpeg");
  assert.equal(detectMimeFromBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectMimeFromBytes(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "image/webp");
  assert.equal(detectMimeFromBytes(Buffer.from("RIFF\0\0\0\0WAVEfmt ", "latin1")), "audio/wav");
  assert.equal(detectMimeFromBytes(Buffer.from("OggS")), "audio/ogg");
  assert.equal(detectMimeFromBytes(Buffer.from("ID3")), "audio/mpeg");
  assert.equal(detectMimeFromBytes(Buffer.from("<html><script>alert(1)</script>")), null);
});
