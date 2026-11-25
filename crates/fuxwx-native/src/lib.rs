//! Native file operations for FuxWX. No UI thread performs filesystem work.
mod cleaner;
mod scanner;
pub use cleaner::{DeleteMode, Report, clean};
pub use scanner::{Entry, Failure, Group, Progress, Scan, scan};

#[cfg(feature = "native")]
mod bridge;
#[cfg(all(feature = "native", windows))]
mod window_icons;

#[cfg(feature = "native")]
use nsh_core::prelude::*;

#[cfg(feature = "native")]
#[native_module("fuxwx-native")]
fn native(registry: &mut Registry) {
    registry.module::<bridge::Cleaner>();
}
