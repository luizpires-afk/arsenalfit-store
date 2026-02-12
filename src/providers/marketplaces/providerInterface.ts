export type MarketplaceStatus = "active" | "out_of_stock" | "paused";

export interface ProviderRequest {
  itemId: string;
  etag?: string | null;
  accessToken?: string | null;
  timeoutMs?: number;
}

export interface ProviderResult {
  statusCode?: number;
  etag?: string | null;
  price?: number;
  status?: MarketplaceStatus;
  isTimeout?: boolean;
  error?: string;
}

export interface MarketplaceProvider {
  marketplace: string;
  fetchItem: (request: ProviderRequest) => Promise<ProviderResult>;
}
