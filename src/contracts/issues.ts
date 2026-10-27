/** Something wrong with user-supplied content, located by its path in the parsed value. */
export interface Issue {
  path: (string | number)[];
  message: string;
  /** Where the problem is in the source file (the path's first element), 1-based, when it came from text. */
  line?: number;
  column?: number;
}
