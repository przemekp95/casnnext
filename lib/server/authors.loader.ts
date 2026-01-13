import { getAuthors } from "./authors";

export async function loadAuthors() {
  return getAuthors();
}