"""Frozen-backend entry point.

PyInstaller bundles this into a standalone executable so the packaged Electron app
can run the FastAPI backend with no Python installed on the user's machine. We pass
the ASGI app object directly (not the "app:app" import string) so it resolves inside
the frozen bundle, and read the port from the environment that Electron sets.
"""
import os
import uvicorn
from app import app

if __name__ == "__main__":
    port = int(os.environ.get("BACKEND_PORT", "8741"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
