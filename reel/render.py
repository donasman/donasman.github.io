"""reel.html을 프레임 단위로 찍어 MP4로 만든다.

  python reel/render.py              # 라이트·다크 두 벌: assets/reel/showreel(-dark).mp4 + poster(-dark).webp
  python reel/render.py --sheet      # 주요 장면만 찍어 reel/frames/에 한 장으로 모은다(확인용, --dark로 다크)

필요: playwright(Chrome), imageio-ffmpeg(libx264가 든 ffmpeg)
"""
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
from PIL import Image
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
OUT = HERE.parent / "assets" / "reel"
SRC = (HERE / "reel.html").resolve().as_uri()
POSTER_AT = 14.7


def open_page(p, dark=False):
    browser = p.chromium.launch(channel="chrome")
    page = browser.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1,
                            color_scheme="dark" if dark else "light")
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(SRC + ("#render-dark" if dark else "#render"))
    page.wait_for_function("window.reelReady === true", timeout=60000)
    return browser, page, errors


def sheet(times, dark=False):
    frames = HERE / "frames"
    frames.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser, page, errors = open_page(p, dark)
        shots = []
        t_prev = 0.0
        # 앞에서부터 차례로 지나가야 타임라인의 시작값이 실제 재생과 같아진다
        for t in sorted(times):
            k = t_prev
            while k < t:
                page.evaluate("t => window.renderAt(t)", k)
                k += 1 / 30
            page.evaluate("t => window.renderAt(t)", t)
            f = frames / f"t{t:05.2f}.png"
            page.screenshot(path=str(f))
            shots.append(f)
            t_prev = t
        browser.close()
    ims = [Image.open(f).resize((640, 360)) for f in shots]
    cols = 3
    rows = (len(ims) + cols - 1) // cols
    board = Image.new("RGB", (640 * cols, 360 * rows), "white")
    for i, im in enumerate(ims):
        board.paste(im, ((i % cols) * 640, (i // cols) * 360))
    board.save(frames / "sheet.png")
    print("sheet:", frames / "sheet.png", "errors:", errors)


def render(dark=False):
    OUT.mkdir(parents=True, exist_ok=True)
    suffix = "-dark" if dark else ""
    mp4 = OUT / f"showreel{suffix}.mp4"
    poster = OUT / f"poster{suffix}.png"
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with sync_playwright() as p:
        browser, page, errors = open_page(p, dark)
        fps = page.evaluate("window.reelFps")
        dur = page.evaluate("window.reelDuration")
        n = int(round(fps * dur))
        proc = subprocess.Popen(
            [ffmpeg, "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(fps), "-i", "-",
             "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
             "-movflags", "+faststart", str(mp4)],
            stdin=subprocess.PIPE,
        )
        started = time.time()
        for i in range(n):
            t = i / fps
            page.evaluate("t => window.renderAt(t)", t)
            proc.stdin.write(page.screenshot(type="png"))
            if abs(t - POSTER_AT) < 0.5 / fps:
                page.screenshot(path=str(poster))
            if i % 120 == 0:
                print(f"frame {i}/{n}  {time.time() - started:.0f}s", flush=True)
        proc.stdin.close()
        proc.wait()
        browser.close()
    Image.open(poster).convert("RGB").save(poster.with_suffix(".webp"), "WEBP", quality=86)
    poster.unlink()
    print("saved", mp4, f"{mp4.stat().st_size / 1e6:.1f} MB", "errors:", errors)


if __name__ == "__main__":
    if "--sheet" in sys.argv:
        sheet([0.6, 1.2, 1.9, 2.5, 3.25, 3.9, 4.6, 5.0, 5.9, 6.4, 6.95, 7.3, 7.97, 8.6, 9.35, 9.75, 10.35, 10.9,
               11.35, 11.8, 12.2, 12.95, 13.5, 14.5], dark="--dark" in sys.argv)
    else:
        render(dark=False)
        render(dark=True)
