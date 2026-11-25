//! Small async JSON bridge. Heavy operations stay on workers; polling copies only counters.
use crate::{DeleteMode, Progress, Report, Scan, clean, scan};
use nsh_core::prelude::*;
use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex, OnceLock,
        atomic::{AtomicBool, Ordering},
    },
};

#[derive(Clone, Default, Serialize)]
struct Status {
    busy: bool,
    phase: String,
    done: usize,
    total: usize,
    revision: u64,
    error: Option<String>,
    summary: Option<Summary>,
}
#[derive(Clone, Serialize)]
struct Summary {
    total: usize,
    succeeded: usize,
    failed: usize,
    pending: usize,
    bytes: u64,
    cancelled: bool,
}
#[derive(Default)]
struct State {
    status: Status,
    scan: Option<Arc<Scan>>,
    report: Option<Report>,
}
#[derive(Default)]
struct Runtime {
    state: Mutex<State>,
    cancel: AtomicBool,
}

fn runtime() -> &'static Runtime {
    static RUNTIME: OnceLock<Runtime> = OnceLock::new();
    RUNTIME.get_or_init(Runtime::default)
}
fn update(p: Progress) {
    let mut state = runtime().state.lock().unwrap();
    state.status.phase = p.phase;
    state.status.done = p.done;
    state.status.total = p.total;
}
fn begin(phase: &str) -> Result<(), String> {
    let mut state = runtime().state.lock().unwrap();
    if state.status.busy {
        return Err("已有任务正在进行".into());
    }
    state.status.busy = true;
    state.status.phase = phase.into();
    state.status.done = 0;
    state.status.total = 0;
    state.status.error = None;
    state.status.summary = None;
    runtime().cancel.store(false, Ordering::Relaxed);
    Ok(())
}
fn spawn(work: impl FnOnce() -> Result<(), String> + Send + 'static) {
    std::thread::spawn(move || {
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(work));
        let mut state = runtime().state.lock().unwrap();
        state.status.busy = false;
        match outcome {
            Ok(Ok(())) => {}
            Ok(Err(error)) => {
                state.status.error = Some(error);
                state.status.phase = "任务未完成".into();
            }
            Err(_) => {
                state.status.error = Some("任务意外结束，请重新扫描".into());
                state.status.phase = "任务未完成".into();
            }
        }
    });
}

#[derive(Deserialize)]
struct Selection {
    ids: Vec<u64>,
    mode: DeleteMode,
}

