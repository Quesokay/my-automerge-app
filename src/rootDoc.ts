import { AutomergeUrl, Repo } from "@automerge/automerge-repo";

const ROOT_DOC_URL_KEY = "root-doc-url";

export type RootDocument = {
  documents: AutomergeUrl[];
};

export const getOrCreateRoot = (repo: Repo): AutomergeUrl => {
  const existingId = localStorage.getItem(ROOT_DOC_URL_KEY);
  if (existingId) {
    return existingId as AutomergeUrl;
  }
  // Initialize a new root document if one doesn't exist
  const root = repo.create<RootDocument>({ documents: [] });
  localStorage.setItem(ROOT_DOC_URL_KEY, root.url);
  return root.url;
};