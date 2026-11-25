"""Inspect the packaged application's actual small/big icons on a private desktop."""
import ctypes
from ctypes import wintypes as w
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from desktop_test import Startup, Process

ROOT = Path(__file__).resolve().parents[1]
exe = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "dist/package/FuxWX/FuxWX.exe"
user = ctypes.WinDLL("user32", use_last_error=True)
kernel = ctypes.WinDLL("kernel32", use_last_error=True)
gdi = ctypes.WinDLL("gdi32", use_last_error=True)
user.CreateDesktopW.argtypes = [w.LPCWSTR, w.LPCWSTR, ctypes.c_void_p, w.DWORD, w.DWORD, ctypes.c_void_p]
user.CreateDesktopW.restype = w.HANDLE
user.CloseDesktop.argtypes = [w.HANDLE]
kernel.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, w.BOOL, w.DWORD,
                                ctypes.c_void_p, w.LPCWSTR, ctypes.POINTER(Startup), ctypes.POINTER(Process)]
kernel.CloseHandle.argtypes = [w.HANDLE]
kernel.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
user.GetWindowThreadProcessId.argtypes = [w.HWND, ctypes.POINTER(w.DWORD)]
user.GetWindowTextW.argtypes = [w.HWND, w.LPWSTR, ctypes.c_int]
user.GetDpiForWindow.argtypes = [w.HWND]
user.SendMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
user.SendMessageW.restype = ctypes.c_ssize_t
user.PostMessageW.argtypes = [w.HWND, w.UINT, w.WPARAM, w.LPARAM]
user.GetClassLongPtrW.argtypes = [w.HWND, ctypes.c_int]
user.GetClassLongPtrW.restype = ctypes.c_size_t
gdi.DeleteObject.argtypes = [w.HANDLE]
CALLBACK = ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
user.EnumDesktopWindows.argtypes = [w.HANDLE, CALLBACK, w.LPARAM]


class IconInfo(ctypes.Structure):
    _fields_ = [("icon", w.BOOL), ("x", w.DWORD), ("y", w.DWORD), ("mask", w.HANDLE), ("color", w.HANDLE)]


class Bitmap(ctypes.Structure):
    _fields_ = [("type", w.LONG), ("width", w.LONG), ("height", w.LONG), ("width_bytes", w.LONG),
                ("planes", w.WORD), ("bpp", w.WORD), ("bits", ctypes.c_void_p)]


user.GetIconInfo.argtypes = [w.HANDLE, ctypes.POINTER(IconInfo)]
gdi.GetObjectW.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_void_p]


def render_icon(handle, side, background):
    from PIL import Image
    import struct
    gdi.CreateCompatibleDC.argtypes = [w.HANDLE]
    gdi.CreateCompatibleDC.restype = w.HANDLE
    gdi.CreateDIBSection.argtypes = [w.HANDLE, ctypes.c_void_p, w.UINT, ctypes.POINTER(ctypes.c_void_p), w.HANDLE, w.DWORD]
    gdi.CreateDIBSection.restype = w.HANDLE
    gdi.SelectObject.argtypes = [w.HANDLE, w.HANDLE]
    gdi.SelectObject.restype = w.HANDLE
    gdi.DeleteDC.argtypes = [w.HANDLE]
    user.DrawIconEx.argtypes = [w.HANDLE, ctypes.c_int, ctypes.c_int, w.HANDLE, ctypes.c_int, ctypes.c_int, w.UINT, w.HANDLE, w.UINT]
    dc = gdi.CreateCompatibleDC(None)
    header = ctypes.create_string_buffer(struct.pack("<IiiHHIIiiII", 40, side, -side, 1, 32, 0, side*side*4, 0, 0, 0, 0))
    pointer = ctypes.c_void_p()
    bitmap = gdi.CreateDIBSection(dc, header, 0, ctypes.byref(pointer), None, 0)
    if not bitmap:
        gdi.DeleteDC(dc)
        raise ctypes.WinError(ctypes.get_last_error())
    old = gdi.SelectObject(dc, bitmap)
    try:
        color = bytes([background, background, background, 255]) * (side*side)
        ctypes.memmove(pointer, color, len(color))
        if not user.DrawIconEx(dc, 0, 0, handle, side, side, 0, None, 3):
            raise ctypes.WinError(ctypes.get_last_error())
        gdi.GdiFlush()
        return Image.frombytes("RGBA", (side, side), ctypes.string_at(pointer, len(color)), "raw", "BGRA").convert("RGB")
    finally:
        gdi.SelectObject(dc, old)
        gdi.DeleteObject(bitmap)
        gdi.DeleteDC(dc)


