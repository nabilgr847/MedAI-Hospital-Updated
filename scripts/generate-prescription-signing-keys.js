import {generateKeyPairSync,createHash} from "node:crypto";
const {publicKey,privateKey}=generateKeyPairSync("ed25519",{publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});
console.log("PRESCRIPTION_SIGNING_PRIVATE_KEY_BASE64="+Buffer.from(privateKey).toString("base64"));
console.log("PRESCRIPTION_SIGNING_PUBLIC_KEY_BASE64="+Buffer.from(publicKey).toString("base64"));
console.log("PUBLIC_KEY_FINGERPRINT="+createHash("sha256").update(publicKey).digest("hex"));
console.error("Store the private-key base64 only in the API host's secret environment settings. Never commit it.");
