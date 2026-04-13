import pathlib

root = pathlib.Path(__file__).resolve().parents[1]
text = (root / "test.html").read_text(encoding="utf-8", errors="replace")


def extract(name: str) -> str:
    prefix = f'const {name} = "'
    i = text.find(prefix)
    if i < 0:
        raise SystemExit(f"missing {name}")
    i += len(prefix)
    j = text.find('";', i)
    if j < 0:
        raise SystemExit(f"end {name}")
    return text[i:j]


def main():
    pb = extract("PB64")
    tb = extract("TB64")
    pl = extract("PLATEB64")
    out = root / "static" / "js" / "flap_lever_geom_b64.js"
    out.write_text(
        "export const FLAP_PB64 = "
        + repr(pb)
        + ";\nexport const FLAP_TB64 = "
        + repr(tb)
        + ";\nexport const FLAP_PLATEB64 = "
        + repr(pl)
        + ";\nexport const FLAP_PCOUNT = 185772;\nexport const FLAP_TCOUNT = 194406;\nexport const FLAP_PLCOUNT = 18483;\nexport const FLAP_LS = 20.3;\n",
        encoding="utf-8",
    )
    print("wrote", out, "bytes", out.stat().st_size)


if __name__ == "__main__":
    main()