def dimensions(handle):
    if not handle:
        return None
    info = IconInfo()
    if not user.GetIconInfo(handle, ctypes.byref(info)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        bitmap = Bitmap()
        gdi.GetObjectW(info.color or info.mask, ctypes.sizeof(bitmap), ctypes.byref(bitmap))
        return [bitmap.width, bitmap.height if info.color else bitmap.height // 2]
    finally:
        if info.color: gdi.DeleteObject(info.color)
        if info.mask: gdi.DeleteObject(info.mask)


name = f"FuxWX-icons-{os.getpid()}"
desktop = user.CreateDesktopW(name, None, None, 0, 0x10000000, None)
if not desktop:
    raise ctypes.WinError(ctypes.get_last_error())
pi = Process()
found = []
try:
    si = Startup(cb=ctypes.sizeof(Startup), desktop=name)
    if not kernel.CreateProcessW(None, ctypes.create_unicode_buffer(subprocess.list2cmdline([str(exe)])), None, None, False,
                                 0x08000000, None, str(exe.parent), ctypes.byref(si), ctypes.byref(pi)):
        raise ctypes.WinError(ctypes.get_last_error())

    @CALLBACK
    def window(hwnd, _):
        pid = w.DWORD()
        user.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        title = ctypes.create_unicode_buffer(128)
        user.GetWindowTextW(hwnd, title, 128)
        if pid.value == pi.pid and title.value == "FuxWX":
            found.append(hwnd)
        return True

    deadline = time.monotonic() + 15
    while not found and time.monotonic() < deadline:
        user.EnumDesktopWindows(desktop, window, 0)
        time.sleep(.05)
    if not found:
        raise AssertionError("No FuxWX test window appeared")
    hwnd = found[-1]
    dpi = user.GetDpiForWindow(hwnd)
    deadline = time.monotonic() + 3
    while not user.SendMessageW(hwnd, 0x7f, 0, dpi) and time.monotonic() < deadline:
        time.sleep(.05)
    actual = {"dpi": dpi, "small": dimensions(user.SendMessageW(hwnd, 0x7f, 0, dpi)),
              "big": dimensions(user.SendMessageW(hwnd, 0x7f, 1, dpi)),
              "class": dimensions(user.GetClassLongPtrW(hwnd, -14))}
    print(json.dumps(actual))
    small = user.GetSystemMetricsForDpi(49, dpi)
    big = user.GetSystemMetricsForDpi(11, dpi)
    from PIL import Image, ImageDraw
    canvas = Image.new("RGB", (720, 430), "#dddddd")
    draw = ImageDraw.Draw(canvas)
    for column, (side, kind) in enumerate([(small, 0), (big, 1)]):
        handle = user.SendMessageW(hwnd, 0x7f, kind, dpi) or user.GetClassLongPtrW(hwnd, -14)
        draw.text((column*360+12, 8), f'{"Caption" if kind == 0 else "Taskbar"}: {side}px / DPI {dpi}', fill="black")
        for row, background in enumerate([255, 32]):
            frame = render_icon(handle, side, background)
            canvas.paste(frame, (column*360+12, 38+row*190))
            canvas.paste(frame.resize((160,160), Image.Resampling.NEAREST), (column*360+100,38+row*190))
    output = ROOT / "dist/reports/icon-quality"
    output.mkdir(parents=True, exist_ok=True)
    canvas.save(output / ("runtime-after.png" if actual["small"] else "runtime-before.png"))
    assert actual["small"] == [small, small], "Caption must use its exact DPI-specific frame, not a scaled class icon"
    assert actual["big"] == [big, big], "Taskbar/Alt+Tab icon must use its DPI-specific frame"
    # Validate the same resource-loading path at common scaling factors without
    # changing the user's display settings. The live window above uses its real DPI.
    kernel.LoadLibraryExW.argtypes = [w.LPCWSTR, w.HANDLE, w.DWORD]
    kernel.LoadLibraryExW.restype = w.HANDLE
    kernel.FreeLibrary.argtypes = [w.HANDLE]
    user.LoadImageW.argtypes = [w.HANDLE, ctypes.c_void_p, w.UINT, ctypes.c_int, ctypes.c_int, w.UINT]
    user.LoadImageW.restype = w.HANDLE
    user.DestroyIcon.argtypes = [w.HANDLE]
    library = kernel.LoadLibraryExW(str(exe), None, 0x22)
    if not library:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        from PIL import ImageChops
        ico = Image.open(ROOT / "dist/icons/FuxWX.ico")
        for scale in [96, 120, 144, 168, 192, 240, 288]:
            for metric in [49, 11]:
                side = user.GetSystemMetricsForDpi(metric, scale)
                icon = user.LoadImageW(library, 1, 1, side, side, 0)
                try:
                    assert dimensions(icon) == [side, side]
                    frame = ico.ico.getimage((side, side)).convert("RGBA")
                    for background in [255, 32]:
                        expected = Image.new("RGBA", frame.size, (background,)*3+(255,))
                        expected.alpha_composite(frame)
                        actual_image = render_icon(icon, side, background)
                        difference = ImageChops.difference(actual_image, expected.convert("RGB"))
                        assert max(high for low, high in difference.getextrema()) <= 2, "Windows icon rendering introduced a dark fringe"
                finally:
                    if icon: user.DestroyIcon(icon)
        print("PASS native icon frames and light/dark compositing at 100%, 125%, 150%, 175%, 200%, 250%, 300%")
    finally:
        kernel.FreeLibrary(library)
finally:
    for hwnd in found:
        user.PostMessageW(hwnd, 0x10, 0, 0)
    if pi.process:
        if kernel.WaitForSingleObject(pi.process, 5000) == 0x102:
            subprocess.run(["taskkill", "/PID", str(pi.pid), "/T", "/F"], capture_output=True, creationflags=0x08000000)
        kernel.CloseHandle(pi.thread)
        kernel.CloseHandle(pi.process)
    user.CloseDesktop(desktop)
