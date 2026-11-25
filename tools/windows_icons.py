"""Install the already-resampled ICO frames as Windows executable resources.

nsh 0.7.0 resamples straight RGBA, darkening translucent edges. Keep its stable
runtime and replace only its generated icon resources with our verified frames.
"""
import ctypes
from ctypes import wintypes as w
from pathlib import Path
import struct


def frames(data):
    reserved, kind, count = struct.unpack_from("<HHH", data)
    if reserved != 0 or kind != 1 or not count:
        raise ValueError("Invalid icon directory")
    result = []
    for index in range(count):
        width, height, colors, reserved, planes, bits, size, offset = struct.unpack_from("<BBBBHHII", data, 6 + index * 16)
        image = data[offset:offset + size]
        if len(image) != size:
            raise ValueError("Truncated icon frame")
        result.append((width, height, colors, reserved, planes, bits, image))
    return result


def embed(exe: Path, ico: Path):
    images = frames(ico.read_bytes())
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.BeginUpdateResourceW.argtypes = [w.LPCWSTR, w.BOOL]
    kernel.BeginUpdateResourceW.restype = w.HANDLE
    kernel.UpdateResourceW.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p, w.WORD, ctypes.c_void_p, w.DWORD]
    kernel.EndUpdateResourceW.argtypes = [w.HANDLE, w.BOOL]
    handle = kernel.BeginUpdateResourceW(str(exe), False)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    group = bytearray(struct.pack("<HHH", 0, 1, len(images)))
    try:
        for identifier, (width, height, colors, reserved, planes, bits, image) in enumerate(images, 1):
            buffer = ctypes.create_string_buffer(image)
            if not kernel.UpdateResourceW(handle, 3, identifier, 0, buffer, len(image)):
                raise ctypes.WinError(ctypes.get_last_error())
            group.extend(struct.pack("<BBBBHHIH", width, height, colors, reserved, planes, bits, len(image), identifier))
        buffer = ctypes.create_string_buffer(bytes(group))
        if not kernel.UpdateResourceW(handle, 14, 1, 0, buffer, len(group)):
            raise ctypes.WinError(ctypes.get_last_error())
    except BaseException:
        kernel.EndUpdateResourceW(handle, True)
        raise
    if not kernel.EndUpdateResourceW(handle, False):
        raise ctypes.WinError(ctypes.get_last_error())
    verify(exe, ico)


def verify(exe: Path, ico: Path):
    """Read the actual PE resources back; generating an ICO alone is insufficient."""
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.LoadLibraryExW.argtypes = [w.LPCWSTR, w.HANDLE, w.DWORD]
    kernel.LoadLibraryExW.restype = w.HANDLE
    kernel.FindResourceW.argtypes = [w.HANDLE, ctypes.c_void_p, ctypes.c_void_p]
    kernel.FindResourceW.restype = w.HANDLE
    kernel.LoadResource.argtypes = [w.HANDLE, w.HANDLE]
    kernel.LoadResource.restype = w.HANDLE
    kernel.LockResource.argtypes = [w.HANDLE]
    kernel.LockResource.restype = ctypes.c_void_p
    kernel.SizeofResource.argtypes = [w.HANDLE, w.HANDLE]
    kernel.FreeLibrary.argtypes = [w.HANDLE]
    library = kernel.LoadLibraryExW(str(exe), None, 0x22)
    if not library:
        raise ctypes.WinError(ctypes.get_last_error())

    def read(kind, identifier):
        resource = kernel.FindResourceW(library, identifier, kind)
        if not resource:
            raise ctypes.WinError(ctypes.get_last_error())
        size = kernel.SizeofResource(library, resource)
        return ctypes.string_at(kernel.LockResource(kernel.LoadResource(library, resource)), size)

    try:
        images = frames(ico.read_bytes())
        group = read(14, 1)
        if struct.unpack_from("<HHH", group) != (0, 1, len(images)):
            raise ValueError("Executable icon group differs from the generated ICO")
        for index, (_, _, _, _, _, _, image) in enumerate(images):
            identifier = struct.unpack_from("<H", group, 6 + index * 14 + 12)[0]
            if read(3, identifier) != image:
                raise ValueError(f"Executable icon frame {index} differs from the generated ICO")
    finally:
        kernel.FreeLibrary(library)
