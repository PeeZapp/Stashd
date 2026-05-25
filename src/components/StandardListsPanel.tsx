import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  LayoutGrid,
  List,
  Pin,
  Plus,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { Product, StandardList, StandardListComment, StandardListItem, StandardListItemTreeNode } from '../lib/types';
import {
  createStandardListComment,
  createStandardList,
  createStandardListItem,
  createStandardListWithItems,
  deleteStandardListComment,
  deleteStandardList,
  deleteStandardListItem,
  getStandardListComments,
  getStandardListItems,
  getUserStandardLists,
  getUserListsWithProducts,
  reorderStandardListItems,
  updateStandardList,
  updateStandardListItem,
} from '../lib/firestore';
import {
  buildItemTree,
  buildIcsCalendar,
  collectTags,
  filterAndSortItems,
  formatDueDate,
  formatRecurrence,
  isOverdue,
  isSameDay,
  itemsDueTodayAcrossLists,
  LIST_TEMPLATES,
  monthCalendarDays,
  parseQuickAdd,
  priorityLabel,
  addRecurrenceDate,
  type ItemFilter,
  type ItemSort,
} from '../lib/standardListUtils';
import ItemDetailDrawer from './standardLists/ItemDetailDrawer';

interface StandardListWithItems extends StandardList {
  items: StandardListItem[];
}

type PanelView = 'lists' | 'today' | 'calendar';
type DetailLayout = 'list' | 'kanban';

interface StandardListsPanelProps {
  userId: string;
}

function patchListItems(
  lists: StandardListWithItems[],
  listId: string,
  patch: (items: StandardListItem[]) => StandardListItem[]
): StandardListWithItems[] {
  return lists.map((l) => (l.id === listId ? { ...l, items: patch(l.items) } : l));
}

