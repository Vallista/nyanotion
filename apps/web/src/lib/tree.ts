import type { TreeNode } from "@nyanotion/db";

export type TreeItem = TreeNode & { children: TreeItem[]; depth: number };

/**
 * 평평한 목록(position 순)을 트리로 접는다. `parent_id` 트리가 곧 그룹핑이므로
 * 폴더/문서를 구분하지 않는다 — 자식이 있는 문서가 곧 그룹이다.
 */
export function buildTree(nodes: readonly TreeNode[]): TreeItem[] {
  const byParent = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const key = node.parentId;
    const list = byParent.get(key);
    if (list === undefined) byParent.set(key, [node]);
    else list.push(node);
  }

  // 부모가 목록에 없는 노드(조상이 모래상자에 있는 경우)는 루트로 끌어올리지 않고 버린다.
  const known = new Set(nodes.map((n) => n.id));

  function collect(parentId: string | null, depth: number): TreeItem[] {
    const children = byParent.get(parentId) ?? [];
    return children
      .filter((n) => parentId === null || known.has(parentId))
      .map((n) => ({ ...n, depth, children: collect(n.id, depth + 1) }));
  }

  return collect(null, 0);
}

/** 트리를 화면에 그릴 순서대로 펼친다. 접힌 노드의 자식은 건너뛴다. */
export function flattenVisible(items: readonly TreeItem[], expanded: ReadonlySet<string>): TreeItem[] {
  const out: TreeItem[] = [];
  for (const item of items) {
    out.push(item);
    if (item.children.length > 0 && expanded.has(item.id)) {
      out.push(...flattenVisible(item.children, expanded));
    }
  }
  return out;
}

/** `id` 에서 루트까지의 경로 (루트부터 자기 자신까지). 빵가루용. */
export function pathTo(nodes: readonly TreeNode[], id: string): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: TreeNode[] = [];
  let cursor = byId.get(id);
  const guard = new Set<string>();
  while (cursor !== undefined && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    path.unshift(cursor);
    cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
  }
  return path;
}

/** `id` 와 그 하위 전체. 드롭 금지 판정에 쓴다. */
export function subtreeIds(nodes: readonly TreeNode[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const list = childrenOf.get(n.parentId);
    if (list === undefined) childrenOf.set(n.parentId, [n.id]);
    else list.push(n.id);
  }
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const child of childrenOf.get(current) ?? []) {
      if (out.has(child)) continue;
      out.add(child);
      stack.push(child);
    }
  }
  return out;
}

export const UNTITLED = "제목 없음";

export function displayTitle(title: string): string {
  return title.trim() === "" ? UNTITLED : title;
}
