#!/usr/bin/env python3
"""Build data/admin_areas.json: regions (ADM1) and districts (ADM2) for every country in data/locales.json.

Source: geoBoundaries gbOpen (https://www.geoboundaries.org), CC BY 4.0 (some countries ODbL; the licence of
each country's release is recorded in the output). Downloaded from the geoBoundaries GitHub mirror.
Each district is put in the region that contains a representative point of its polygon.

Usage: python scripts/build_admin_areas.py            # all countries
       python scripts/build_admin_areas.py GH TZ      # some countries

The app only lets users *select* a region and district from this file (no free text), so names match
what clinics and surveillance systems use.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "admin_areas.json"
BASE = "https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/main/releaseData/gbOpen/{iso3}/{adm}/geoBoundaries-{iso3}-{adm}{suffix}"

# Tanzania keeps the curated region list in data/locales.json (geoBoundaries TZ predates Songwe and uses other Zanzibar names).
SKIP = {"TZ"}

ISO3 = {
    "TZ": "TZA", "KE": "KEN", "UG": "UGA", "RW": "RWA", "ET": "ETH", "NG": "NGA", "GH": "GHA", "MW": "MWI",
    "ZM": "ZMB", "MZ": "MOZ", "ZA": "ZAF", "CD": "COD", "SL": "SLE", "SN": "SEN", "IN": "IND", "BD": "BGD",
    "NP": "NPL", "PH": "PHL", "GT": "GTM", "PE": "PER",
}


def fetch_json(url: str):
    with urllib.request.urlopen(url, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def rings(geom: dict) -> list[list[list[list[float]]]]:
    """List of polygons; each polygon is a list of rings (outer first)."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    return []


def in_ring(x: float, y: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-300) + xi:
            inside = not inside
        j = i
    return inside


def in_geom(x: float, y: float, geom: dict) -> bool:
    for poly in rings(geom):
        if poly and in_ring(x, y, poly[0]) and not any(in_ring(x, y, hole) for hole in poly[1:]):
            return True
    return False


def ring_area(ring):
    return sum(ring[i][0] * ring[i - 1][1] - ring[i - 1][0] * ring[i][1] for i in range(len(ring))) / 2


def rep_points(geom: dict) -> list[tuple[float, float]]:
    """Candidate interior points of the largest polygon: centroid, then a grid of points inside it."""
    polys = sorted(rings(geom), key=lambda p: abs(ring_area(p[0])) if p else 0, reverse=True)
    if not polys:
        return []
    outer = polys[0][0]
    a = ring_area(outer)
    pts = []
    if abs(a) > 1e-12:
        cx = sum((outer[i][0] + outer[i - 1][0]) * (outer[i][0] * outer[i - 1][1] - outer[i - 1][0] * outer[i][1]) for i in range(len(outer))) / (6 * a)
        cy = sum((outer[i][1] + outer[i - 1][1]) * (outer[i][0] * outer[i - 1][1] - outer[i - 1][0] * outer[i][1]) for i in range(len(outer))) / (6 * a)
        pts.append((cx, cy))
    xs = [p[0] for p in outer]
    ys = [p[1] for p in outer]
    for fx in (0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8):
        for fy in (0.5, 0.3, 0.7, 0.4, 0.6, 0.2, 0.8):
            x = min(xs) + fx * (max(xs) - min(xs))
            y = min(ys) + fy * (max(ys) - min(ys))
            if in_geom(x, y, {"type": "Polygon", "coordinates": polys[0]}):
                pts.append((x, y))
    return pts or [(outer[0][0], outer[0][1])]


def clean(name: str) -> str:
    return " ".join(str(name).split())


def build_country(iso2: str) -> dict:
    iso3 = ISO3[iso2]
    meta = fetch_json(BASE.format(iso3=iso3, adm="ADM1", suffix="-metaData.json"))
    adm1 = fetch_json(BASE.format(iso3=iso3, adm="ADM1", suffix="_simplified.geojson"))["features"]
    adm2 = fetch_json(BASE.format(iso3=iso3, adm="ADM2", suffix="_simplified.geojson"))["features"]
    regions: dict[str, set[str]] = {clean(f["properties"]["shapeName"]): set() for f in adm1}
    unplaced = []
    for f in adm2:
        name = clean(f["properties"]["shapeName"])
        placed = None
        for x, y in rep_points(f["geometry"]):
            for r in adm1:
                if in_geom(x, y, r["geometry"]):
                    placed = clean(r["properties"]["shapeName"])
                    break
            if placed:
                break
        if not placed:
            # tiny islands can fall outside the simplified region outline: match a region of the same name
            placed = next((r for r in regions if r.lower().startswith(name.lower())), None)
        if placed:
            regions[placed].add(name)
        else:
            unplaced.append(name)
    if unplaced:
        print(f"  {iso2}: {len(unplaced)} districts not placed in a region: {unplaced[:5]}")
    return {
        "source": f"geoBoundaries gbOpen {iso3} ADM1/ADM2",
        "licence": meta.get("boundaryLicense", "see geoBoundaries metadata"),
        "source_year": meta.get("boundaryYearRepresented", ""),
        "regions": [{"name": r, "districts": sorted(d)} for r, d in sorted(regions.items())],
    }


def main(argv: list[str]) -> int:
    locales = json.loads((ROOT / "data" / "locales.json").read_text(encoding="utf-8"))
    wanted = [c["iso"] for c in locales["countries"] if c["iso"] not in SKIP]
    if argv:
        wanted = [c for c in wanted if c in argv]
    out = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {
        "description": "Regions (ADM1) and districts (ADM2) offered as select-only dropdowns in setup. Built by scripts/build_admin_areas.py.",
        "source_url": "https://www.geoboundaries.org",
        "countries": {},
    }
    for iso2 in wanted:
        print(f"{iso2} ...", flush=True)
        try:
            out["countries"][iso2] = build_country(iso2)
            c = out["countries"][iso2]
            print(f"  {len(c['regions'])} regions, {sum(len(r['districts']) for r in c['regions'])} districts ({c['licence']})")
        except Exception as e:  # keep going; report at the end
            print(f"  FAILED: {e}")
    out["countries"] = {k: v for k, v in sorted(out["countries"].items()) if k not in SKIP}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    missing = [c for c in [x["iso"] for x in locales["countries"]] if c not in out["countries"] and c not in SKIP]
    print(f"wrote {OUT.relative_to(ROOT)}; missing: {missing or 'none'}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
