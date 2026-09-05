/**
 * Svelte action: re-parent the node to <body>. Overlays rendered inside the
 * iOS momentum scroller (`-webkit-overflow-scrolling: touch`) get trapped in
 * its stacking context — the tab bar paints ABOVE position:fixed sheets.
 * Portaling to body makes z-index behave everywhere.
 */
export function portal(node: HTMLElement): { destroy(): void } {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
