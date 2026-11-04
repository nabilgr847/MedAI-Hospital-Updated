import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import {resolveStoredFilePath} from "../apps/api/src/fileStorage.js";

test("resolves a stored file that exists",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"medai-file-test-"));
  try{
    await fs.writeFile(path.join(dir,"report.jpg"),Buffer.from("test"));
    assert.equal(await resolveStoredFilePath(dir,{storedName:"report.jpg"}),path.join(dir,"report.jpg"));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test("returns an actionable 410 when stored file bytes are missing",async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"medai-file-test-"));
  try{
    await assert.rejects(()=>resolveStoredFilePath(dir,{storedName:"missing.jpg"}),error=>error.status===410&&error.code==="STORED_FILE_MISSING");
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test("rejects path traversal in stored file metadata",async()=>{
  await assert.rejects(()=>resolveStoredFilePath(os.tmpdir(),{storedName:"../secret.txt"}),error=>error.status===500);
});
