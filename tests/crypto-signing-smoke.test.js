import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,verify,createHash} from "node:crypto";

test("Ed25519 prescription signature detects content changes",()=>{
  const {privateKey,publicKey}=generateKeyPairSync("ed25519");
  const original=Buffer.from(JSON.stringify({patient:"p1",medicine:"example",dose:"doctor-entered"}));
  const signature=sign(null,original,privateKey);
  assert.equal(verify(null,original,publicKey,signature),true);
  const tampered=Buffer.from(JSON.stringify({patient:"p1",medicine:"example",dose:"changed"}));
  assert.equal(verify(null,tampered,publicKey,signature),false);
  assert.notEqual(createHash("sha256").update(original).digest("hex"),createHash("sha256").update(tampered).digest("hex"));
});
