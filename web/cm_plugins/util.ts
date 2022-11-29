// Forked from https://codeberg.org/retronav/ixora
// Original author: Pranav Karawale
// License: Apache License 2.0.
import {
  Decoration,
  EditorState,
  EditorView,
  foldedRanges,
  SyntaxNodeRef,
  syntaxTree,
  WidgetType,
} from "../deps.ts";

export class LinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly title: string,
    readonly cssClass: string,
    readonly callback: (e: MouseEvent) => void,
  ) {
    super();
  }
  toDOM(): HTMLElement {
    const anchor = document.createElement("a");
    anchor.className = this.cssClass;
    anchor.textContent = this.text;
    anchor.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callback(e);
    });
    anchor.setAttribute("title", this.title);
    anchor.href = "#";
    return anchor;
  }
}

/**
 * Check if two ranges overlap
 * Based on the visual diagram on https://stackoverflow.com/a/25369187
 * @param range1 - Range 1
 * @param range2 - Range 2
 * @returns True if the ranges overlap
 */
export function checkRangeOverlap(
  range1: [number, number],
  range2: [number, number],
) {
  return range1[0] <= range2[1] && range2[0] <= range1[1];
}

/**
 * Check if a range is inside another range
 * @param parent - Parent (bigger) range
 * @param child - Child (smaller) range
 * @returns True if child is inside parent
 */
export function checkRangeSubset(
  parent: [number, number],
  child: [number, number],
) {
  return child[0] >= parent[0] && child[1] <= parent[1];
}

/**
 * Check if any of the editor cursors is in the given range
 * @param state - Editor state
 * @param range - Range to check
 * @returns True if the cursor is in the range
 */
export function isCursorInRange(state: EditorState, range: [number, number]) {
  return state.selection.ranges.some((selection) =>
    checkRangeOverlap(range, [selection.from, selection.to])
  );
}

/**
 * Decoration to simply hide anything.
 */
export const invisibleDecoration = Decoration.replace({});

export function iterateTreeInVisibleRanges(
  view: EditorView,
  iterateFns: {
    enter(node: SyntaxNodeRef): boolean | void;
    leave?(node: SyntaxNodeRef): void;
  },
) {
  // for (const { from, to } of view.visibleRanges) {
  //   syntaxTree(view.state).iterate({ ...iterateFns, from, to });
  // }
  syntaxTree(view.state).iterate(iterateFns);
}

/**
 * Returns the lines of the editor that are in the given range and not folded.
 * This function is of use when you need to get the lines of a particular
 * block node and add line decorations to each line of it.
 *
 * @param view - Editor view
 * @param from - Start of the range
 * @param to - End of the range
 * @returns A list of line blocks that are in the range
 */
export function editorLines(view: EditorView, from: number, to: number) {
  let lines = view.viewportLineBlocks.filter((block) =>
    // Keep lines that are in the range
    checkRangeOverlap([block.from, block.to], [from, to])
  );

  const folded = foldedRanges(view.state).iter();
  while (folded.value) {
    lines = lines.filter(
      (line) =>
        !checkRangeOverlap(
          [folded.from, folded.to],
          [line.from, line.to],
        ),
    );
    folded.next();
  }

  return lines;
}