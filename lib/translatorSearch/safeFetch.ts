import "server-only";

export {
  safeFetchHtmlCore as safeFetchHtml,
  createNodePinnedHttpRequest,
  resolvePublicIps,
  type SafeFetchResult,
  type SafeFetchOk,
  type SafeFetchErr,
  type DnsLookupFn,
  type PinnedHttpRequestFn,
  type PinnedHttpResponse,
} from "@/lib/translatorSearch/safeFetchCore";
