import { AutomergeUrl, Repo } from "@automerge/automerge-repo";

// Change this key to force a clean slate
const ROOT_DOC_URL_KEY = "root-doc-url-v3";

export type RootDocument = {
  documents: AutomergeUrl[];
};

export const getOrCreateRoot = (repo: Repo): AutomergeUrl => {
  const existingId = localStorage.getItem(ROOT_DOC_URL_KEY);
  if (existingId) {
    return existingId as AutomergeUrl;
  }
  const root = repo.create<RootDocument>({ documents: [] });
  localStorage.setItem(ROOT_DOC_URL_KEY, root.url);
  return root.url;
};