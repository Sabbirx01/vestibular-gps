#!/usr/bin/env python3
"""
VESTIBULAR GPS — development server.

Why this exists instead of `python -m http.server`:

    http.server sends no Cache-Control and no ETag. Chrome then applies
    heuristic caching to the ES modules, so after you edit a file a normal
    reload can keep executing the previous version. The symptom is a module
    error like "does not provide an export named X" that survives reloads and
    looks like a code bug.

    This server sends Cache-Control: no-store for everything, so every reload
    reads the current file from disk.

Usage:
    python serve.py                # http://127.0.0.1:8322
    python serve.py 9000           # custom port
    python serve.py 9000 0.0.0.0   # bind all interfaces (for testing on a phone)
"""

import http.server
import os
import socket
import socketserver
import sys
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8322


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    """Serves the project folder and forbids caching."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        # Never let a browser guess a type from content when the extension is
        # ambiguous; a .js served as text/html is a scripting vector.
        self.send_header("X-Content-Type-Options", "nosniff")
        # Needed if you ever want to expose device sensors over a LAN address.
        self.send_header("Permissions-Policy", "accelerometer=(self), gyroscope=(self), magnetometer=(self), geolocation=(self)")
        super().end_headers()

    # ── What is NOT served ────────────────────────────────────────────────
    # `python serve.py <port> 0.0.0.0` is documented for phone testing, which
    # puts this whole folder on the local network. Without the two guards below
    # that also published .git/ (full history), tests/, .env.example and the
    # scratch *_chk.txt files. None of them are needed to run the page, so they
    # are refused outright. Consequence: docs/_source-check.txt is a `_` file
    # and is therefore not reachable over HTTP either — it is a local artefact.
    BLOCKED_DIRS = ("tests",)

    def _is_blocked(self, path: str) -> bool:
        rel = os.path.relpath(path, ROOT).replace("\\", "/")
        if rel in (".", ""):
            return False
        parts = [p for p in rel.split("/") if p]
        if parts and parts[0] in self.BLOCKED_DIRS:
            return True
        return any(p.startswith(".") or p.startswith("_") for p in parts)

    def send_head(self):
        if self._is_blocked(self.translate_path(self.path)):
            self.send_error(403, "Not served by the development server")
            return None
        return super().send_head()

    def list_directory(self, path):
        # A directory listing turns one guessed URL into the whole file tree.
        self.send_error(403, "Directory listing is disabled")
        return None

    def log_message(self, fmt, *args):
        # Quieter logging: only report non-200 responses.
        if args and str(args[1]).startswith("2"):
            return
        sys.stderr.write("  %s - %s\n" % (self.address_string(), fmt % args))


def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return "127.0.0.1"


def main() -> int:
    port = DEFAULT_PORT
    host = "127.0.0.1"

    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Port must be a number, got {sys.argv[1]!r}")
            return 2
    if len(sys.argv) > 2:
        host = sys.argv[2]

    socketserver.TCPServer.allow_reuse_address = True
    try:
        httpd = socketserver.ThreadingTCPServer((host, port), NoStoreHandler)
    except OSError as e:
        print(f"Could not bind {host}:{port} — {e}")
        print("Another server may already be running on that port. Try another, e.g. python serve.py 8323")
        return 1

    print("VESTIBULAR GPS — development server")
    print(f"  serving   {ROOT}")
    print("  caching   disabled (Cache-Control: no-store)")
    print(f"  local     http://127.0.0.1:{port}/")
    if host == "0.0.0.0":
        print(f"  network   http://{local_ip()}:{port}/   <- use this on your phone")
        print("            NOTE: device sensors need HTTPS on most browsers.")
    print("  stop      Ctrl+C")
    print()

    try:
        webbrowser.open(f"http://127.0.0.1:{port}/")
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
