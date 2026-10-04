"""Record the Amara First Contact demo video (phone layout, captioned, in flight mode).

Usage: npm run build && npx vite preview --port 4173   (in another terminal)
       pip install playwright && python scripts/record_demo.py   [--fast for a quick dry run]
Output: a .webm in recordings/raw; encode with ffmpeg (see docs/VIDEO_SCRIPT.md).
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:4173/"
W, H = 390, 844
FAST = "--fast" in sys.argv  # dry run: short pauses, still records

OVERLAY_JS = r"""
(() => {
  if (document.getElementById('cap')) return;
  const st = document.createElement('style');
  st.textContent = `
  #cap{position:fixed;left:10px;right:10px;bottom:14px;z-index:99999;pointer-events:none;
    background:rgba(12,22,19,.9);color:#fff;font:600 16px/1.35 system-ui,sans-serif;padding:11px 14px;
    border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.3);opacity:0;transition:opacity .3s}
  #cap.on{opacity:1}
  #cap b{color:#f0b545}
  #card{position:fixed;inset:0;z-index:100000;pointer-events:none;background:#0f5c4d;color:#fff;
    display:flex;flex-direction:column;justify-content:center;padding:34px;gap:14px;
    font:500 18px/1.45 system-ui,sans-serif;opacity:0;transition:opacity .5s}
  #card.on{opacity:1}
  #card h1{font:800 32px/1.15 system-ui,sans-serif;margin:0}
  #card small{opacity:.8;font-size:14px}
  .tapdot{position:fixed;z-index:99998;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
    background:rgba(240,181,69,.55);border:3px solid #f0b545;pointer-events:none;animation:tap .6s ease-out forwards}
  @keyframes tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}`;
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = 'cap'; document.body.appendChild(c);
  const k = document.createElement('div'); k.id = 'card'; document.body.appendChild(k);
})();
"""


def main():
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(
            # 2x canvas with the page zoomed 2x: a 390 px phone layout recorded at full sharpness
            viewport={"width": W * 2, "height": H * 2},
            device_scale_factor=1,
            record_video_dir="recordings/raw",
            record_video_size={"width": W * 2, "height": H * 2},
            locale="en-GB",
        )
        # The sandbox cannot reach the map servers; the app uses the real clinics baked in at build time.
        ctx.route("**/{overpass-api.de,nominatim.openstreetmap.org,overpass.kumi.systems,overpass.private.coffee}/**",
                  lambda r: r.abort())
        ctx.add_init_script("document.addEventListener('DOMContentLoaded',()=>{document.documentElement.style.zoom='2'})")
        pg = ctx.new_page()

        def ov():
            pg.evaluate(OVERLAY_JS)

        def wait(ms):
            pg.wait_for_timeout(min(ms, 300) if FAST else ms)

        def cap(html, ms=3800):
            ov()
            pg.evaluate("h => { const c = document.getElementById('cap'); c.innerHTML = h; c.classList.add('on'); }", html)
            wait(ms)

        def nocap():
            pg.evaluate("() => document.getElementById('cap')?.classList.remove('on')")

        def card(html, ms=5000):
            ov()
            pg.evaluate("h => { const k = document.getElementById('card'); k.innerHTML = h; k.classList.add('on'); }", html)
            wait(ms)
            pg.evaluate("() => document.getElementById('card').classList.remove('on')")
            wait(600)

        def show(loc, block="center"):
            loc.evaluate(f"e => e.scrollIntoView({{behavior:'smooth', block:'{block}'}})")
            wait(900)

        def tap(loc, pause=700):
            loc.evaluate("e => e.scrollIntoView({behavior:'smooth', block:'center'})")
            wait(500)
            bb = loc.bounding_box()
            if bb:
                pg.evaluate("([x,y]) => { const d=document.createElement('div'); d.className='tapdot';"
                            "d.style.left=x+'px'; d.style.top=y+'px'; document.body.appendChild(d); setTimeout(()=>d.remove(),700); }",
                            [(bb["x"] + bb["width"] / 2) / 2, (bb["y"] + bb["height"] / 2) / 2])
            wait(250)
            loc.click()
            wait(pause)

        btn = lambda name, exact=False: pg.get_by_role("button", name=name, exact=exact).first

        # ------------------------------------------------------------------ 0. title
        pg.goto(URL)
        pg.wait_for_load_state("networkidle")
        card("<h1>Amara First Contact</h1><div>An offline triage and referral companion for the first person a mother "
             "sees: the drug shop dispenser, the community health worker, the dispensary nurse.</div>"
             "<small>Small AI for Development Hackathon · Challenge 04 · Health · Amara Health</small>", 6500)

        # ------------------------------------------------------------------ 1. landing
        tap(btn("English", exact=True), 500)
        cap("<b>Noor</b>, 38, farms coffee and maize on the Kilimanjaro slopes. When she or her daughter is ill, "
            "her first stop is the <b>drug shop</b>, not the crowded clinic.", 5500)
        cap("The dispenser installs this once. Setup asks the country, district, role, languages and a "
            "<b>work ID</b>. For the demo we use a ready Tanzania setup.", 5000)
        nocap()
        tap(btn("Use the Tanzania demo setup"), 1200)

        # ------------------------------------------------------------------ 2. PIN
        cap("PIN lock: patient data stays on this phone until it syncs.", 2500)
        for d in "1234":
            tap(btn(d, exact=True), 250)
        wait(900)
        tap(btn("SW", exact=True), 700)  # staff language: English for the judges

        # ------------------------------------------------------------------ 3. start + offline
        strip = pg.locator("button", has_text="Work ID").first
        show(strip)
        cap("Every referral carries the dispenser's <b>Work ID</b>. Clinics are <b>real</b>: 105 named facilities "
            "from OpenStreetMap around her position, saved for offline use.", 6000)
        tap(btn("📶", exact=True), 400)
        ctx.set_offline(True)
        cap("<b>Flight mode.</b> From here on there is no internet.", 3200)
        nocap()

        # ------------------------------------------------------------------ 4. Noor: her words -> small AI
        tap(pg.get_by_text("Demo mode").first, 900)
        cap("Noor today: a fever that malaria tablets did not clear.", 2800)
        tap(pg.locator("button", has_text="Next").first, 1500)
        box = pg.locator("#q_complaint textarea")
        show(box)
        box.fill("")
        cap("She explains in her own <b>Swahili</b> words. The dispenser types them (or a relative does).", 3500)
        box.press_sequentially("Nimemeza mseto lakini homa bado ipo, na kuna panya wengi nyumbani, nimechoka",
                               delay=10 if FAST else 55)
        wait(1600)
        panel = pg.locator(".ai-heard")
        show(panel)
        cap("The <b>small AI</b> runs on the phone (under 1 MB, no internet). It maps each phrase to a fixed list "
            "of symptoms and exposures, and shows how sure it is.", 7000)
        unsure = pg.locator(".ai-heard li.unsure").first
        if unsure.count():
            show(unsure)
        cap("“Nimechoka” (I'm tired) is too vague: below the 40% line it says <b>Not sure: ask her again</b>. "
            "It never guesses.", 6000)
        chips = pg.locator("#q_complaint .chip:not(.uncertain) .chip-main")
        cap("The dispenser taps to <b>confirm</b> each item. Only confirmed items count.", 1500)
        for i in range(chips.count()):
            tap(chips.nth(i), 500)
        wait(1200)
        nocap()

        # ------------------------------------------------------------------ 5. keypad questions
        tap(btn("Next", exact=True), 700)
        cap("Then keypad questions, read aloud if needed: yes, no, don't know. Farm work, animals, water, "
            "how far the clinic is, her phone, her language.", 3500)
        pg.mouse.wheel(0, 2800); wait(900)
        tap(btn("Next", exact=True), 700)
        pg.mouse.wheel(0, 3200); wait(1200)
        nocap()
        tap(btn("See result", exact=True), 1200)

        # ------------------------------------------------------------------ 6. rules decide, person confirms
        cap("The <b>rules engine</b>, not the AI, decides urgency. Every reason shows its guideline source.", 5000)
        pg.mouse.wheel(0, 1000); wait(1500)
        cap("A person <b>confirms or overrides</b> every flag before anything is sent.", 2000)
        for c in pg.get_by_role("button", name="✓ Confirm", exact=True).all():
            tap(c, 450)
        nocap()
        pg.mouse.wheel(0, -6000); wait(800)
        tap(pg.get_by_role("tab", name="Mother", exact=True).first, 900)
        cap("Noor's view: where to go, when, and her code. <b>No diagnosis</b>, no symptoms.", 4200)
        tap(pg.get_by_role("tab", name="Clinician", exact=True).first, 900)
        cap("Only the <b>clinician</b> sees conditions to rule out, with ICD-10 codes marked "
            "<b>Draft: clinician to confirm</b>.", 5000)
        pg.mouse.wheel(0, 1400); wait(2200)
        nocap()
        pg.mouse.wheel(0, -6000); wait(500)
        tap(pg.get_by_role("tab", name="First responder", exact=True).first, 600)

        # ------------------------------------------------------------------ 7. referral
        tap(btn("Create referral", exact=True), 1400)
        pg.mouse.wheel(0, -4000); wait(500)
        cap("The nearest suitable <b>real</b> clinic: Machame Hospital, 1.6 km. Slot and referral code are made "
            "<b>on the phone</b>, offline.", 6000)
        sms = pg.get_by_text("Message to her phone").first
        show(sms, "start")
        cap("Her SMS in <b>Swahili</b>, under 160 characters: clinic, day, time, code. Nothing about her health. "
            "Kichaga speakers get a recorded voice call instead.", 6500)
        pg.mouse.wheel(0, 1800); wait(1200)
        cap("Offline, the referral waits in a queue and she takes the paper slip.", 3500)
        nocap()
        tap(btn("Done: next patient"), 1000)

        # ------------------------------------------------------------------ 8. Amina: urgent never waits
        tap(pg.get_by_text("Demo mode").first, 900)
        tap(pg.locator("button", has_text="Next").nth(1), 1800)
        show(pg.locator(".ai-heard"))
        cap("<b>Amina</b>, 32 weeks pregnant: a severe headache, seeing darkness, swollen legs.", 5000)
        tap(btn("Next", exact=True), 400)
        tap(btn("Next", exact=True), 400)
        tap(btn("See result", exact=True), 1200)
        cap("Danger signs of pre-eclampsia: <b>Go now</b>, with a paper referral, whatever the network or slots.",
            6000)
        nocap()
        for c in pg.get_by_role("button", name="✓ Confirm", exact=True).all():
            tap(c, 350)
        create = btn("Paper referral", exact=True) if btn("Paper referral", exact=True).count() else btn("Create referral", exact=True)
        if create.count() and create.is_enabled():
            tap(create, 1400)
            pg.mouse.wheel(0, -4000); wait(800)
            cap("No slot to wait for: a <b>paper referral</b> goes with her now.", 4000)
            nocap()
        done = btn("Done: next patient")
        if done.count():
            tap(done, 900)

        home = btn("Amara", exact=True)
        if home.count():
            tap(home, 900)

        # ------------------------------------------------------------------ 9. back online: sync
        ctx.set_offline(False)
        tap(pg.locator(".chip-btn.net").first, 2200)
        cap("<b>Network back</b>: the queue syncs to the clinic.", 3500)
        nocap()

        # ------------------------------------------------------------------ 10. clinic + outbreak
        tap(pg.locator("button", has_text="Clinic dashboard").first, 1500)
        cap("The clinic sees Noor's referral and the dispenser's note <b>before she arrives</b>.", 5000)
        out = pg.get_by_text("Outbreak watch").first
        show(out, "start")
        cap("<b>Outbreak watch</b> across clinics: 7 fever-with-rash cases this week against a baseline near 1. "
            "Nearby clinics get a guidance card.", 6500)
        appr = btn("Approve", exact=True)
        show(appr)
        cap("The escalation to the district surveillance officer is a <b>draft</b> until a person approves it "
            "with their work ID.", 5000)
        tap(appr, 2500)
        nocap()

        # ------------------------------------------------------------------ 11. end
        card("<h1>Small AI. Rules with sources. A person decides.</h1>"
             "<div>Works offline on a basic Android phone. Her words, her language, her SMS.</div>"
             "<small>Honest limits: training phrases are synthetic; outbreak counts and slots are sample data; "
             "Swahili text, clinical rules and ICD-10 codes await expert review. Clinics: © OpenStreetMap "
             "contributors.</small>", 8000)
        ctx.close()
        b.close()


if __name__ == "__main__":
    main()
