"""Read the real installer's selected language and wizard on a private desktop.

Never press Install: this can run safely alongside an existing FuxWX installation.
"""
import ctypes
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import time
from desktop_test import Startup, Process

ROOT = Path(__file__).resolve().parents[1]
version = json.loads((ROOT / "nsh.json").read_text(encoding="utf-8"))["version"]
installer = ROOT / f"dist/releases/FuxWX-{version}.exe"
output = ROOT / "dist/reports"
output.mkdir(parents=True, exist_ok=True)
user = ctypes.WinDLL("user32", use_last_error=True)
kernel = ctypes.WinDLL("kernel32", use_last_error=True)
user.CreateDesktopW.argtypes = [w.LPCWSTR, w.LPCWSTR, ctypes.c_void_p, w.DWORD, w.DWORD, ctypes.c_void_p]
user.CreateDesktopW.restype = w.HANDLE
user.CloseDesktop.argtypes = [w.HANDLE]
kernel.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, w.BOOL, w.DWORD,
                                ctypes.c_void_p, w.LPCWSTR, ctypes.POINTER(Startup), ctypes.POINTER(Process)]
kernel.CloseHandle.argtypes = [w.HANDLE]
user.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
user.IsWindowVisible.argtypes = [w.HWND]
CALLBACK = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
user.EnumDesktopWindows.argtypes = [w.HANDLE, CALLBACK, w.LPARAM]
ui_language = kernel.GetUserDefaultUILanguage()
expected = {0x0804: "chinesesimplified", 0x0404: "chinesetraditional", 0x0c04: "chinesetraditional", 0x0409: "english"}.get(ui_language)

for language in [None, "english", "chinesesimplified", "chinesetraditional"]:
    label = language or "system"
    desktop_name = f"FuxWX-language-{os.getpid()}-{label}"
    desktop = user.CreateDesktopW(desktop_name, None, None, 0, 0x10000000, None)
    if not desktop:
        raise ctypes.WinError(ctypes.get_last_error())
    log = output / f"installer-language-{label}-{os.getpid()}.log"
    command = [str(installer), "/SP-", "/NORESTART", f"/LOG={log}"]
    if language:
        command.append(f"/LANG={language}")
    pi = Process()
    try:
        si = Startup(cb=ctypes.sizeof(Startup), desktop=desktop_name)
        if not kernel.CreateProcessW(None, ctypes.create_unicode_buffer(subprocess.list2cmdline(command)), None, None,
                                      False, 0x08000000, None, str(ROOT), ctypes.byref(si), ctypes.byref(pi)):
            raise ctypes.WinError(ctypes.get_last_error())
        deadline = time.monotonic() + 30
        content = ""
        while time.monotonic() < deadline:
            if log.exists():
                content = log.read_text(encoding="utf-8-sig", errors="replace")
                if "FuxWX installer language:" in content:
                    break
            time.sleep(0.1)
        selected = language or expected
        marker = f"FuxWX installer language: {selected}" if selected else "FuxWX installer language:"
        if marker not in content:
            raise AssertionError(f"{label}: missing expected language evidence in {log}")
        titles = []

        @CALLBACK
        def window(hwnd, _):
            text = ctypes.create_unicode_buffer(512)
            user.GetWindowTextW(hwnd, text, 512)
            if user.IsWindowVisible(hwnd) and "FuxWX" in text.value:
                titles.append(text.value)
            return True

        while not titles and time.monotonic() < deadline:
            user.EnumDesktopWindows(desktop, window, 0)
            time.sleep(0.1)
        if not titles:
            raise AssertionError(f"{label}: no visible installer wizard on its private desktop")
        print(f"PASS {label}: UI language {ui_language}; wizard {titles[0]}; no installation performed")
    finally:
        if pi.process:
            # Terminate only the bootstrap process created here and its wizard child.
            subprocess.run(["taskkill", "/PID", str(pi.pid), "/T", "/F"], capture_output=True, creationflags=0x08000000)
            kernel.CloseHandle(pi.thread)
            kernel.CloseHandle(pi.process)
        user.CloseDesktop(desktop)
