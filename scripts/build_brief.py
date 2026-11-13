"""Renders site/brief/brief.html to site/amara-first-contact-brief.pdf (one Letter page). Run from the repo root."""
import pathlib
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / "site/brief/brief.html").as_uri()
out = root / "site/amara-first-contact-brief.pdf"
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(src); pg.wait_for_load_state("networkidle"); pg.evaluate("document.fonts.ready")
    h = pg.evaluate("document.querySelector('.page').scrollHeight")
    print("page content height px:", h, "(Letter = 1056)")
    pg.pdf(path=str(out), format="Letter", print_background=True, margin={"top":"0","bottom":"0","left":"0","right":"0"})
    b.close()
print("wrote", out)
