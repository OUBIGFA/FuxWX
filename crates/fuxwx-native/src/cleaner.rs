//! Bounded background batches: one Shell operation per 64 files, not ten per-file workers.
use crate::{Entry, Failure, Progress, Scan, scanner::validate};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    sync::atomic::{AtomicBool, Ordering},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DeleteMode {
    Recycle,
    Permanent,
}

#[derive(Clone, Debug, Default, Serialize)]
pub struct Report {
    pub total: usize,
    pub succeeded: Vec<u64>,
    pub failed: Vec<Failure>,
    pub pending: usize,
    pub bytes: u64,
    pub cancelled: bool,
}

/// Clean only scanned identities and keep at least one unchanged file per group.
/// A recycle failure is always reported; it never falls back to remove_file.
pub fn clean(
    scan: &Scan,
    ids: &[u64],
    mode: DeleteMode,
    cancel: &AtomicBool,
    mut progress: impl FnMut(Progress),
) -> Result<Report, String> {
    let ids: HashSet<_> = ids.iter().copied().collect();
    let mut work: Vec<(&Entry, usize)> = vec![];
    let mut retained_groups: Vec<Vec<&Entry>> = vec![];
    for group in &scan.groups {
        let retained: Vec<_> = group
            .files
            .iter()
            .filter(|f| !ids.contains(&f.id))
            .collect();
        let selected: Vec<_> = group.files.iter().filter(|f| ids.contains(&f.id)).collect();
        if !selected.is_empty() && retained.is_empty() {
            return Err("每组至少保留一个文件".into());
        }
        // Share one retained list per group; partial selections must not allocate
        // selected_count * retained_count references for a very large group.
        let group_index = retained_groups.len();
        for file in selected {
            work.push((file, group_index));
        }
        retained_groups.push(retained);
    }
    if work.len() != ids.len() {
        return Err("所选文件不属于当前扫描，请重新扫描".into());
    }
    let mut report = Report {
        total: work.len(),
        ..Default::default()
    };
    for batch in work.chunks(64) {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        let mut ready = vec![];
        for (file, group_index) in batch {
            let retained = &retained_groups[*group_index];
            let check = validate(file, &scan.root).and_then(|_| {
                if retained.iter().any(|r| validate(r, &scan.root).is_ok()) {
                    Ok(())
                } else {
                    Err("保留文件已变化或无法访问，请重新扫描".into())
                }
            });
            match check {
                Ok(()) => ready.push(*file),
                Err(reason) => report.failed.push(Failure {
                    path: file.path.clone(),
                    reason,
                }),
            }
        }
        match mode {
            DeleteMode::Recycle => {
                if !ready.is_empty() && !cancel.load(Ordering::Relaxed) {
                    // trash uses IFileOperation with ALLOWUNDO + WANTNUKEWARNING + NO_UI:
                    // unavailable/full bins are refused instead of silently destroying files.
                    let outcome = trash::delete_all(ready.iter().map(|f| &f.path));
                    for file in ready {
                        match fs::symlink_metadata(&file.path) {
                            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                                report.succeeded.push(file.id);
                                report.bytes += file.size;
                            }
                            _ => report.failed.push(Failure {
                                path: file.path.clone(),
                                reason: outcome
                                    .as_ref()
                                    .err()
                                    .map(ToString::to_string)
                                    .unwrap_or_else(|| "文件未移到回收站".into()),
                            }),
                        }
                    }
                }
            }
            DeleteMode::Permanent => {
                for file in ready {
                    if cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    match fs::remove_file(&file.path) {
                        Ok(()) => {
                            report.succeeded.push(file.id);
                            report.bytes += file.size;
                        }
                        Err(e) => report.failed.push(Failure {
                            path: file.path.clone(),
                            reason: e.to_string(),
                        }),
                    }
                }
            }
        }
        progress(Progress {
            phase: match mode {
                DeleteMode::Recycle => "正在移到回收站",
                DeleteMode::Permanent => "正在彻底删除",
            }
            .into(),
            done: report.succeeded.len() + report.failed.len(),
            total: report.total,
        });
    }
    report.pending = report.total - report.succeeded.len() - report.failed.len();
    report.cancelled = cancel.load(Ordering::Relaxed) && report.pending > 0;
    Ok(report)
}
