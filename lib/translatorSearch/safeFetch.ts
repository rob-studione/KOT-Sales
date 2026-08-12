import "server-only";

export {
  safeFetchHtmlCore as safeFetchHtml,
  safeFetchDocumentCore as safeFetchDocument,
  createNodePinnedHttpRequest,
  resolvePublicIps,
  type SafeFetchResult,
  type SafeFetchOk,
  type SafeFetchErr,
  type SafeFetchDocumentResult,
  type SafeFetchDocumentOk,
  type DnsLookupFn,
  type PinnedHttpRequestFn,
  type PinnedHttpResponse,
} from "@/lib/translatorSearch/safeFetchCore";
