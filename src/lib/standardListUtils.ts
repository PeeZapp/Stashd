import type {
  StandardListItem,
  StandardListItemTreeNode,
  StandardListPriority,
  StandardListRecurrence,
  StandardListTemplate,
} from './types';

export const LIST_TEMPLATES: StandardListTemplate[] = [
  {
    id: 'groceries',
    name: 'Groceries',
    description: 'Weekly shop',
    items: ['Milk', 'Bread', 'Eggs', 'Fruit', 'Vegetables'],
  },
  {
    id: 'packing',
    name: 'Packing',
    description: 'Trip essentials',
    items: ['Passport / ID', 'Chargers', 'Toiletries', 'Clothes', 'Medications'],
  },
  {
    id: 'weekly',
    name: 'Weekly reset',
    description: 'Recurring chores',
    items: ['Laundry', 'Groceries', 'Clean kitchen', 'Plan meals', 'Inbox zero'],
  },
  {
    id: 'gift-ideas',
    name: 'Gift ideas',
    description: 'People and ideas',
    items: ['Mom', 'Dad', 'Partner', 'Friend'],
  },
];

const PRIORITY_LABELS: Record<StandardListPriority, string> = {
  0: '',
  1: 'Low',
  2: 'Med',
  3: 'High',
  4: 'Urgent',
};

export function priorityLabel(p: StandardListPriority): string {
  return PRIORITY_LABELS[p];
}

export function priorityClass(p: StandardListPriority): string {
  if (p === 4) return 'bg-red-100 text-red-800';
  if (p === 3) return 'bg-orange-100 text-orange-800';
  if (p === 2) return 'bg-amber-100 text-amber-800';
  if (p === 1) return 'bg-blue-100 text-blue-800';
  return '';
}

