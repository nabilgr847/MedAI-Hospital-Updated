import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
test("Bangladesh medicine JSON template follows the import schema",async()=>{
  const doc=JSON.parse(await fs.readFile(path.join(root,"data/bangladesh_medicine_import_template.json"),"utf8"));
  assert.equal(doc.schemaVersion,1);
  assert.equal(doc.country,"Bangladesh");
  assert.ok(Array.isArray(doc.medicines)&&doc.medicines.length>0);
  for(const key of ["brand","generic","strength","form","manufacturer","registrationNumber"]) assert.ok(key in doc.medicines[0],`missing ${key}`);
});
