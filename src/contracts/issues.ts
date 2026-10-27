/** Something wrong with user-supplied content, located by its path in the parsed value. */
export interface Issue {
  path: (string | number)[];
  message: string;
}
