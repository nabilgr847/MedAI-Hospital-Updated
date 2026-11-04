# MedAI Hospital V2.5 — পরিবর্তনের নোট

- নতুন আপলোড করা ফাইল MongoDB Atlas GridFS-এ রাখা হবে; Render `/tmp` আর নতুন ফাইলের স্থায়ী স্টোরেজ নয়।
- পুরোনো `/tmp` ফাইল Render ইতিমধ্যে মুছে দিলে সেগুলো উদ্ধার করা যাবে না; পুনরায় আপলোড করতে হবে।
- Admin Security tab-এ API error দেখা ও resolve করা যাবে।
- Patient verified medicine catalogue search করতে পারবে।
- Admin CSV অথবা JSON medicine catalogue import করতে পারবে; sample JSON দেওয়া আছে।
- focused test 9/9 pass এবং backend JavaScript syntax check pass।
- Frontend build, Atlas live connection, AI, SMTP, OCR/PDF end-to-end পরীক্ষা dependency ও live credentials না থাকায় করা যায়নি।
- Chat-এ media attachment থেকে automatic AI analysis, live online status, full active-call monitoring এবং complete DGDA database এই ZIP-এ সম্পূর্ণ নেই।

এটি staging/development build; production medical service হিসেবে ব্যবহার করার আগে সব integration ও security/clinical test করতে হবে।
