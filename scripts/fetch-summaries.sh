#!/usr/bin/env bash
# Download all ICB crisis summaries (public Google Drive files linked from the ICB data page) into data/icb_raw/summaries/<crisno>.txt
# Text files are used as is; PDF files are converted with pdftotext (poppler). Re-runnable: existing downloads are kept.
set -u
cd "$(dirname "$0")/../data/icb_raw"
mkdir -p summaries
fetch() {
  id="${1##*id=}"
  f="summaries/_$id.bin"
  [ -s "$f" ] || [ -s "summaries/_$id.txt" ] && [ -s "summaries/_$id.txt" ] && mv "summaries/_$id.txt" "$f"
  [ -s "$f" ] || curl -s -m 60 -L "https://drive.google.com/uc?export=download&id=$id" -o "$f"
  t="summaries/_$id.text"
  if head -c 5 "$f" | grep -q "%PDF"; then pdftotext -layout "$f" "$t" 2>/dev/null; else cp "$f" "$t"; fi
  n=$(grep -m1 -oiE "CRIS(IS )?NO\.?[^0-9]{0,5}[0-9]+" "$t" | grep -oE "[0-9]+$")
  [ -n "$n" ] && cp "$t" "summaries/$n.txt"
}
export -f fetch
cat summary_urls.txt | xargs -P 3 -I{} bash -c 'fetch "{}"'
echo "downloaded: $(ls summaries | grep -c '\.bin$') / $(wc -l < summary_urls.txt), indexed crises: $(ls summaries | grep -cE '^[0-9]+\.txt$')"
