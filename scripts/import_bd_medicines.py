#!/usr/bin/env python3
"""Import a licensed/authorized Bangladesh medicine CSV into MedAI Hospital.

CSV columns: brand,generic,strength,form,manufacturer,registrationNumber
The source URL and data-use/license basis are mandatory CLI arguments and are
stored with each record. This script does not scrape MedEx or bypass source terms.
"""
import argparse, csv, json, os, sys, urllib.request

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("csv_file")
    ap.add_argument("--api", required=True, help="API base URL, e.g. https://api.example.com")
    ap.add_argument("--token", default=os.getenv("MEDAI_ADMIN_TOKEN"), help="Admin JWT; prefer MEDAI_ADMIN_TOKEN env var")
    ap.add_argument("--source-name", required=True)
    ap.add_argument("--source-url", required=True)
    ap.add_argument("--source-license", required=True, help="Documented permission/license basis")
    ap.add_argument("--batch-size", type=int, default=500)
    args=ap.parse_args()
    if not args.token:
        ap.error("Provide --token or MEDAI_ADMIN_TOKEN")
    with open(args.csv_file, newline="", encoding="utf-8-sig") as f:
        rows=list(csv.DictReader(f))
    if not rows:
        print("No rows found", file=sys.stderr); return 2
    total=0
    for start in range(0,len(rows),args.batch_size):
        batch=rows[start:start+args.batch_size]
        payload={"records":batch,"sourceName":args.source_name,"sourceUrl":args.source_url,"sourceLicense":args.source_license}
        req=urllib.request.Request(args.api.rstrip("/")+"/api/admin/medicines/import",data=json.dumps(payload).encode(),headers={"Authorization":"Bearer "+args.token,"Content-Type":"application/json"},method="POST")
        with urllib.request.urlopen(req,timeout=60) as response:
            result=json.loads(response.read().decode())
        total+=result.get("imported",0)
        print(json.dumps(result,ensure_ascii=False))
    print(f"Imported {total} rows. All entries start as needs_review; an authorized catalogue reviewer must verify them before public search.")

if __name__=="__main__": main()
