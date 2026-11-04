import path from "path";
import os from "os";
import fs from "fs/promises";
import crypto from "crypto";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { Writable } from "stream";

const BUCKET_NAME = "medai_uploads";
const GRIDFS_MISSING = () => Object.assign(
  new Error("This uploaded file is not present in the configured MongoDB Atlas GridFS bucket. Check the database/bucket and upload the file again."),
  { status: 410, code: "STORED_FILE_MISSING" }
);

async function getMongoose() { return (await import("mongoose")).default; }
async function bucket() {
  const mongoose = await getMongoose();
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) {
    throw Object.assign(new Error("MongoDB connection is not ready; private file storage is unavailable"), { status: 503, code: "MONGODB_NOT_READY" });
  }
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
}

function validObjectId(mongoose, value) {
  return Boolean(value && mongoose.isValidObjectId(String(value)));
}

async function findGridFSFile(id) {
  const mongoose = await getMongoose();
  if (!validObjectId(mongoose, id)) throw Object.assign(new Error("Atlas GridFS file reference is invalid"), { status: 500, code: "INVALID_GRIDFS_ID" });
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) {
    throw Object.assign(new Error("MongoDB connection is not ready; private file storage is unavailable"), { status: 503, code: "MONGODB_NOT_READY" });
  }
  const file = await db.collection(`${BUCKET_NAME}.files`).findOne({ _id: new mongoose.Types.ObjectId(String(id)) });
  if (!file) throw GRIDFS_MISSING();
  return { mongoose, db, file };
}

/** Store bytes in Atlas GridFS and verify that the completed file is readable. */
export async function storeGridFSBuffer({ buffer, filename, mimeType, metadata = {} }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error("Cannot store an empty file");
  const mongoose = await getMongoose();
  const id = new mongoose.Types.ObjectId();
  const grid = await bucket();
  const upload = grid.openUploadStream(filename || "upload.bin", {
    _id: id,
    contentType: mimeType,
    metadata: { ...metadata, storageProvider: "gridfs", uploadedAt: new Date() }
  });
  await new Promise((resolve, reject) => {
    upload.once("error", reject);
    upload.once("finish", resolve);
    upload.end(buffer);
  });

  try {
    const { file } = await findGridFSFile(id);
    if (Number(file.length) !== buffer.length) throw new Error("GridFS verification failed: stored file size does not match uploaded size");
    // Verify chunks can actually be read before returning a PrivateFile reference.
    const stored = await readGridFSBuffer(String(id));
    if (stored.length !== buffer.length || !crypto.timingSafeEqual(
      crypto.createHash("sha256").update(stored).digest(),
      crypto.createHash("sha256").update(buffer).digest()
    )) throw new Error("GridFS verification failed: downloaded bytes do not match uploaded bytes");
    return id;
  } catch (error) {
    await deleteGridFSFile(id).catch(() => {});
    throw error;
  }
}

export async function deleteGridFSFile(id) {
  const mongoose = await getMongoose();
  if (!validObjectId(mongoose, id)) return;
  try {
    await (await bucket()).delete(new mongoose.Types.ObjectId(String(id)));
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== 26 && error.code !== "FileNotFound") throw error;
  }
}

async function readGridFSBuffer(id) {
  const { mongoose, file } = await findGridFSFile(id);
  const chunks = [];
  try {
    await pipeline(
      (await bucket()).openDownloadStream(new mongoose.Types.ObjectId(String(id))),
      new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } })
    );
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "MongoGridFSDownloadError" || /FileNotFound|file .* was not found/i.test(error.message || "")) {
      throw GRIDFS_MISSING();
    }
    throw error;
  }
  const result = Buffer.concat(chunks);
  if (result.length !== Number(file.length)) throw Object.assign(new Error("GridFS file is incomplete: downloaded size does not match its file record"), { status: 410, code: "GRIDFS_INCOMPLETE" });
  return result;
}

/** Resolve legacy local files or materialize a temporary read-copy from Atlas GridFS. */
export async function resolveStoredFilePath(uploadDir, file) {
  if (!file?.storedName || path.basename(file.storedName) !== file.storedName) {
    throw Object.assign(new Error("Stored file reference is invalid"), { status: 500, code: "INVALID_STORED_FILE" });
  }
  if (file.storageProvider === "gridfs") {
    const data = await readGridFSBuffer(file.storedName);
    const tempDir = path.join(os.tmpdir(), "medai-gridfs-read-cache");
    await fs.mkdir(tempDir, { recursive: true, mode: 0o700 });
    const safeName = path.basename(file.originalName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    const tempPath = path.join(tempDir, `${crypto.randomUUID()}-${safeName}`);
    await fs.writeFile(tempPath, data, { flag: "wx", mode: 0o600 });
    return tempPath;
  }
  const filePath = path.join(uploadDir, file.storedName);
  try {
    await fs.access(filePath);
  } catch (error) {
    if (error.code === "ENOENT") throw Object.assign(
      new Error("Legacy uploaded file is missing from local storage. Please upload it again; new uploads are stored in Atlas GridFS."),
      { status: 410, code: "STORED_FILE_MISSING" }
    );
    throw error;
  }
  return filePath;
}

export async function readStoredFileBuffer(uploadDir, file) {
  if (!file?.storedName) throw Object.assign(new Error("Stored file reference is missing"), { status: 500, code: "INVALID_STORED_FILE" });
  if (file.storageProvider === "gridfs") return readGridFSBuffer(file.storedName);
  return fs.readFile(await resolveStoredFilePath(uploadDir, file));
}

/** Safe diagnostics for server logs/admin diagnostics; never includes credentials. */
export async function getFileStorageDiagnostics() {
  const mongoose = await getMongoose();
  const db = mongoose.connection.db;
  if (!db || mongoose.connection.readyState !== 1) return { connected: false, bucket: BUCKET_NAME };
  const [files, chunks] = await Promise.all([
    db.collection(`${BUCKET_NAME}.files`).countDocuments(),
    db.collection(`${BUCKET_NAME}.chunks`).countDocuments()
  ]);
  return { connected: true, database: db.databaseName, bucket: BUCKET_NAME, files, chunks };
}
