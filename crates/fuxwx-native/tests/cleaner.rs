use fuxwx_native::{DeleteMode, clean, scan};
use std::{fs, sync::atomic::AtomicBool};

fn files() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    fs::write(dir.path().join("保留.txt"), b"same content").unwrap();
    fs::write(dir.path().join("copy.txt"), b"same content").unwrap();
    fs::write(dir.path().join("other.txt"), b"other things").unwrap();
    dir
}

#[test]
fn scans_complete_contents_and_ignores_empty_files() {
    let dir = files();
    fs::write(dir.path().join("empty"), b"").unwrap();
    let mut a = vec![b'a'; 2048];
    fs::write(dir.path().join("prefix-a"), &a).unwrap();
    a[2047] = b'b';
    fs::write(dir.path().join("prefix-b"), &a).unwrap();
    let result = scan(dir.path(), &AtomicBool::new(false), |_| {}).unwrap();
    assert_eq!(result.groups.len(), 1);
    assert_eq!(result.groups[0].files.len(), 2);
    assert_eq!(result.scanned, 6);
}

#[test]
fn permanent_delete_preserves_the_other_copy() {
    let dir = files();
    let cancel = AtomicBool::new(false);
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let group = &result.groups[0];
    let report = clean(
        &result,
        &[group.files[1].id],
        DeleteMode::Permanent,
        &cancel,
        |_| {},
    )
    .unwrap();
    assert_eq!(report.succeeded.len(), 1);
    assert_eq!(report.failed.len(), 0);
    assert!(group.files[0].path.exists());
    assert!(!group.files[1].path.exists());
}

#[test]
fn refuses_to_remove_every_copy_or_unknown_ids() {
    let dir = files();
    let cancel = AtomicBool::new(false);
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let ids: Vec<_> = result.groups[0].files.iter().map(|f| f.id).collect();
    assert!(clean(&result, &ids, DeleteMode::Permanent, &cancel, |_| {}).is_err());
    assert!(clean(&result, &[u64::MAX], DeleteMode::Permanent, &cancel, |_| {}).is_err());
    assert!(result.groups[0].files.iter().all(|f| f.path.exists()));
}

#[test]
fn changed_candidate_or_missing_retained_file_is_preserved() {
    let dir = files();
    let cancel = AtomicBool::new(false);
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let group = &result.groups[0];
    fs::write(&group.files[1].path, b"edited file!").unwrap();
    let report = clean(
        &result,
        &[group.files[1].id],
        DeleteMode::Permanent,
        &cancel,
        |_| {},
    )
    .unwrap();
    assert_eq!(report.failed.len(), 1);
    assert!(group.files[1].path.exists());
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    assert!(result.groups.is_empty());
}

#[test]
fn cancellation_does_not_delete_or_report_false_success() {
    let dir = files();
    let result = scan(dir.path(), &AtomicBool::new(false), |_| {}).unwrap();
    let report = clean(
        &result,
        &[result.groups[0].files[1].id],
        DeleteMode::Permanent,
        &AtomicBool::new(true),
        |_| {},
    )
    .unwrap();
    assert!(report.succeeded.is_empty());
    assert_eq!(report.pending, 1);
    assert!(report.cancelled);
}

#[test]
fn reports_partial_failure_and_deduplicates_selection() {
    let dir = files();
    fs::write(dir.path().join("copy2.txt"), b"same content").unwrap();
    let cancel = AtomicBool::new(false);
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let group = &result.groups[0];
    fs::write(&group.files[1].path, b"changed").unwrap();
    let ids = [group.files[1].id, group.files[2].id, group.files[2].id];
    let report = clean(&result, &ids, DeleteMode::Permanent, &cancel, |_| {}).unwrap();
    assert_eq!(report.total, 2);
    assert_eq!(report.failed.len(), 1);
    assert_eq!(report.succeeded.len(), 1);
    assert!(group.files[0].path.exists());
}

#[test]
fn batch_progress_is_bounded_and_cancel_stops_next_batch() {
    use std::sync::atomic::Ordering;
    let dir = tempfile::tempdir().unwrap();
    for n in 0..1025 {
        fs::write(dir.path().join(format!("{n:04}.txt")), b"duplicate").unwrap();
    }
    let cancel = AtomicBool::new(false);
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let ids: Vec<_> = result.groups[0]
        .files
        .iter()
        .skip(1)
        .map(|f| f.id)
        .collect();
    let mut updates = 0;
    let report = clean(&result, &ids, DeleteMode::Permanent, &cancel, |p| {
        updates += 1;
        if p.done >= 64 {
            cancel.store(true, Ordering::Relaxed);
        }
    })
    .unwrap();
    assert!(updates < 20);
    assert!(report.succeeded.len() <= 128);
    assert_eq!(
        report.succeeded.len() + report.failed.len() + report.pending,
        1024
    );
}

