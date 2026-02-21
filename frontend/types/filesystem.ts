// Filesystem snapshot types for CXDB

export interface FsEntry {
  name: string;
  kind: 'file' | 'dir' | 'symlink';
  mode: string;
  size: number;
  hash: string;
}

export interface FsListResponse {
  turn_id: string;
  path: string;
  fs_root_hash: string;
  entries: FsEntry[];
}

export interface FsFileResponse {
  turn_id: string;
  path: string;
  name: string;
  kind: string;
  mode: string;
  size: number;
  hash: string;
  content_base64: string;
}
