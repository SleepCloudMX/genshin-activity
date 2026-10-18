#!/usr/bin/env python3
"""Serve the static dashboard from the project root.

The report reads its JSON at runtime, so editing data/*.json and refreshing
the page is enough; there is no build step.
"""

import argparse
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = "data/7.1-261012.json"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, format, *args):
        sys.stderr.write("[serve] " + format % args + "\n")


def data_url_from_arg(value: str) -> str:
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    path = path.resolve()
    try:
        relative = path.relative_to(ROOT)
    except ValueError:
        raise SystemExit(f"data file must be inside the project: {path}")
    if not path.is_file():
        raise SystemExit(f"data file not found: {path}")
    return "../" + relative.as_posix()


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the activity analysis dashboard")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data", default=DEFAULT_DATA, help="JSON data file, relative to the project root")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    page = f"/web/index.html?data={quote(data_url_from_arg(args.data))}"
    url = f"http://127.0.0.1:{args.port}{page}"

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Serving {ROOT}")
    print(f"Data    {args.data}")
    print(f"Open    {url}")
    print("Ctrl+C to stop.")

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