#[test]
fn missing_retained_copy_blocks_removal() {
    let dir = files();
    let cancel = AtomicBool::new(false);
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let group = &result.groups[0];
    fs::remove_file(&group.files[0].path).unwrap();
    let report = clean(
        &result,
        &[group.files[1].id],
        DeleteMode::Permanent,
        &cancel,
        |_| {},
    )
    .unwrap();
    assert_eq!(report.failed.len(), 1);
    assert!(group.files[1].path.exists());
}

#[test]
#[ignore = "explicit large-file-count performance verification"]
fn ten_thousand_files_use_bounded_updates() {
    let parent = std::env::var_os("FUXWX_TEST_ROOT").expect("set owned FUXWX_TEST_ROOT");
    let dir = tempfile::tempdir_in(parent).unwrap();
    for n in 0..10_001 {
        fs::write(
            dir.path().join(format!("{n:05}.txt")),
            b"FuxWX benchmark fixture",
        )
        .unwrap();
    }
    let cancel = AtomicBool::new(false);
    let started = std::time::Instant::now();
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let scan_ms = started.elapsed().as_millis();
    let ids: Vec<_> = result.groups[0]
        .files
        .iter()
        .skip(1)
        .map(|f| f.id)
        .collect();
    let mut updates = 0;
    let started = std::time::Instant::now();
    let report = clean(&result, &ids, DeleteMode::Permanent, &cancel, |_| {
        updates += 1
    })
    .unwrap();
    println!(
        "10000-file benchmark: scan_ms={scan_ms} clean_ms={} updates={updates}",
        started.elapsed().as_millis()
    );
    assert_eq!(report.succeeded.len(), 10_000);
    assert!(report.failed.is_empty());
    assert_eq!(updates, 157);
    assert!(result.groups[0].files[0].path.exists());
}

#[test]
#[ignore = "uses the real Windows Recycle Bin with owned synthetic fixtures only"]
fn windows_recycle_batch_is_restorable() {
    let parent = std::env::var_os("FUXWX_TEST_ROOT")
        .expect("set FUXWX_TEST_ROOT to an owned local test directory");
    let dir = tempfile::tempdir_in(parent).unwrap();
    for n in 0..513 {
        fs::write(
            dir.path().join(format!("fuxwx-fixture-{n:04}.txt")),
            b"FuxWX synthetic recycle fixture",
        )
        .unwrap();
    }
    let cancel = AtomicBool::new(false);
    let result = scan(dir.path(), &cancel, |_| {}).unwrap();
    let group = &result.groups[0];
    let ids: Vec<_> = group.files.iter().skip(1).map(|f| f.id).collect();
    let started = std::time::Instant::now();
    let mut updates = 0;
    let report = clean(&result, &ids, DeleteMode::Recycle, &cancel, |_| {
        updates += 1
    })
    .unwrap();
    println!(
        "recycle: files={} elapsed_ms={} progress_updates={}",
        report.succeeded.len(),
        started.elapsed().as_millis(),
        updates
    );
    assert_eq!(report.succeeded.len(), 512, "{:?}", report.failed);
    assert!(group.files[0].path.exists());
    assert_eq!(updates, 8);
    // Inspect only this volume and SID, not Explorer's global Recycle Bin namespace.
    // The latter also visits disconnected drives and can take minutes on real machines.
    let bin = std::env::var_os("FUXWX_RECYCLE_BIN")
        .expect("set FUXWX_RECYCLE_BIN to the test volume's current-user bin");
    let mut items = vec![];
    for entry in fs::read_dir(bin).unwrap().flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("$I") {
            continue;
        }
        let Ok(data) = fs::read(entry.path()) else {
            continue;
        };
        if data.len() < 28 || data[0] != 2 {
            continue;
        }
        let units: Vec<_> = data[28..]
            .chunks_exact(2)
            .map(|b| u16::from_le_bytes([b[0], b[1]]))
            .take_while(|u| *u != 0)
            .collect();
        let original = std::path::PathBuf::from(String::from_utf16_lossy(&units));
        let Some(parent) = original.parent() else {
            continue;
        };
        let normalized = result.root.to_string_lossy().replace(r"\\?\", "");
        if !parent.to_string_lossy().eq_ignore_ascii_case(&normalized) {
            continue;
        }
        let content = entry.path().with_file_name(format!("$R{}", &name[2..]));
        assert_eq!(
            fs::read(&content).unwrap(),
            b"FuxWX synthetic recycle fixture"
        );
        items.push(trash::TrashItem {
            id: content.into_os_string(),
            name: original.file_name().unwrap().into(),
            original_parent: original.parent().unwrap().into(),
            time_deleted: 0,
        });
    }
    assert_eq!(
        items.len(),
        512,
        "every reported success must exist in the Recycle Bin"
    );
    for batch in items.chunks(64) {
        trash::os_limited::restore_all(batch.iter().cloned()).unwrap();
    }
    assert!(group.files.iter().all(|f| f.path.exists()));
}
