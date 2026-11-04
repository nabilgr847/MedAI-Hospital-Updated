import dotenv from "dotenv";
import path from "path";
dotenv.config();
const required = ["MONGODB_URI", "JWT_SECRET"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);
if (process.env.JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpires: process.env.JWT_EXPIRES_IN || "1d",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  adminEmail: process.env.ADMIN_EMAIL?.toLowerCase().trim(),
  adminPassword: process.env.ADMIN_PASSWORD,
  openRouterKey: process.env.OPENROUTER_API_KEY,
  openRouterModel: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  uploadDir: path.resolve(process.env.UPLOAD_DIR || (process.env.NODE_ENV === "production" ? "/var/data/uploads" : "./private_uploads")),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 12),
  smtpHost: process.env.SMTP_HOST, smtpPort:Number(process.env.SMTP_PORT||587),
  smtpSecure: process.env.SMTP_SECURE === "true", smtpUser:process.env.SMTP_USER,
  smtpPass:process.env.SMTP_PASS, smtpFrom:process.env.SMTP_FROM||"MedAI Hospital <no-reply@example.com>",
  appPublicUrl:process.env.APP_PUBLIC_URL||"http://localhost:5173",
  signingPrivateKey:process.env.PRESCRIPTION_SIGNING_PRIVATE_KEY_BASE64?Buffer.from(process.env.PRESCRIPTION_SIGNING_PRIVATE_KEY_BASE64,"base64").toString("utf8"):process.env.PRESCRIPTION_SIGNING_PRIVATE_KEY?.replace(/\\n/g,"\n"),
  signingPublicKey:process.env.PRESCRIPTION_SIGNING_PUBLIC_KEY_BASE64?Buffer.from(process.env.PRESCRIPTION_SIGNING_PUBLIC_KEY_BASE64,"base64").toString("utf8"):process.env.PRESCRIPTION_SIGNING_PUBLIC_KEY?.replace(/\\n/g,"\n")
};
