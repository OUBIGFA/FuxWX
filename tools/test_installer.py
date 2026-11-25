"""Install, launch and uninstall the test package on a private Windows desktop."""
import ctypes
from ctypes import wintypes as w
import os
from pathlib import Path
import subprocess
import sys
import time
import winreg
from desktop_test import Startup, Process

ROOT = Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "dist/releases/FuxWX-0.1.0.exe"
TARGET = ROOT / "_temp" / f"installer-{os.getpid()}"
REGISTRY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\io.github.oubigfa.fuxwx_is1"

try:
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REGISTRY):
        raise SystemExit("Existing FuxWX installation found; preserve it and skip isolated installation test")
except FileNotFoundError:
    pass

user = ctypes.WinDLL("user32", use_last_error=True)
kernel = ctypes.WinDLL("kernel32", use_last_error=True)
user.CreateDesktopW.argtypes = [w.LPCWSTR, w.LPCWSTR, ctypes.c_void_p, w.DWORD, w.DWORD, ctypes.c_void_p]
user.CreateDesktopW.restype = w.HANDLE
user.CloseDesktop.argtypes = [w.HANDLE]
kernel.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, w.BOOL, w.DWORD,
                                ctypes.c_void_p, w.LPCWSTR, ctypes.POINTER(Startup), ctypes.POINTER(Process)]
kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
kernel.GetExitCodeProcess.argtypes = [w.HANDLE, ctypes.POINTER(w.DWORD)]
kernel.CloseHandle.argtypes = [w.HANDLE]
user.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
user.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
user.IsWindowVisible.argtypes = [w.HWND]
user.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
user.SendMessageTimeoutW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM, w.UINT, w.UINT, ctypes.POINTER(ctypes.c_size_t)]
CALLBACK = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
user.EnumDesktopWindows.argtypes = [w.HANDLE, CALLBACK, w.LPARAM]
desktop_name = f"FuxWX-installer-{os.getpid()}"
desktop = user.CreateDesktopW(desktop_name, None, None, 0, 0x10000000, None)
if not desktop:
    raise ctypes.WinError(ctypes.get_last_error())


def start(args):
    si = Startup(cb=ctypes.sizeof(Startup), desktop=desktop_name)
    pi = Process()
    if not kernel.CreateProcessW(None, ctypes.create_unicode_buffer(subprocess.list2cmdline([str(a) for a in args])),
                                  None, None, False, 0x08000000, None, str(ROOT), ctypes.byref(si), ctypes.byref(pi)):
        raise ctypes.WinError(ctypes.get_last_error())
    kernel.CloseHandle(pi.thread)
    return pi


def finish(pi, timeout=120):
    try:
        deadline = time.monotonic() + timeout
        while kernel.WaitForSingleObject(pi.process, 250) == 0x102:
            if time.monotonic() > deadline:
                raise TimeoutError(f"Process {pi.pid} did not finish; retained test directory {TARGET}")
        code = w.DWORD()
        kernel.GetExitCodeProcess(pi.process, ctypes.byref(code))
        if code.value:
            raise RuntimeError(f"Process exited with {code.value}")
    finally:
        kernel.CloseHandle(pi.process)


try:
    TARGET.mkdir(parents=True)
    finish(start([INSTALLER, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/NOICONS", "/SP-", f"/DIR={TARGET}", f"/LOG={ROOT / 'dist/reports/install.log'}"]))
    for name in ["FuxWX.exe", "LICENSE.txt", "THIRD_PARTY_NOTICES.txt", "nsh/app.json", "nsh/bundle.nshc", "unins000.exe"]:
        if not (TARGET / name).is_file():
            raise AssertionError(f"Installer omitted {name}")
    app = start([TARGET / "FuxWX.exe"])
    found = []

    @CALLBACK
    def inspect(hwnd, _):
        pid = w.DWORD()
        user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        title = ctypes.create_unicode_buffer(512)
        user.GetWindowTextW(hwnd, title, 512)
        if pid.value == app.pid and user.IsWindowVisible(hwnd) and title.value == "FuxWX":
            found.append(hwnd)
        return True

    deadline = time.monotonic() + 30
    while not found and time.monotonic() < deadline:
        user.EnumDesktopWindows(desktop, inspect, 0)
        time.sleep(0.1)
    if not found:
        raise AssertionError("Installed application did not show FuxWX on its private desktop")
    result = ctypes.c_size_t()
    if not user.SendMessageTimeoutW(found[0], 0, 0, 0, 2, 1000, ctypes.byref(result)):
        raise AssertionError("Installed application did not respond within one second")
    user.PostMessageW(found[0], 0x10, 0, 0)
    finish(app, 15)
    finish(start([TARGET / "unins000.exe", "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", f"/LOG={ROOT / 'dist/reports/uninstall.log'}"]))
    if (TARGET / "FuxWX.exe").exists():
        raise AssertionError("Uninstaller left the executable")
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REGISTRY):
            raise AssertionError("Uninstaller left its registration")
    except FileNotFoundError:
        pass
    print("Installer PASS: installed all files, launched responsive FuxWX, closed normally, uninstalled and removed registration")
finally:
    user.CloseDesktop(desktop)
