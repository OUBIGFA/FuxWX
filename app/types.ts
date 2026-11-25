export type FileEntry = { id: number; path: string; name: string; size: number; modified_ms: number };
export type Group = { hash: string; size: number; files: FileEntry[] };
export type Failure = { path: string; reason: string };
export type Scan = { root: string; scanned: number; groups: Group[]; skipped: Failure[]; cancelled: boolean };
export type Summary = { total: number; succeeded: number; failed: number; pending: number; bytes: number; cancelled: boolean };
export type Status = { busy: boolean; phase: string; done: number; total: number; revision: number; error: string | null; summary: Summary | null };
export type Row = FileEntry & {
  group: string;
  groupIndex: number;
  groupCount: number;
  first: boolean;
};