function ItemRow({
  node,
  depth,
  hideCompleted,
  attachedProduct,
  draggable,
  collapsedItemIds,
  onToggle,
  onToggleCollapse,
  onOpenDetail,
  onAddSubtask,
  onMove,
  onDragStart,
  onDrop,
  canMoveUp,
  canMoveDown,
}: {
  node: StandardListItemTreeNode;
  depth: number;
  hideCompleted: boolean;
  attachedProduct?: Product | null;
  draggable: boolean;
  collapsedItemIds: Set<string>;
  onToggle: (item: StandardListItem) => void;
  onToggleCollapse: (itemId: string) => void;
  onOpenDetail: (item: StandardListItem) => void;
  onAddSubtask: (parent: StandardListItem) => void;
  onMove: (item: StandardListItem, dir: -1 | 1) => void;
  onDragStart: (item: StandardListItem) => void;
  onDrop: (item: StandardListItem) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  if (hideCompleted && node.is_completed) return null;

  const childCount = node.children.length;
  const visibleChildCount = hideCompleted
    ? node.children.filter((child) => !child.is_completed).length
    : childCount;
  const hasChildren = childCount > 0;
  const isCollapsed = collapsedItemIds.has(node.id);
  const overdue = isOverdue(node.due_at, node.is_completed);
  const priorityAccent =
    node.priority >= 4
      ? 'border-l-red-500'
      : node.priority === 3
        ? 'border-l-orange-400'
        : node.priority === 2
          ? 'border-l-amber-400'
          : node.priority === 1
            ? 'border-l-blue-400'
            : 'border-l-transparent';
  const quietMeta = [
    node.priority > 0 ? priorityLabel(node.priority) : null,
    node.due_at ? formatDueDate(node.due_at) : null,
    node.recurrence !== 'none' ? formatRecurrence(node.recurrence) : null,
    hasChildren
      ? `${visibleChildCount}/${childCount} subtask${childCount !== 1 ? 's' : ''}${isCollapsed ? ' hidden' : ''}`
      : null,
    attachedProduct ? 'Product attached' : null,
    node.image_urls.length > 0 ? `${node.image_urls.length} image${node.image_urls.length !== 1 ? 's' : ''}` : null,
    node.tags.length > 0 ? `${node.tags.length} tag${node.tags.length !== 1 ? 's' : ''}` : null,
    node.notes ? 'Has notes' : null,
  ].filter(Boolean);

  return (
    <>
      <div
        draggable={draggable}
        onDragStart={() => draggable && onDragStart(node)}
        onDragOver={(event) => draggable && event.preventDefault()}
        onDrop={(event) => {
          if (!draggable) return;
          event.preventDefault();
          onDrop(node);
        }}
        className={`group my-2 rounded-2xl border border-gray-200 border-l-4 ${priorityAccent} bg-white transition-colors hover:border-gray-300 ${
          depth > 0 ? 'ml-6 bg-gray-50/70' : ''
        }`}
        style={{ marginLeft: depth > 0 ? `${depth * 12}px` : undefined }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          {draggable && (
            <GripVertical
              className="w-4 h-4 text-gray-300 shrink-0 cursor-grab"
              aria-label="Drag to reorder"
            />
          )}
          <button
            type="button"
            onClick={() => onToggle(node)}
            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
              node.is_completed
                ? 'bg-gray-900 border-gray-900 text-white'
                : 'border-gray-300 hover:border-gray-700'
            }`}
            title={node.is_completed ? 'Mark incomplete' : 'Mark complete'}
          >
            {node.is_completed && <Check className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => hasChildren && onToggleCollapse(node.id)}
            disabled={!hasChildren}
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
              hasChildren
                ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                : 'text-transparent cursor-default'
            }`}
            title={isCollapsed ? 'Show subtasks' : 'Hide subtasks'}
            aria-label={isCollapsed ? 'Show subtasks' : 'Hide subtasks'}
          >
            {hasChildren &&
              (isCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              ))}
          </button>

          <button
            type="button"
            onClick={() => onOpenDetail(node)}
            className="min-w-0 flex-1 text-left"
          >
            <span
              className={`block text-sm font-medium ${
                node.is_completed ? 'text-gray-400 line-through' : 'text-gray-950'
              }`}
            >
              {node.text}
            </span>
            {quietMeta.length > 0 && (
              <span
                className={`mt-0.5 block text-xs ${
                  overdue ? 'text-red-600' : 'text-gray-400'
                }`}
              >
                {quietMeta.join(' · ')}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 shrink-0">
            {node.image_urls[0] && (
              <img
                src={node.image_urls[0]}
                alt=""
                className="hidden sm:block w-8 h-8 rounded-lg object-cover border border-gray-100"
              />
            )}
            {attachedProduct && attachedProduct.image_url && (
              <img
                src={attachedProduct.image_url}
                alt=""
                className="hidden sm:block w-8 h-8 rounded-lg object-cover border border-gray-100"
              />
            )}
          {node.link_url && (
            <a
              href={node.link_url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-100 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100"
              title="Open link"
            >
              <ExternalLink className="w-4 h-4" />
                <span className="hidden sm:inline">Open</span>
            </a>
          )}
          <button
            type="button"
            title="Add subtask"
            onClick={() => onAddSubtask(node)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Subtask</span>
          </button>
          {canMoveUp && (
              <button
                type="button"
                onClick={() => onMove(node, -1)}
                className="hidden sm:flex p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded"
                title="Move up"
              >
              <ChevronUp className="w-4 h-4" />
            </button>
          )}
          {canMoveDown && (
              <button
                type="button"
                onClick={() => onMove(node, 1)}
                className="hidden sm:flex p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded"
                title="Move down"
              >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          </div>
        </div>
      </div>
      {hasChildren && isCollapsed && (
        <button
          type="button"
          onClick={() => onToggleCollapse(node.id)}
          className="ml-12 -mt-1 mb-2 inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Show {visibleChildCount} hidden subtask{visibleChildCount !== 1 ? 's' : ''}
        </button>
      )}
      {!isCollapsed &&
        node.children.map((child, idx) => (
          <ItemRow
            key={child.id}
            node={child}
            depth={depth + 1}
            hideCompleted={hideCompleted}
            collapsedItemIds={collapsedItemIds}
            onToggle={onToggle}
            onToggleCollapse={onToggleCollapse}
            onOpenDetail={onOpenDetail}
            onAddSubtask={onAddSubtask}
            onMove={onMove}
            attachedProduct={null}
            draggable={draggable}
            onDragStart={onDragStart}
            onDrop={onDrop}
            canMoveUp={idx > 0}
            canMoveDown={idx < node.children.length - 1}
          />
        ))}
    </>
  );
}

export default function StandardListsPanel({ userId }: StandardListsPanelProps) {
  const { user, profile } = useAuth();
  const [lists, setLists] = useState<StandardListWithItems[]>([]);
  const [commentsByList, setCommentsByList] = useState<Record<string, StandardListComment[]>>({});
  const [wishlistProducts, setWishlistProducts] = useState<Product[]>([]);
  const [panelView, setPanelView] = useState<PanelView>('lists');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [newListName, setNewListName] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [newItemText, setNewItemText] = useState('');
  const [itemFilter, setItemFilter] = useState<ItemFilter>('active');
  const [itemSort, setItemSort] = useState<ItemSort>('position');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [detailLayout, setDetailLayout] = useState<DetailLayout>('list');
  const [detailItem, setDetailItem] = useState<StandardListItem | null>(null);
  const [subtaskParentId, setSubtaskParentId] = useState<string | null>(null);
  const [collapsedItemIds, setCollapsedItemIds] = useState<Set<string>>(() => new Set());
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [collaboratorInput, setCollaboratorInput] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const quickAddRef = useRef<HTMLInputElement>(null);

  const userEmail = user?.email?.trim().toLowerCase() ?? null;
  const currentUserName = profile?.name || user?.displayName || user?.email || 'You';

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) ?? null,
    [lists, selectedListId]
  );

  const sortedLists = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    let out = [...lists].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    if (q) {
      out = out.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.items.some((i) => i.text.toLowerCase().includes(q) || i.notes?.toLowerCase().includes(q))
      );
    }
    return out;
  }, [lists, globalSearch]);

  const todayItems = useMemo(
    () =>
      itemsDueTodayAcrossLists(
        lists.map((l) => ({ list: l, items: l.items }))
      ),
    [lists]
  );

  const productById = useMemo(
    () => new Map(wishlistProducts.map((product) => [product.id, product])),
    [wishlistProducts]
  );

  const calendarDays = useMemo(() => monthCalendarDays(calendarMonth), [calendarMonth]);
  const dueItems = useMemo(
    () =>
      lists.flatMap((list) =>
        list.items
          .filter((item) => item.due_at)
          .map((item) => ({ ...item, list_name: list.name }))
      ),
    [lists]
  );

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const userLists = await getUserStandardLists(userId, userEmail);
      const [itemGroups, commentGroups, productLists] = await Promise.all([
        Promise.all(userLists.map((list) => getStandardListItems(list.id, list.user_id))),
        Promise.all(userLists.map((list) => getStandardListComments(list.id))),
        getUserListsWithProducts(userId),
      ]);
      setLists(userLists.map((list, index) => ({ ...list, items: itemGroups[index] ?? [] })));
      setCommentsByList(
        Object.fromEntries(userLists.map((list, index) => [list.id, commentGroups[index] ?? []]))
      );
      const productMap = new Map<string, Product>();
      productLists.forEach((list) => {
        if (list.scope === 'stash') return;
        list.products.forEach((product) => productMap.set(product.id, product));
      });
      setWishlistProducts([...productMap.values()]);
    } catch (error) {
      console.error('Error loading standard lists:', error);
    } finally {
      setLoading(false);
    }
  }, [userEmail, userId]);

  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  const displayItems = useMemo(() => {
    if (!selectedList) return [];
    const filtered = filterAndSortItems(selectedList.items, itemFilter, itemSort, tagFilter);
    if (itemSort === 'position') return filtered;
    return filtered;
  }, [selectedList, itemFilter, itemSort, tagFilter]);

  const itemTree = useMemo(() => buildItemTree(displayItems), [displayItems]);
  const listTags = useMemo(
    () => (selectedList ? collectTags(selectedList.items) : []),
    [selectedList]
  );

  const toggleItemCollapse = (itemId: string) => {
    setCollapsedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const kanbanActive = useMemo(
    () => displayItems.filter((i) => !i.is_completed && !i.parent_id),
    [displayItems]
  );
  const kanbanDone = useMemo(
    () => displayItems.filter((i) => i.is_completed && !i.parent_id),
    [displayItems]
  );

  const handleCreateList = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    try {
      const list = await createStandardList({ user_id: userId, name });
      setLists((prev) => [{ ...list, items: [] }, ...prev]);
      setSelectedListId(list.id);
      setNewListName('');
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateFromTemplate = async (templateId: string) => {
    const template = LIST_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    try {
      const { list, items } = await createStandardListWithItems({
        user_id: userId,
        name: template.name,
        description: template.description,
        itemTexts: template.items,
      });
      setLists((prev) => [{ ...list, items }, ...prev]);
      setSelectedListId(list.id);
      setShowTemplates(false);
    } catch (error) {
      console.error(error);
    }
  };

  const handleTogglePin = async (list: StandardList) => {
    const next = !list.is_pinned;
    try {
      await updateStandardList(list.id, { is_pinned: next });
      setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, is_pinned: next } : l)));
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreateItem = async (event: React.FormEvent, parentId: string | null = null) => {
    event.preventDefault();
    if (!selectedList) return;
    const raw = newItemText.trim();
    if (!raw) return;

    const parsed = parseQuickAdd(raw);
    if (!parsed.text) return;

    const siblings = selectedList.items.filter((i) => i.parent_id === parentId);
    try {
      const item = await createStandardListItem({
        user_id: selectedList.user_id,
        list_id: selectedList.id,
        text: parsed.text,
        position: siblings.length,
        parent_id: parentId,
        tags: parsed.tags,
        priority: parsed.priority,
        due_at: parsed.due_at,
        recurrence: parsed.recurrence,
        link_url: parsed.link_url,
      });
      setLists((prev) =>
        patchListItems(prev, selectedList.id, (items) => [...items, item])
      );
      setNewItemText('');
      setSubtaskParentId(null);
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleItem = async (item: StandardListItem) => {
    const next = !item.is_completed;
    setLists((prev) =>
      patchListItems(prev, item.list_id, (items) =>
        items.map((i) => (i.id === item.id ? { ...i, is_completed: next } : i))
      )
    );
    try {
      await updateStandardListItem(item.id, { is_completed: next });
      const nextDueAt = next ? addRecurrenceDate(item.due_at, item.recurrence) : null;
      if (next && nextDueAt && selectedList) {
        const siblings = selectedList.items.filter((i) => i.parent_id === item.parent_id);
        const newItem = await createStandardListItem({
          user_id: item.user_id,
          list_id: item.list_id,
          parent_id: item.parent_id,
          text: item.text,
          notes: item.notes,
          tags: item.tags,
          priority: item.priority,
          due_at: nextDueAt,
          recurrence: item.recurrence,
          link_url: item.link_url,
          link_title: item.link_title,
          product_id: item.product_id,
          position: siblings.length,
        });
        setLists((prev) => patchListItems(prev, item.list_id, (items) => [...items, newItem]));
      }
    } catch {
      void loadLists();
    }
  };

  const reorderSiblings = async (ordered: StandardListItem[]) => {
    if (!selectedList) return;
    const updates = ordered.map((item, index) => ({ id: item.id, position: index }));
    setLists((prev) =>
      patchListItems(prev, selectedList.id, (items) =>
        items.map((item) => {
          const update = updates.find((u) => u.id === item.id);
          return update ? { ...item, position: update.position } : item;
        })
      )
    );
    try {
      await reorderStandardListItems(updates);
    } catch {
      void loadLists();
    }
  };

  const handleMoveItem = async (item: StandardListItem, dir: -1 | 1) => {
    if (!selectedList) return;
    const siblings = selectedList.items
      .filter((i) => i.parent_id === item.parent_id)
      .sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex((i) => i.id === item.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const next = [...siblings];
    next.splice(idx, 1);
    next.splice(swapIdx, 0, item);
    await reorderSiblings(next);
  };

  const handleDropItem = async (target: StandardListItem) => {
    if (!selectedList || !draggedItemId || draggedItemId === target.id) return;
    const dragged = selectedList.items.find((item) => item.id === draggedItemId);
    if (!dragged || dragged.parent_id !== target.parent_id) return;
    const siblings = selectedList.items
      .filter((item) => item.parent_id === target.parent_id)
      .sort((a, b) => a.position - b.position);
    const from = siblings.findIndex((item) => item.id === dragged.id);
    const to = siblings.findIndex((item) => item.id === target.id);
    if (from < 0 || to < 0) return;
    const next = [...siblings];
    next.splice(from, 1);
    next.splice(to, 0, dragged);
    setDraggedItemId(null);
    await reorderSiblings(next);
  };

  const handleReorderByPriority = async () => {
    if (!selectedList) return;
    const topLevel = selectedList.items
      .filter((item) => item.parent_id === null)
      .sort((a, b) => b.priority - a.priority || a.position - b.position);
    await reorderSiblings(topLevel);
  };

  const handleSaveItemDetail = async (updates: Partial<StandardListItem>) => {
    if (!detailItem) return;
    await updateStandardListItem(detailItem.id, updates);
    setLists((prev) =>
      patchListItems(prev, detailItem.list_id, (items) =>
        items.map((i) => (i.id === detailItem.id ? { ...i, ...updates } : i))
      )
    );
    setDetailItem((prev) => (prev ? { ...prev, ...updates } : null));
  };

  const handleDeleteItem = async (item: StandardListItem) => {
    await deleteStandardListItem(item.id, item.list_id);
    setDetailItem(null);
    await loadLists();
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('Delete this list and all items?')) return;
    try {
      await deleteStandardList(listId, userId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      if (selectedListId === listId) setSelectedListId(null);
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddCollaborator = async () => {
    if (!selectedList) return;
    const email = collaboratorInput.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    const next = [...new Set([...selectedList.collaborator_emails, email])];
    await updateStandardList(selectedList.id, { collaborator_emails: next });
    setLists((prev) => prev.map((list) => (list.id === selectedList.id ? { ...list, collaborator_emails: next } : list)));
    setCollaboratorInput('');
  };

  const handleRemoveCollaborator = async (email: string) => {
    if (!selectedList) return;
    const next = selectedList.collaborator_emails.filter((item) => item !== email);
    await updateStandardList(selectedList.id, { collaborator_emails: next });
    setLists((prev) => prev.map((list) => (list.id === selectedList.id ? { ...list, collaborator_emails: next } : list)));
  };

  const handleAddComment = async (item: StandardListItem, body: string) => {
    if (!user) return;
    const comment = await createStandardListComment({
      list_id: item.list_id,
      item_id: item.id,
      user_id: user.uid,
      author_name: currentUserName,
      body,
    });
    setCommentsByList((prev) => ({
      ...prev,
      [item.list_id]: [...(prev[item.list_id] ?? []), comment],
    }));
  };

  const handleDeleteComment = async (listId: string, commentId: string) => {
    await deleteStandardListComment(commentId);
    setCommentsByList((prev) => ({
      ...prev,
      [listId]: (prev[listId] ?? []).filter((comment) => comment.id !== commentId),
    }));
  };

  const handleExportIcs = () => {
    const contents = buildIcsCalendar(lists.map((list) => ({ name: list.name, items: list.items })));
    const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stashd-lists.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportIcs = async (file: File) => {
    const text = await file.text();
    const events = text.split('BEGIN:VEVENT').slice(1);
    const imported = events
      .map((event) => {
        const summary = event.match(/SUMMARY:(.+)/)?.[1]?.trim();
        const date = event.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/)?.[1];
        if (!summary || !date) return null;
        const due = new Date(
          Number(date.slice(0, 4)),
          Number(date.slice(4, 6)) - 1,
          Number(date.slice(6, 8)),
          12
        ).toISOString();
        return { text: summary.replace(/\\,/g, ','), due_at: due };
      })
      .filter((event): event is { text: string; due_at: string } => Boolean(event));
    if (imported.length === 0) return;
    const list = await createStandardList({ user_id: userId, name: 'Imported calendar' });
    const items: StandardListItem[] = [];
    for (let index = 0; index < imported.length; index++) {
      const item = await createStandardListItem({
        user_id: userId,
        list_id: list.id,
        text: imported[index].text,
        due_at: imported[index].due_at,
        position: index,
      });
      items.push(item);
    }
    setLists((prev) => [{ ...list, items }, ...prev]);
    setSelectedListId(list.id);
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (selectedList) {
    const completedCount = selectedList.items.filter((i) => i.is_completed).length;

    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedListId(null);
              setDetailItem(null);
            }}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold text-gray-900 flex-1 min-w-0 truncate">{selectedList.name}</h2>
          <button
            type="button"
            onClick={() => void handleTogglePin(selectedList)}
            className={`p-2 rounded-lg ${selectedList.is_pinned ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:bg-gray-100'}`}
            title={selectedList.is_pinned ? 'Unpin' : 'Pin list'}
          >
            <Pin className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteList(selectedList.id)}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          {selectedList.items.length} items · {completedCount} done
          {selectedList.description ? ` · ${selectedList.description}` : ''}
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value as ItemFilter)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={itemSort}
            onChange={(e) => setItemSort(e.target.value as ItemSort)}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
          >
            <option value="position">Manual order</option>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
          </select>
          {listTags.length > 0 && (
            <select
              value={tagFilter ?? ''}
              onChange={(e) => setTagFilter(e.target.value || null)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5"
            >
              <option value="">All tags</option>
              {listTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-sm text-gray-600 ml-auto">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="rounded border-gray-300"
            />
            Hide done
          </label>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setDetailLayout('list')}
              className={`p-2 ${detailLayout === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setDetailLayout('kanban')}
              className={`p-2 ${detailLayout === 'kanban' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              title="Board view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => void handleReorderByPriority()}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            Reorder by priority
          </button>
        </div>

        <div className="mb-4 bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Share2 className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-800">Collaborators</span>
            <input
              value={collaboratorInput}
              onChange={(event) => setCollaboratorInput(event.target.value)}
              placeholder="email@example.com"
              className="ml-auto min-w-[180px] flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
            <button
              type="button"
              onClick={() => void handleAddCollaborator()}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium"
            >
              Invite
            </button>
          </div>
          {selectedList.collaborator_emails.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedList.collaborator_emails.map((email) => (
                <span key={email} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-full px-2.5 py-1 text-xs">
                  {email}
                  <button type="button" onClick={() => void handleRemoveCollaborator(email)} className="text-gray-400 hover:text-red-600">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => handleCreateItem(e, subtaskParentId)}
          className="mb-4 bg-white border border-gray-200 rounded-xl p-3 flex flex-col gap-2"
        >
          {subtaskParentId && (
            <p className="text-xs text-gray-500 flex items-center justify-between">
              Adding subtask
              <button type="button" onClick={() => setSubtaskParentId(null)} className="text-gray-700 hover:underline">
                Cancel
              </button>
            </p>
          )}
          <div className="flex gap-2">
            <input
              ref={quickAddRef}
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Add task… try: milk tomorrow #groceries p2"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <button
              type="submit"
              disabled={!newItemText.trim()}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        {detailLayout === 'kanban' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-3 min-h-[200px]">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">To do</h3>
              <div className="space-y-2">
                {kanbanActive.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDetailItem(item)}
                    className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 text-sm"
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-3 min-h-[200px]">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3">Done</h3>
              <div className="space-y-2">
                {kanbanDone.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDetailItem(item)}
                    className="w-full text-left p-3 bg-gray-50 rounded-lg line-through text-gray-500 text-sm"
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : itemTree.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
            <CheckSquare2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 text-sm">No items match this filter.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {itemTree.map((node, idx) => (
              <ItemRow
                key={node.id}
                node={node}
                depth={0}
                hideCompleted={hideCompleted}
                collapsedItemIds={collapsedItemIds}
                onToggle={(i) => void handleToggleItem(i)}
                onToggleCollapse={toggleItemCollapse}
                onOpenDetail={setDetailItem}
                onAddSubtask={(p) => {
                  setSubtaskParentId(p.id);
                  quickAddRef.current?.focus();
                }}
                onMove={(i, d) => void handleMoveItem(i, d)}
                attachedProduct={node.product_id ? productById.get(node.product_id) : null}
                draggable={itemSort === 'position'}
                onDragStart={(item) => setDraggedItemId(item.id)}
                onDrop={(item) => void handleDropItem(item)}
                canMoveUp={idx > 0 && itemSort === 'position'}
                canMoveDown={idx < itemTree.length - 1 && itemSort === 'position'}
              />
            ))}
          </div>
        )}

        {detailItem && (
          <ItemDetailDrawer
            item={detailItem}
            products={wishlistProducts}
            comments={(commentsByList[detailItem.list_id] ?? []).filter((comment) => comment.item_id === detailItem.id)}
            currentUserName={currentUserName}
            onClose={() => setDetailItem(null)}
            onSave={handleSaveItemDetail}
            onDelete={async () => handleDeleteItem(detailItem)}
            onAddComment={(body) => handleAddComment(detailItem, body)}
            onDeleteComment={(commentId) => handleDeleteComment(detailItem.list_id, commentId)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Lists</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          Full-featured checklists with subtasks, due dates, tags, priorities, links, Today view, and board layout.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-gray-200 pb-3">
        <button
          type="button"
          onClick={() => setPanelView('lists')}
          className={`px-4 py-2 text-sm font-medium rounded-lg ${
            panelView === 'lists' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          My lists
        </button>
        <button
          type="button"
          onClick={() => setPanelView('today')}
          className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 ${
            panelView === 'today' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Today
          {todayItems.length > 0 && (
            <span className="text-xs bg-white/20 rounded-full px-1.5">{todayItems.length}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setPanelView('calendar')}
          className={`px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 ${
            panelView === 'calendar' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Calendar
        </button>
        <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search lists and items"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>

      {panelView === 'today' ? (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {todayItems.length === 0 ? (
            <p className="p-8 text-center text-gray-500 text-sm">Nothing due today. Add due dates with “tomorrow” or pick a date in item details.</p>
          ) : (
            todayItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSelectedListId(item.list_id);
                  setPanelView('lists');
                  setDetailItem(item);
                }}
                className="w-full text-left p-4 hover:bg-gray-50 flex items-start gap-3"
              >
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded shrink-0 ${
                    isOverdue(item.due_at, item.is_completed) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {formatDueDate(item.due_at)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{item.text}</p>
                  <p className="text-xs text-gray-500">{item.list_name}</p>
                </div>
              </button>
            ))
          )}
        </div>
      ) : panelView === 'calendar' ? (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              Previous
            </button>
            <h3 className="text-lg font-semibold text-gray-900 flex-1">
              {calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </h3>
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date())}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              Next
            </button>
            <button
              type="button"
              onClick={handleExportIcs}
              className="px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm"
            >
              Export .ics
            </button>
            <label className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
              Import .ics
              <input
                type="file"
                accept=".ics,text/calendar"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImportIcs(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Calendar import/export is in place. True Google/Outlook two-way sync needs OAuth credentials and provider API setup.
          </div>
          <div className="grid grid-cols-7 bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div key={day} className="p-2 text-xs font-semibold text-gray-500 border-b border-gray-100 bg-gray-50">
                {day}
              </div>
            ))}
            {calendarDays.map((day) => {
              const items = dueItems.filter((item) => item.due_at && isSameDay(new Date(item.due_at), day));
              const inMonth = day.getMonth() === calendarMonth.getMonth();
              return (
                <div key={day.toISOString()} className={`min-h-28 p-2 border-t border-gray-100 ${inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}>
                  <p className="text-xs font-medium mb-1">{day.getDate()}</p>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedListId(item.list_id);
                          setPanelView('lists');
                          setDetailItem(item);
                        }}
                        className="block w-full text-left text-[11px] bg-gray-100 hover:bg-gray-200 rounded px-1.5 py-1 line-clamp-2"
                      >
                        {item.text}
                      </button>
                    ))}
                    {items.length > 3 && <p className="text-[11px] text-gray-400">+{items.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <form onSubmit={handleCreateList} className="flex flex-1 min-w-[240px] gap-2">
              <input
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="New list name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <button
                type="submit"
                disabled={!newListName.trim()}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Create
              </button>
            </form>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTemplates((v) => !v)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Templates
              </button>
              {showTemplates && (
                <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-10 py-1">
                  {LIST_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void handleCreateFromTemplate(t.id)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">{t.name}</span>
                      <span className="block text-xs text-gray-500">{t.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sortedLists.length === 0 ? (
            <div className="text-center py-20 border border-dashed border-gray-200 rounded-2xl">
              <CheckSquare2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No lists yet</h3>
              <p className="text-gray-600 text-sm">Create a list or start from a template.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {sortedLists.map((list) => {
                const done = list.items.filter((i) => i.is_completed).length;
                const total = list.items.length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => setSelectedListId(list.id)}
                    className="text-left bg-white rounded-2xl border border-gray-200 hover:shadow-lg transition-all p-5 relative"
                  >
                    {list.is_pinned && (
                      <Pin className="w-4 h-4 text-amber-500 absolute top-4 right-4" />
                    )}
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
                      <CheckSquare2 className="w-6 h-6 text-gray-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 line-clamp-1 pr-6">{list.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {total} items · {done} done
                    </p>
                    {total > 0 && (
                      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-900 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
