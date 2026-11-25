//! nsh 0.7.0 leaves packaged windows on a single class icon. Select small/big
//! resource frames explicitly on the UI thread, after open and display changes.
use std::cell::RefCell;
use windows::{
    Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
        UI::{
            HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi},
            WindowsAndMessaging::*,
        },
    },
    core::{BOOL, PCWSTR},
};

struct Icons(Vec<(i32, HICON)>);
impl Drop for Icons {
    fn drop(&mut self) {
        // Handles created without LR_SHARED belong to this UI thread and live
        // until its windows have closed, including icons reused across monitors.
        for (_, icon) in self.0.drain(..) {
            unsafe {
                let _ = DestroyIcon(icon);
            }
        }
    }
}
thread_local! { static ICONS: RefCell<Icons> = const { RefCell::new(Icons(Vec::new())) }; }

fn load(side: i32) -> Option<HICON> {
    ICONS.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some((_, icon)) = cache.0.iter().find(|(size, _)| *size == side) {
            return Some(*icon);
        }
        // Resource 1 is the app icon written by the packaging script. A bare
        // development host has no app resource, so it keeps nsh's supplied icon.
        let instance = unsafe { GetModuleHandleW(None) }.ok()?;
        let icon = unsafe {
            LoadImageW(
                Some(instance.into()),
                PCWSTR(1 as _),
                IMAGE_ICON,
                side,
                side,
                IMAGE_FLAGS(0),
            )
        }
        .ok()?;
        let icon = HICON(icon.0);
        cache.0.push((side, icon));
        Some(icon)
    })
}

unsafe extern "system" fn update(hwnd: HWND, _: LPARAM) -> BOOL {
    let mut class = [0u16; 64];
    let count = unsafe { GetClassNameW(hwnd, &mut class) };
    if String::from_utf16_lossy(&class[..count as usize]) != "NshWindow" {
        return BOOL(1);
    }
    let dpi = unsafe { GetDpiForWindow(hwnd) }.max(96);
    for (metric, kind) in [(SM_CXSMICON, ICON_SMALL), (SM_CXICON, ICON_BIG)] {
        let size = unsafe { GetSystemMetricsForDpi(metric, dpi) };
        if let Some(icon) = load(size) {
            unsafe {
                SendMessageW(
                    hwnd,
                    WM_SETICON,
                    Some(WPARAM(kind as usize)),
                    Some(LPARAM(icon.0 as isize)),
                );
            }
        }
    }
    BOOL(1)
}

pub fn sync() {
    // Enumerate only this app's UI thread; never address other programs' windows.
    unsafe {
        let _ = EnumThreadWindows(GetCurrentThreadId(), Some(update), LPARAM(0));
    }
}
