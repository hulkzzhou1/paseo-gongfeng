export type ReviewerDraft = { id: number; name: string; username: string; avatarUrl?: string | null; necessary: boolean; unknown: boolean };

export function selectReviewer(people: ReviewerDraft[], person: Pick<ReviewerDraft, "id" | "name" | "username" | "avatarUrl">, necessary: boolean): ReviewerDraft[] {
  const existing = people.find(p => p.id === person.id);
  if (existing?.unknown) return people;
  if (existing?.necessary === necessary) return people.filter(p => p.id !== person.id);
  if (existing) return people.map(p => p.id === person.id ? { ...p, necessary } : p);
  if (people.length >= 100) return people;
  return [...people, { ...person, necessary, unknown: false }];
}

export function reviewRuleText(rule: number | null | undefined) {
  return rule == null ? "规则待核对" : rule === 0 ? "无需同意" : rule === -1 ? "全部同意" : `至少 ${rule} 人同意`;
}

export function reviewerDropdown(anchorY: number, anchorHeight: number, containerHeight: number) {
  const gap = 4, maxHeight = Math.min(280, Math.max(0, containerHeight - gap * 2));
  const below = containerHeight - anchorY - anchorHeight - gap;
  const height = Math.min(maxHeight, Math.max(below, anchorY - gap));
  return below >= height ? { top: anchorY + anchorHeight + gap, maxHeight: height }
    : { bottom: containerHeight - anchorY + gap, maxHeight: height };
}
