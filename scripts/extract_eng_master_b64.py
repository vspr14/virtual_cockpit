import re
import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
p = root / "test.html"
text = p.read_text(encoding="utf-8", errors="replace")
m = re.search(r'const VB64="([^"]*)"', text)
n = re.search(r'const NB64="([^"]*)"', text)
if not m or not n:
    raise SystemExit("VB64/NB64 not found")
out = root / "static" / "js" / "eng_master_geom_b64.js"
out.write_text(
    "export const ENG_MASTER_VB64 = "
    + repr(m.group(1))
    + ";\nexport const ENG_MASTER_NB64 = "
    + repr(n.group(1))
    + ";\n",
    encoding="utf-8",
)
print("VB64", len(m.group(1)), "NB64", len(n.group(1)), "->", out, out.stat().st_size)
