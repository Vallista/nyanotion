export { createPersonalSpace, hasOpenInvitation, isFirstUser } from "./accounts";
export { saveYdoc } from "./collab";
export {
  createCollection,
  deleteCollection,
  getCollection,
  listCollections,
  updateCollection,
  type CollectionFilter,
  type CollectionSummary,
  type CollectionView,
} from "./collections";
export {
  archiveDocument,
  countArchived,
  createDocument,
  emptyTrash,
  getDocumentById,
  listArchived,
  listRecent,
  listTree,
  moveDocument,
  personalSpaceOf,
  renameDocument,
  restoreDocument,
  setContent,
  setIcon,
  type TreeNode,
} from "./documents";
export { searchDocuments, type SearchHit } from "./search";
export {
  attachTag,
  deleteTag,
  detachTag,
  documentsWithTag,
  ensureTag,
  isFavorite,
  listFavorites,
  listTags,
  renameTag as renameTagName,
  tagsForDocuments,
  toggleFavorite,
  type TagWithCount,
} from "./tagging";
