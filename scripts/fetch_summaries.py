#!/usr/bin/env python3
"""Fetch ICB crisis summaries into data/icb_raw/summaries/<crisno>.txt.
Mapping crisis number -> link comes from the spreadsheet's own cell hyperlinks (ICB_Crisis_List_with_Summaries.xlsx, column F).
Handles Drive `open?id=` / `file/d/<id>` links (text or PDF; PDFs via pdftotext) and Google Docs (exported as plain text).
Re-runnable: existing <crisno>.txt files are kept. Stdlib only (+ pdftotext on PATH for PDFs)."""
import re, subprocess, sys, time, urllib.request, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "icb_raw"
OUT = RAW / "summaries"; OUT.mkdir(exist_ok=True)
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

z = zipfile.ZipFile(RAW / "ICB_Crisis_List_with_Summaries.xlsx")
ss = ["".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS)]
sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
rels = {m.group(1): m.group(2) for m in re.finditer(r'Id="([^"]+)"[^>]*Target="([^"]+)"', z.read("xl/worksheets/_rels/sheet1.xml.rels").decode())}
rels.update({m.group(2): m.group(1) for m in re.finditer(r'Target="([^"]+)"[^>]*Id="([^"]+)"', z.read("xl/worksheets/_rels/sheet1.xml.rels").decode())})
cells = {}
for c in sheet.iter("{%s}c" % NS["m"]):
    v = c.find("m:v", NS)
    if v is not None:
        cells[c.get("r")] = ss[int(v.text)] if c.get("t") == "s" else v.text
links = {}
for h in sheet.iter("{%s}hyperlink" % NS["m"]):
    rid = h.get("{%s}id" % NS["r"])
    if rid in rels:
        links[int(re.sub(r"\D", "", h.get("ref")))] = rels[rid]
mapping = {}
for row, url in links.items():
    n = cells.get(f"B{row}")
    if n and str(n).strip().isdigit():
        mapping[int(n)] = url
print(f"rows with links: {len(links)}, crisis numbers mapped: {len(mapping)}", flush=True)

UA = {"User-Agent": "icb-summary-fetch/1.0"}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()

ok = fail = 0
for n, url in sorted(mapping.items()):
    dst = OUT / f"{n}.txt"
    if dst.exists() and dst.stat().st_size > 200:
        ok += 1; continue
    try:
        m = re.search(r"/document/d/([\w-]+)", url)
        if m:
            data = get(f"https://docs.google.com/document/d/{m.group(1)}/export?format=txt")
        else:
            fid = (re.search(r"[?&]id=([\w-]+)", url) or re.search(r"/file/d/([\w-]+)", url)).group(1)
            data = get(f"https://drive.google.com/uc?export=download&id={fid}")
        if data[:5] == b"%PDF-":
            tmp = OUT / f"_{n}.pdf"; tmp.write_bytes(data)
            subprocess.run(["pdftotext", "-layout", str(tmp), str(dst)], check=True); tmp.unlink()
        else:
            dst.write_bytes(data)
        ok += 1
    except Exception as e:
        fail += 1; print(f"  crisis {n}: {str(e)[:80]}", flush=True)
    time.sleep(0.2)
print(f"summaries ready: {ok}, failed: {fail}")
