import type { List, Product } from './types';

export function isTopLevelList(list: Pick<List, 'parent_list_id'>): boolean {
  return !list.parent_list_id;
}

export function getChildLists(lists: List[], parentId: string): List[] {
  return lists.filter((list) => list.parent_list_id === parentId);
}

export function getDescendantListIds(lists: List[], rootId: string): string[] {
  const ids: string[] = [];
  const walk = (parentId: string) => {
    for (const list of lists) {
      if (list.parent_list_id === parentId) {
        ids.push(list.id);
        walk(list.id);
      }
    }
  };
  walk(rootId);
  return ids;
}

export function countDirectSubLists(lists: List[], listId: string): number {
  return lists.filter((list) => list.parent_list_id === listId).length;
}

export function aggregateProductsForList(
  listId: string,
  listsWithProducts: Array<Pick<List, 'id'> & { products: Product[] }>,
  allLists: List[]
): Product[] {
  const listIds = new Set([listId, ...getDescendantListIds(allLists, listId)]);
  const byId = new Map<string, Product>();
  for (const list of listsWithProducts) {
    if (!listIds.has(list.id)) continue;
    for (const product of list.products) {
      byId.set(product.id, product);
    }
  }
  return [...byId.values()];
}

export function formatListLabel(list: List, allLists: List[]): string {
  if (!list.parent_list_id) return list.name;
  const parent = allLists.find((entry) => entry.id === list.parent_list_id);
  return parent ? `${parent.name} → ${list.name}` : list.name;
}
