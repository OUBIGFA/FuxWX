//! Port of WxCleaner scanner.py at 414dd2ed: size, prefix, then full SHA-256.
//! One directory walk and throttled snapshots replace redundant walks/UI callbacks.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File, Metadata},
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
    time::{Instant, UNIX_EPOCH},
};
use walkdir::WalkDir;

#[derive(Clone, Debug, Serialize)]
pub struct Entry {
    pub id: u64,
    pub path: PathBuf,
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
    #[serde(skip)]
    pub(crate) modified_ns: u128,
}

#[derive(Clone, Debug, Serialize)]
pub struct Group {
    pub hash: String,
    pub size: u64,
    pub files: Vec<Entry>,
}

#[derive(Clone, Debug, Serialize)]
pub struct Failure {
    pub path: PathBuf,
    pub reason: String,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Progress {
    pub phase: String,
    pub done: usize,
    pub total: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct Scan {
    pub root: PathBuf,
    pub scanned: usize,
    pub groups: Vec<Group>,
    pub skipped: Vec<Failure>,
    pub cancelled: bool,
}

fn timestamp(meta: &Metadata) -> Result<u128, String> {
    meta.modified()
        .map_err(|e| e.to_string())?
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .map_err(|e| e.to_string())
}

fn linked(meta: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        meta.file_type().is_symlink()
    }
}

/// Refuse replaced links, directories and files changed since the scan.
pub(crate) fn validate(file: &Entry, root: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(&file.path).map_err(|e| e.to_string())?;
    if linked(&meta)
        || !meta.is_file()
        || meta.len() != file.size
        || timestamp(&meta)? != file.modified_ns
    {
        return Err("文件已变更，请重新扫描".into());
    }
    let real = file.path.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(root) || real != file.path {
        return Err("文件位置已变更，请重新扫描".into());
    }
    Ok(())
}

fn hash(file: &Entry, partial: bool, cancel: &AtomicBool) -> Result<String, String> {
    let mut reader = File::open(&file.path).map_err(|e| e.to_string())?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 65536];
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("已停止扫描".into());
        }
        let count = reader
            .read(if partial {
                &mut buffer[..1024]
            } else {
                &mut buffer
            })
            .map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
        if partial {
            break;
        }
    }
    if timestamp(&reader.metadata().map_err(|e| e.to_string())?)? != file.modified_ns {
        return Err("读取期间文件发生变化".into());
    }
    Ok(format!("{:x}", digest.finalize()))
}

/// Scan only ordinary files below the chosen root; never follow directory links.
pub fn scan(
    root: &Path,
    cancel: &AtomicBool,
    mut progress: impl FnMut(Progress),
) -> Result<Scan, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("无法打开文件夹：{e}"))?;
    if !root.is_dir() {
        return Err("请选择文件夹".into());
    }
    let mut result = Scan {
        root: root.clone(),
        scanned: 0,
        groups: vec![],
        skipped: vec![],
        cancelled: false,
    };
    let mut sizes: BTreeMap<u64, Vec<Entry>> = BTreeMap::new();
    let mut tick = Instant::now();
    progress(Progress {
        phase: "正在读取文件夹".into(),
        ..Default::default()
    });
    for item in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| e.depth() == 0 || e.path().symlink_metadata().is_ok_and(|m| !linked(&m)))
    {
        if cancel.load(Ordering::Relaxed) {
            result.cancelled = true;
            break;
        }
        let item = match item {
            Ok(item) => item,
            Err(e) => {
                result.skipped.push(Failure {
                    path: e.path().unwrap_or(&root).to_owned(),
                    reason: e.to_string(),
                });
                continue;
            }
        };
        if !item.file_type().is_file() {
            continue;
        }
        result.scanned += 1;
        let meta = match item.metadata() {
            Ok(m) => m,
            Err(e) => {
                result.skipped.push(Failure {
                    path: item.path().into(),
                    reason: e.to_string(),
                });
                continue;
            }
        };
        if meta.len() > 0 {
            match timestamp(&meta) {
                Ok(ns) => sizes.entry(meta.len()).or_default().push(Entry {
                    id: result.scanned as u64,
                    path: item.path().into(),
                    name: item.file_name().to_string_lossy().into_owned(),
                    size: meta.len(),
                    modified_ms: (ns / 1_000_000) as u64,
                    modified_ns: ns,
                }),
                Err(reason) => result.skipped.push(Failure {
                    path: item.path().into(),
                    reason,
                }),
            }
        }
        if tick.elapsed().as_millis() >= 100 {
            progress(Progress {
                phase: "正在按大小筛选".into(),
                done: result.scanned,
                total: 0,
            });
            tick = Instant::now();
        }
    }
    let mut candidates: Vec<Vec<Entry>> = sizes.into_values().filter(|v| v.len() > 1).collect();
    for partial in [true, false] {
        let total = candidates.iter().map(Vec::len).sum();
        let mut grouped: BTreeMap<(u64, String), Vec<Entry>> = BTreeMap::new();
        let mut done = 0;
        for file in candidates.into_iter().flatten() {
            if cancel.load(Ordering::Relaxed) {
                result.cancelled = true;
                break;
            }
            match hash(&file, partial, cancel) {
                Ok(hash) => grouped.entry((file.size, hash)).or_default().push(file),
                Err(reason) => result.skipped.push(Failure {
                    path: file.path.clone(),
                    reason,
                }),
            }
            done += 1;
            if tick.elapsed().as_millis() >= 100 || done == total {
                progress(Progress {
                    phase: if partial {
                        "正在检查文件头"
                    } else {
                        "正在校验完整内容"
                    }
                    .into(),
                    done,
                    total,
                });
                tick = Instant::now();
            }
        }
        result.cancelled |= cancel.load(Ordering::Relaxed);
        if !partial && !result.cancelled {
            for ((size, hash), mut files) in grouped {
                if files.len() < 2 {
                    continue;
                }
                files.sort_by(|a, b| {
                    a.path
                        .as_os_str()
                        .len()
                        .cmp(&b.path.as_os_str().len())
                        .then(a.path.cmp(&b.path))
                });
                result.groups.push(Group { hash, size, files });
            }
            result.groups.sort_by(|a, b| {
                (b.size * (b.files.len() as u64 - 1))
                    .cmp(&(a.size * (a.files.len() as u64 - 1)))
                    .then(a.hash.cmp(&b.hash))
            });
            break;
        }
        candidates = grouped.into_values().filter(|v| v.len() > 1).collect();
    }
    if result.cancelled {
        result.groups.clear();
    }
    Ok(result)
}
