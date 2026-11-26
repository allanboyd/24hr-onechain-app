/** Svelte action: render an element inside another element on the page (by id), e.g. a tab's toolbar in the page header.
 *  The element keeps its component's state and handlers; it goes back with the component when it is destroyed. */
export function portal(node: HTMLElement, targetId: string) {
  const move = (id: string) => { const t = document.getElementById(id); if (t) t.appendChild(node); };
  move(targetId);
  return { update: move, destroy: () => node.remove() };
}
