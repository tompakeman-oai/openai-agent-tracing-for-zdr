import { Span } from "./state/AppContext";

export type OrderedSpanNode = Span & {
  children: OrderedSpanNode[];
};

/**
 * Build a tree of OrderedSpanNode[] from a flat list of items.
 * Each level (including children) is sorted by `order` ascending.
 */
export const buildOrderedSpanTree = (items: Span[]): OrderedSpanNode[] => {
  // Group items by their parent id (including null for top-level)
  const byParent = new Map<string | null, Span[]>();
  for (const it of items) {
    const key = it.parent_id; // may be null
    const list = byParent.get(key);
    if (list) list.push(it);
    else byParent.set(key, [it]);
  }

  // Ensure each sibling list is sorted by `order` ascending
  for (const list of byParent.values()) {
    list.sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()); // stable-ish tie-break by id
  }

  // Recursive builder
  const buildLevel = (parentId: string | null): OrderedSpanNode[] => {
    const siblings = byParent.get(parentId) ?? [];
    return siblings.map<OrderedSpanNode>((item) => ({
      ...item,
      children: buildLevel(item.span_id),
    }));
  };

  // Top-level nodes are those whose parent is null
  return buildLevel(null);
}