fn dispatch(route: &str, body: &str) -> Result<String, String> {
    match route {
        "status" => serde_json::to_string(&runtime().state.lock().unwrap().status)
            .map_err(|e| e.to_string()),
        "results" => {
            let scan = runtime().state.lock().unwrap().scan.clone();
            serde_json::to_string(&scan.as_deref()).map_err(|e| e.to_string())
        }
        "report" => serde_json::to_string(&runtime().state.lock().unwrap().report)
            .map_err(|e| e.to_string()),
        "scan" => {
            let path: String = serde_json::from_str(body).map_err(|e| e.to_string())?;
            begin("正在读取文件夹")?;
            spawn(move || {
                let result = scan(&PathBuf::from(path), &runtime().cancel, update)?;
                let mut state = runtime().state.lock().unwrap();
                state.status.phase = if result.cancelled {
                    "扫描已停止"
                } else {
                    "扫描完成"
                }
                .into();
                state.status.revision += 1;
                state.scan = Some(Arc::new(result));
                state.report = None;
                Ok(())
            });
            Ok("null".into())
        }
        "clean" => {
            let request: Selection = serde_json::from_str(body).map_err(|e| e.to_string())?;
            let scan = runtime()
                .state
                .lock()
                .unwrap()
                .scan
                .clone()
                .ok_or("请先扫描文件夹")?;
            begin("准备清理")?;
            spawn(move || {
                let report = clean(&scan, &request.ids, request.mode, &runtime().cancel, update)?;
                let removed: std::collections::HashSet<_> =
                    report.succeeded.iter().copied().collect();
                let mut scan = (*scan).clone();
                for group in &mut scan.groups {
                    group.files.retain(|f| !removed.contains(&f.id));
                }
                scan.groups.retain(|g| g.files.len() > 1);
                let mut state = runtime().state.lock().unwrap();
                state.status.phase = if report.cancelled {
                    "清理已停止"
                } else {
                    "清理完成"
                }
                .into();
                state.status.summary = Some(Summary {
                    total: report.total,
                    succeeded: report.succeeded.len(),
                    failed: report.failed.len(),
                    pending: report.pending,
                    bytes: report.bytes,
                    cancelled: report.cancelled,
                });
                state.status.revision += 1;
                state.report = Some(report);
                state.scan = Some(Arc::new(scan));
                Ok(())
            });
            Ok("null".into())
        }
        "cancel" => {
            runtime().cancel.store(true, Ordering::Relaxed);
            Ok("null".into())
        }
        "folder" => serde_json::to_string(&pick_folder()?).map_err(|e| e.to_string()),
        "default" => {
            let home = std::env::var_os("USERPROFILE")
                .map(PathBuf::from)
                .unwrap_or_default();
            let found = [
                home.join("Documents/xwechat_files"),
                home.join("Documents/WeChat Files"),
            ]
            .into_iter()
            .find(|p| p.is_dir());
            serde_json::to_string(&found).map_err(|e| e.to_string())
        }
        "preview" => {
            use base64::Engine;
            let id: u64 = serde_json::from_str(body).map_err(|e| e.to_string())?;
            let scan = runtime()
                .state
                .lock()
                .unwrap()
                .scan
                .clone()
                .ok_or("请先扫描")?;
            let file = scan
                .groups
                .iter()
                .flat_map(|g| &g.files)
                .find(|f| f.id == id)
                .ok_or("文件不在当前结果中")?;
            crate::scanner::validate(file, &scan.root)?;
            if file.size > 16 * 1024 * 1024 {
                return Err("图片超过 16 MB，请打开文件位置查看".into());
            }
            let mime = match file
                .path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str()
            {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                "bmp" => "image/bmp",
                _ => return Err("此类文件请打开文件位置查看".into()),
            };
            // Only the selected scanned image crosses the UI boundary, not filesystem access.
            let bytes = std::fs::read(&file.path).map_err(|e| e.to_string())?;
            let url = format!(
                "data:{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            );
            serde_json::to_string(&url).map_err(|e| e.to_string())
        }
        "reveal" => {
            let id: u64 = serde_json::from_str(body).map_err(|e| e.to_string())?;
            let state = runtime().state.lock().unwrap();
            let file = state
                .scan
                .as_ref()
                .and_then(|s| s.groups.iter().flat_map(|g| &g.files).find(|f| f.id == id))
                .ok_or("文件不在当前结果中")?;
            #[cfg(windows)]
            std::process::Command::new("explorer.exe")
                .arg(format!("/select,{}", file.path.display()))
                .spawn()
                .map_err(|e| e.to_string())?;
            Ok("null".into())
        }
        _ => Err("未知操作".into()),
    }
}

#[cfg(windows)]
fn pick_folder() -> Result<Option<String>, String> {
    use windows::Win32::{System::Com::*, UI::Shell::*};
    // This runs on a blocking worker. Pair successful COM initialization on this thread.
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|e| e.to_string())?;
        struct Apartment;
        impl Drop for Apartment {
            fn drop(&mut self) {
                unsafe {
                    CoUninitialize();
                }
            }
        }
        let _apartment = Apartment;
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|e| e.to_string())?;
        dialog
            .SetOptions(FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST)
            .map_err(|e| e.to_string())?;
        if let Err(e) = dialog.Show(None) {
            if e.code().0 as u32 == 0x800704c7 {
                return Ok(None);
            }
            return Err(e.to_string());
        }
        let item = dialog.GetResult().map_err(|e| e.to_string())?;
        let path = item
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|e| e.to_string())?;
        let text = path.to_string().map_err(|e| e.to_string());
        CoTaskMemFree(Some(path.as_ptr().cast()));
        text.map(Some)
    }
}
#[cfg(not(windows))]
fn pick_folder() -> Result<Option<String>, String> {
    Err("当前测试版本只支持 Windows".into())
}

/// Native file scanner and cleanup service for the FuxWX interface.
#[module]
pub struct Cleaner;
#[module]
impl Cleaner {
    /// Run an operation off the UI thread. Results and errors are explicit.
    pub async fn request(route: String, body: String) -> Result<String, String> {
        blocking(move || dispatch(&route, &body))
            .await
            .map_err(|e| format!("后台任务失败：{e}"))?
    }
}
