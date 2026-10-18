#!/usr/bin/env python3
"""Optional HTTP server for index.html.

The primary entry is ./index.html, which can be opened directly; this script
exists only for debugging over HTTP.
"""

import argparse
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Optional HTTP server for the dashboard")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    url = f"http://127.0.0.1:{args.port}/index.html"
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Serving {ROOT}")
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