export interface ParsedQuickAdd {
  text: string;
  tags: string[];
  priority: StandardListPriority;
  due_at: string | null;
  recurrence: StandardListRecurrence;
  link_url: string | null;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Lightweight natural-language hints (Todoist-style). */
export function parseQuickAdd(raw: string): ParsedQuickAdd {
  let text = raw.trim();
  const tags: string[] = [];
  let priority: StandardListPriority = 0;
  let due_at: string | null = null;
  let recurrence: StandardListRecurrence = 'none';
  let link_url: string | null = null;

  const tagMatches = text.matchAll(/#([\w-]+)/gi);
  for (const m of tagMatches) {
    const t = m[1].toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }
  text = text.replace(/#([\w-]+)/gi, '').trim();

  if (/\bp4\b|!!!/i.test(text)) {
    priority = 4;
    text = text.replace(/\bp4\b|!!!/gi, '').trim();
  } else if (/\bp3\b|!!/i.test(text)) {
    priority = 3;
    text = text.replace(/\bp3\b|!!/gi, '').trim();
  } else if (/\bp2\b/i.test(text)) {
    priority = 2;
    text = text.replace(/\bp2\b/gi, '').trim();
  } else if (/\bp1\b/i.test(text)) {
    priority = 1;
    text = text.replace(/\bp1\b/gi, '').trim();
  }

  const now = new Date();
  const recurrenceMatch = text.match(/\bevery\s+(day|week|month)\b/i);
  if (recurrenceMatch) {
    const unit = recurrenceMatch[1].toLowerCase();
    recurrence = unit === 'day' ? 'daily' : unit === 'week' ? 'weekly' : 'monthly';
    text = text.replace(recurrenceMatch[0], '').trim();
  }

  const duePatterns: Array<{ re: RegExp; date: () => Date }> = [
    { re: /\btoday\b/i, date: () => startOfDay(now) },
    { re: /\btomorrow\b/i, date: () => startOfDay(addDays(now, 1)) },
    { re: /\bnext week\b/i, date: () => startOfDay(addDays(now, 7)) },
    {
      re: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      date: () => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const match = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
        const target = match ? days.indexOf(match[1].toLowerCase()) : -1;
        if (target < 0) return startOfDay(now);
        const d = startOfDay(now);
        const diff = (target - d.getDay() + 7) % 7 || 7;
        return addDays(d, diff);
      },
    },
  ];

  for (const { re, date } of duePatterns) {
    if (re.test(text)) {
      due_at = date().toISOString();
      text = text.replace(re, '').trim();
      break;
    }
  }

  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    link_url = urlMatch[0];
    text = text.replace(urlMatch[0], '').trim();
  }

  text = text.replace(/\s+/g, ' ').trim();

  return { text, tags, priority, due_at, recurrence, link_url };
}

export function buildItemTree(items: StandardListItem[]): StandardListItemTreeNode[] {
  const byParent = new Map<string | null, StandardListItem[]>();
  for (const item of items) {
    const key = item.parent_id;
    byParent.set(key, [...(byParent.get(key) ?? []), item]);
  }
  const sortSiblings = (arr: StandardListItem[]) =>
    [...arr].sort(
      (a, b) => a.position - b.position || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

  const toNode = (item: StandardListItem): StandardListItemTreeNode => ({
    ...item,
    children: sortSiblings(byParent.get(item.id) ?? []).map(toNode),
  });

  return sortSiblings(byParent.get(null) ?? []).map(toNode);
}

export function flattenTree(nodes: StandardListItemTreeNode[]): StandardListItemTreeNode[] {
  const out: StandardListItemTreeNode[] = [];
  const walk = (n: StandardListItemTreeNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

export function collectTags(items: StandardListItem[]): string[] {
  const set = new Set<string>();
  items.forEach((i) => i.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}

export function isDueToday(due_at: string | null): boolean {
  if (!due_at) return false;
  const d = new Date(due_at);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isOverdue(due_at: string | null, is_completed: boolean): boolean {
  if (!due_at || is_completed) return false;
  return startOfDay(new Date(due_at)).getTime() < startOfDay(new Date()).getTime();
}

export function formatDueDate(due_at: string | null): string {
  if (!due_at) return '';
  const d = new Date(due_at);
  const now = new Date();
  if (isDueToday(due_at)) return 'Today';
  const tomorrow = startOfDay(addDays(now, 1));
  if (startOfDay(d).getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function addRecurrenceDate(due_at: string | null, recurrence: StandardListRecurrence): string | null {
  if (!due_at || recurrence === 'none') return null;
  const d = new Date(due_at);
  if (recurrence === 'daily') d.setDate(d.getDate() + 1);
  if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
  if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export function formatRecurrence(recurrence: StandardListRecurrence): string {
  if (recurrence === 'daily') return 'Daily';
  if (recurrence === 'weekly') return 'Weekly';
  if (recurrence === 'monthly') return 'Monthly';
  return '';
}

export type ItemFilter = 'all' | 'active' | 'completed';
export type ItemSort = 'position' | 'due' | 'priority';

export function filterAndSortItems(
  items: StandardListItem[],
  filter: ItemFilter,
  sort: ItemSort,
  tag: string | null
): StandardListItem[] {
  let out = items;
  if (filter === 'active') out = out.filter((i) => !i.is_completed);
  if (filter === 'completed') out = out.filter((i) => i.is_completed);
  if (tag) out = out.filter((i) => i.tags.includes(tag));

  const copy = [...out];
  if (sort === 'due') {
    copy.sort((a, b) => {
      if (!a.due_at && !b.due_at) return a.position - b.position;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  } else if (sort === 'priority') {
    copy.sort((a, b) => b.priority - a.priority || a.position - b.position);
  } else {
    copy.sort((a, b) => a.position - b.position || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }
  return copy;
}

export function monthCalendarDays(anchor = new Date()): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function formatIcsDate(value: string): string {
  const d = new Date(value);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function buildIcsCalendar(
  lists: Array<{ name: string; items: StandardListItem[] }>
): string {
  const events = lists.flatMap((list) =>
    list.items
      .filter((item) => item.due_at)
      .map((item) => {
        const dt = formatIcsDate(item.due_at as string);
        return [
          'BEGIN:VEVENT',
          `UID:stashd-${item.id}@stashd`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
          `DTSTART;VALUE=DATE:${dt}`,
          `SUMMARY:${escapeIcsText(item.text)}`,
          `DESCRIPTION:${escapeIcsText(`${list.name}${item.notes ? `\\n\\n${item.notes}` : ''}`)}`,
          'END:VEVENT',
        ].join('\r\n');
      })
  );
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Stashd//Lists//EN', ...events, 'END:VCALENDAR'].join('\r\n');
}

export function itemsDueTodayAcrossLists(
  lists: Array<{ list: { id: string; name: string }; items: StandardListItem[] }>
): Array<StandardListItem & { list_name: string }> {
  const out: Array<StandardListItem & { list_name: string }> = [];
  for (const { list, items } of lists) {
    for (const item of items) {
      if (!item.is_completed && (isDueToday(item.due_at) || isOverdue(item.due_at, item.is_completed))) {
        out.push({ ...item, list_name: list.name });
      }
    }
  }
  return out.sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
  });
}
