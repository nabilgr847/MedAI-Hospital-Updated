import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { User, AuditEvent } from "./models.js";

export const hashPassword = (value) => bcrypt.hash(value, 12);
export const verifyPassword = (value, hash) => bcrypt.compare(value, hash);
export const makeToken = (user) => jwt.sign({role:user.role}, config.jwtSecret, {subject:String(user._id), expiresIn:config.jwtExpires});

export async function auth(req,res,next) {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
    if (!token) return res.status(401).json({error:"Authentication required"});
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(payload.sub).select("name email role status passwordChangedAt");
    if(user && user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime()/1000)) return res.status(401).json({error:"Session expired. Please sign in again."});
    if (!user || user.status !== "active") return res.status(401).json({error:"Account unavailable"});
    req.user = user; next();
  } catch { return res.status(401).json({error:"Invalid or expired session"}); }
}
export const allow = (...roles) => (req,res,next) => roles.includes(req.user?.role) ? next() : res.status(403).json({error:"Permission denied"});
export async function audit(req, action, targetType="", targetId="", metadata={}) {
  try { await AuditEvent.create({actorId:req.user?._id, action, targetType, targetId:String(targetId||""), metadata, ip:req.ip}); } catch(e) { console.error("Audit write failed",e.message); }
}

