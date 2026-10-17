# Renders scripts/simulation/sim.html to site/media/simulation.mp4 (run from the repo root: python scripts/simulation/render.py).
# Fonts: Public Sans and Source Serif 4 are loaded from local files if present; otherwise system fonts are used.
import subprocess
from playwright.sync_api import sync_playwright
FPS=24
with sync_playwright() as p:
  b=p.chromium.launch(args=['--allow-file-access-from-files'])
  pg=b.new_page(viewport={'width':1280,'height':720})
  pg.goto('file://' + __import__('os').path.abspath(__import__('os').path.join(__import__('os').path.dirname(__file__),'sim.html')) + ''); pg.wait_for_timeout(800)
  D=pg.evaluate('DURATION'); n=int(D*FPS)
  ff=subprocess.Popen(['ffmpeg','-loglevel','error','-y','-f','image2pipe','-framerate',str(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','site/media/simulation.mp4'],stdin=subprocess.PIPE)
  for i in range(n):
    pg.evaluate(f'render({i/FPS})')
    ff.stdin.write(pg.screenshot(type='jpeg',quality=92))
  ff.stdin.close(); ff.wait(); b.close()
print('done',n)
