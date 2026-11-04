# MedAI Hospital V2.6 — নতুন আপডেট

- Patient/Doctor-এর অনলাইন উপস্থিতি heartbeat দিয়ে আনুমানিকভাবে দেখা যাবে।
- Admin Dashboard-এ Live Monitoring যুক্ত হয়েছে: online count, last seen/login, সাম্প্রতিক activity এবং active call-এর metadata।
- Call session-এর শুরু, heartbeat, connection state ও শেষ হওয়ার সময় সংরক্ষিত হবে। Admin কলের audio/video বা ব্যক্তিগত কথোপকথন দেখতে/শুনতে পারবে না।
- মেডিকেল রিপোর্টের JPG/PNG/WEBP ছবির জন্য OpenRouter vision model-এ সরাসরি image analysis এবং OCR cross-check যুক্ত হয়েছে।
- PDF-এর text extraction ও scanned PDF OCR-এর জন্য Poppler/Tesseract প্রয়োজন।

**সীমাবদ্ধতা:** Vision-capable AI model, MongoDB Atlas, browser/WebRTC এবং OCR-এর live integration পরীক্ষা বাকি। অনলাইন অবস্থা heartbeat-নির্ভর, শতভাগ নির্ভুল নয়। এটি staging release; বাস্তব রোগীর ডেটা দিয়ে production ব্যবহারের আগে end-to-end ও clinical/security validation আবশ্যক।
