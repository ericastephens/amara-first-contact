"""Fetch real health facilities and pharmacies from OpenStreetMap (Overpass API) for a demo area.

Default area: coffee-growing slopes of Kilimanjaro (Hai / Moshi Rural), Tanzania, as a real-world stand-in
for the brief's fictional Ondera highlands. Change --bbox for another area.

Usage: python scripts/fetch_facilities_osm.py [--bbox south,west,north,east]
Output: data/facilities_osm_kilimanjaro.json (same shape as data/facilities_sample.json)
Licence: OpenStreetMap data is ODbL; credit "© OpenStreetMap contributors" in the app and docs.
Does not cover: many drug shops and dispensaries are missing or untagged; no hours, staff, stock or slots.
"""
import argparse
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OVERPASS = "https://overpass-api.de/api/interpreter"

LEVEL = {"hospital": "hospital", "clinic": "health_centre", "doctors": "dispensary", "pharmacy": "drug_shop"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", default="-3.40,37.15,-3.10,37.60", help="south,west,north,east")
    ap.add_argument("--out", default="data/facilities_osm_kilimanjaro.json")
    a = ap.parse_args()
    q = f"""
    [out:json][timeout:60];
    (
      nwr["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]({a.bbox});
      nwr["healthcare"~"^(hospital|clinic|centre|pharmacy)$"]({a.bbox});
    );
    out center tags;
    """
    req = urllib.request.Request(OVERPASS, data=urllib.parse.urlencode({"data": q}).encode(),
                                 headers={"User-Agent": "amara-first-contact-hackathon/0.1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        elements = json.load(r)["elements"]

    facilities = []
    for e in elements:
        tags = e.get("tags", {})
        kind = tags.get("amenity") or tags.get("healthcare")
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None or kind is None:
            continue
        name = tags.get("name") or tags.get("name:sw") or tags.get("name:en")
        if not name:
            continue  # an unnamed point cannot be referred to
        level = LEVEL.get(kind, "health_centre")
        # Tanzanian naming conventions help: Zahanati = dispensary, Kituo cha Afya = health centre
        lname = name.lower()
        if "zahanati" in lname or "dispensary" in lname:
            level = "dispensary"
        elif "kituo cha afya" in lname or "health cent" in lname:
            level = "health_centre"
        facilities.append({"id": f"osm-{e['type']}-{e['id']}", "name": name, "name_en": tags.get("name:en") or name, "level": level,
                           "ward": tags.get("addr:suburb") or tags.get("addr:village") or tags.get("addr:city") or "",
                           "lat": round(lat, 6), "lon": round(lon, 6), "osm_tags": {k: tags[k] for k in ("amenity", "healthcare", "operator", "operator:type") if k in tags},
                           "synthetic": False})

    out = {"synthetic": False, "source": "OpenStreetMap via Overpass API", "licence": "ODbL, © OpenStreetMap contributors",
           "bbox": a.bbox, "level_order": ["drug_shop", "dispensary", "health_centre", "hospital"],
           "does_not_cover": "Missing or untagged drug shops and dispensaries; no opening hours, staff, stock or referral slots.",
           "facilities": facilities}
    path = ROOT / a.out
    path.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    counts = {}
    for f in facilities:
        counts[f["level"]] = counts.get(f["level"], 0) + 1
    print(f"wrote {path.relative_to(ROOT)}: {len(facilities)} facilities {counts}")


if __name__ == "__main__":
    main()
