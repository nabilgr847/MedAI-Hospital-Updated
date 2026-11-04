import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { Writable } from "stream";

const BUCKET_NAME = "medai_uploads";
async function getMongoose(){return (await import("mongoose")).default;}
async function bucket(){
  const mongoose=await getMongoose();
  const db=mongoose.connection.db;
  if(!db) throw new Error("MongoDB Atlas connection is not ready; file storage is unavailable");
  return new mongoose.mongo.GridFSBucket(db,{bucketName:BUCKET_NAME});
}

/** Store original file bytes in MongoDB Atlas GridFS (not Render's ephemeral filesystem). */
export async function storeGridFSBuffer({buffer,filename,mimeType,metadata={}}){
  if(!Buffer.isBuffer(buffer)||buffer.length===0) throw new Error("Cannot store an empty file");
  const mongoose=await getMongoose();
  const id=new mongoose.Types.ObjectId();
  const upload=(await bucket()).openUploadStream(filename||"upload.bin",{_id:id,contentType:mimeType,metadata:{...metadata,storageProvider:"gridfs",uploadedAt:new Date()}});
  await new Promise((resolve,reject)=>{upload.once("error",reject);upload.once("finish",resolve);upload.end(buffer);});
  return id;
}

export async function deleteGridFSFile(id){
  const mongoose=await getMongoose();
  if(!id||!mongoose.isValidObjectId(String(id))) return;
  try{await (await bucket()).delete(new mongoose.Types.ObjectId(String(id)));}catch(e){if(e.code!=="ENOENT"&&e.code!==26) throw e;}
}

/** Resolve legacy local files or materialize a temporary read-copy from Atlas GridFS. */
export async function resolveStoredFilePath(uploadDir,file){
  if(!file?.storedName || path.basename(file.storedName)!==file.storedName){
    throw Object.assign(new Error("Stored file reference is invalid"),{status:500});
  }
  if(file.storageProvider==="gridfs"){
    const mongoose=await getMongoose();
    if(!mongoose.isValidObjectId(file.storedName)) throw Object.assign(new Error("Atlas file reference is invalid"),{status:500});
    const tempDir=path.join(os.tmpdir(),"medai-gridfs-read-cache");
    await fs.mkdir(tempDir,{recursive:true,mode:0o700});
    const tempPath=path.join(tempDir,`${crypto.randomUUID()}-${path.basename(file.originalName||"file")}`);
    try{await pipeline((await bucket()).openDownloadStream(new mongoose.Types.ObjectId(file.storedName)),createWriteStream(tempPath,{flags:"wx",mode:0o600}));return tempPath;}
    catch(error){await fs.unlink(tempPath).catch(()=>{});if(error.code==="ENOENT"||error.code==="MongoGridFSDownloadError")throw Object.assign(new Error("This uploaded file is unavailable in MongoDB Atlas GridFS. Please upload it again."),{status:410,code:"STORED_FILE_MISSING"});throw error;}
  }
  const filePath=path.join(uploadDir,file.storedName);
  try{await fs.access(filePath);}catch(error){if(error.code==="ENOENT")throw Object.assign(new Error("Legacy uploaded file is missing from local storage. Please upload it again; new uploads are stored in Atlas GridFS."),{status:410,code:"STORED_FILE_MISSING"});throw error;}
  return filePath;
}

export async function readStoredFileBuffer(uploadDir,file){
  if(file?.storageProvider!=="gridfs") return fs.readFile(await resolveStoredFilePath(uploadDir,file));
  const mongoose=await getMongoose();
  if(!mongoose.isValidObjectId(file.storedName)) throw Object.assign(new Error("Atlas file reference is invalid"),{status:500});
  const chunks=[];
  await pipeline((await bucket()).openDownloadStream(new mongoose.Types.ObjectId(file.storedName)),new Writable({write(chunk,_enc,cb){chunks.push(Buffer.from(chunk));cb();}}));
  return Buffer.concat(chunks);
}
