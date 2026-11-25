"""Run native nsh UI tests on an isolated Windows desktop, without switching it.

The test process and its children inherit the private desktop. nsh's own test
driver addresses its test windows and captures their rendered content there.
"""
import ctypes
from ctypes import wintypes as w
import os
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


class Startup(ctypes.Structure):
    _fields_ = [("cb", w.DWORD), ("reserved", w.LPWSTR), ("desktop", w.LPWSTR), ("title", w.LPWSTR),
                ("x", w.DWORD), ("y", w.DWORD), ("width", w.DWORD), ("height", w.DWORD),
                ("chars_x", w.DWORD), ("chars_y", w.DWORD), ("fill", w.DWORD), ("flags", w.DWORD),
                ("show", w.WORD), ("reserved_size", w.WORD), ("reserved_data", ctypes.c_void_p),
                ("stdin", w.HANDLE), ("stdout", w.HANDLE), ("stderr", w.HANDLE)]


class Process(ctypes.Structure):
    _fields_ = [("process", w.HANDLE), ("thread", w.HANDLE), ("pid", w.DWORD), ("tid", w.DWORD)]


def main():
    if os.name != "nt":
        raise SystemExit("Private desktop verification requires Windows")
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
    kernel.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
    desktop_name = f"FuxWX-test-{os.getpid()}"
    desktop = user.CreateDesktopW(desktop_name, None, None, 0, 0x10000000, None)
    if not desktop:
        raise ctypes.WinError(ctypes.get_last_error())
    output = ROOT / "dist" / "reports"
    output.mkdir(parents=True, exist_ok=True)
    fixture = ROOT / "_temp" / f"desktop-{os.getpid()}"
    fixture.mkdir(parents=True, exist_ok=True)
    for index in range(80):
        name = f"项目资料-{index + 1:03}"
        content = (f"FuxWX synthetic document {index}\n" * 128).encode("utf-8")
        (fixture / f"{name}.txt").write_bytes(content)
        (fixture / f"{name}-副本.txt").write_bytes(content)
    preview_fixture = fixture / "preview"
    preview_fixture.mkdir()
    for name in ("示例图片.png", "示例图片-副本.png"):
        (preview_fixture / name).write_bytes((ROOT / "assets/branding/FuxWX_logo.png").read_bytes())
    (ROOT / ".local/desktop-fixture.json").write_text(json.dumps({"folder": str(fixture), "preview": str(preview_fixture), "reports": str(output)}, ensure_ascii=False), encoding="utf-8")
    log = output / "desktop.log"
    command = [str(ROOT / ".local/toolchains/nsh-0.7.0/nsh/bin/nsh.exe"), "test", "--target", "windows", *sys.argv[1:]]
    # File handles are inherited only by this test process; no user console is opened.
    import msvcrt
    with log.open("wb") as stream:
        handle = msvcrt.get_osfhandle(stream.fileno())
        os.set_handle_inheritable(handle, True)
        startup = Startup(cb=ctypes.sizeof(Startup), desktop=desktop_name, flags=0x100, stdout=handle, stderr=handle)
        process = Process()
        try:
            if not kernel.CreateProcessW(None, ctypes.create_unicode_buffer(subprocess.list2cmdline(command)), None, None,
                                          True, 0x08000000, None, str(ROOT), ctypes.byref(startup), ctypes.byref(process)):
                raise ctypes.WinError(ctypes.get_last_error())
            deadline = time.monotonic() + 900
            while kernel.WaitForSingleObject(process.process, 1000) == 0x102:
                if time.monotonic() > deadline:
                    kernel.TerminateProcess(process.process, 124)
                    raise TimeoutError("Native test exceeded 15 minutes; see dist/reports/desktop.log")
            code = w.DWORD()
            kernel.GetExitCodeProcess(process.process, ctypes.byref(code))
        finally:
            for h in (process.thread, process.process):
                if h: kernel.CloseHandle(h)
            user.CloseDesktop(desktop)
    print(log.read_text(encoding="utf-8", errors="replace")[-14000:])
    if code.value == 0 and any("flow.test.tsx" in arg for arg in sys.argv[1:]):
        remaining = list(fixture.glob("*.txt"))
        if len(remaining) != 80 or any("副本" in p.name for p in remaining):
            raise AssertionError("Desktop cleanup did not leave exactly the 80 original files")
        print("Verified on disk: 80 original files retained, 80 duplicate files removed")
    return code.value


if __name__ == "__main__":
    raise SystemExit(main())
