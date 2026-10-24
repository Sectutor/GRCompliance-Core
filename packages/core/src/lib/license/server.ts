/**
 * License Server Integration
 * 
 * This module handles communication with the license server for validation,
 * activation, and management of commercial licenses.
 */

import { LicenseInfo, LicenseType, LicenseStatus } from './index';
import { isVendorHostname } from '../publicUrl';

export interface LicenseServerConfig {
  endpoint: string;
  apiKey?: string;
  timeout?: number;
  cacheDuration?: number; // in milliseconds
}

export interface LicenseActivationRequest {
  licenseKey: string;
  machineId?: string;
  domain?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export interface LicenseActivationResponse {
  success: boolean;
  license?: LicenseInfo;
  error?: string;
  activationId?: string;
}

export interface LicenseValidationRequest {
  licenseKey: string;
  activationId?: string;
  machineId?: string;
  domain?: string;
}

export interface LicenseValidationResponse {
  success: boolean;
  valid: boolean;
  license?: LicenseInfo;
  error?: string;
  requiresReactivation?: boolean;
}

export interface LicenseDeactivationRequest {
  licenseKey: string;
  activationId: string;
  reason?: string;
}

export interface LicenseDeactivationResponse {
  success: boolean;
  error?: string;
}

/**
 * License Server Client
 */
export class LicenseServerClient {
  private config: LicenseServerConfig;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  
  constructor(config: LicenseServerConfig) {
    this.config = {
      timeout: 10000,
      cacheDuration: 5 * 60 * 1000, // 5 minutes
      ...config
    };
  }
  
  /**
   * Activate a license
   */
  async activateLicense(request: LicenseActivationRequest): Promise<LicenseActivationResponse> {
    const cacheKey = `activate:${request.licenseKey}:${request.machineId || 'default'}`;
    
    try {
      const response = await this.makeRequest('/api/v1/licenses/activate', {
        method: 'POST',
        body: JSON.stringify(request)
      });
      
      if (response.success && response.license) {
        // Cache the successful activation
        this.cache.set(cacheKey, {
          data: response,
          timestamp: Date.now()
        });
      }
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during license activation'
      };
    }
  }
  
  /**
   * Validate a license
   */
  async validateLicense(request: LicenseValidationRequest): Promise<LicenseValidationResponse> {
    const cacheKey = `validate:${request.licenseKey}:${request.activationId || 'default'}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < (this.config.cacheDuration || 0)) {
      return cached.data;
    }
    
    try {
      const response = await this.makeRequest('/api/v1/licenses/validate', {
        method: 'POST',
        body: JSON.stringify(request)
      });
      
      if (response.success) {
        // Cache successful validation
        this.cache.set(cacheKey, {
          data: response,
          timestamp: Date.now()
        });
      }
      
      return response;
    } catch (error) {
      // On network error, check if we have a cached valid response
      if (cached) {
        return cached.data;
      }
      
      return {
        success: false,
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error during license validation'
      };
    }
  }
  
  /**
   * Deactivate a license
   */
  async deactivateLicense(request: LicenseDeactivationRequest): Promise<LicenseDeactivationResponse> {
    try {
      const response = await this.makeRequest('/api/v1/licenses/deactivate', {
        method: 'POST',
        body: JSON.stringify(request)
      });
      
      // Clear any cached entries for this license
      this.clearLicenseCache(request.licenseKey);
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during license deactivation'
      };
    }
  }
  
  /**
   * Get license usage statistics
   */
  async getLicenseUsage(licenseKey: string): Promise<any> {
    try {
      const response = await this.makeRequest(`/api/v1/licenses/${licenseKey}/usage`, {
        method: 'GET'
      });
      
      return response;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error fetching license usage'
      };
    }
  }
  
  /**
   * Make HTTP request to license server
   */
  private async makeRequest(path: string, options: RequestInit): Promise<any> {
    if (!this.config.endpoint) {
      throw new Error('License server endpoint is not configured');
    }
    let endpointHost = '';
    try {
      endpointHost = new URL(this.config.endpoint).hostname;
    } catch {
      throw new Error('License server endpoint must be an absolute http(s) URL');
    }
    if (isVendorHostname(endpointHost)) {
      throw new Error("License server endpoint must be this instance's own address");
    }
    const url = `${this.config.endpoint}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }),
      ...options.headers
    };
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`License server responded with status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  
  /**
   * Clear cache for a specific license
   */
  private clearLicenseCache(licenseKey: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(licenseKey)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.cache.clear();
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<LicenseServerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Default license server configuration
 */
export const defaultLicenseServerConfig: LicenseServerConfig = {
  endpoint: '',
  timeout: 10000,
  cacheDuration: 5 * 60 * 1000 // 5 minutes
};

/**
 * Singleton license server client instance
 */
let licenseServerClient: LicenseServerClient | null = null;

export function getLicenseServerClient(config?: Partial<LicenseServerConfig>): LicenseServerClient {
  if (!licenseServerClient) {
    licenseServerClient = new LicenseServerClient({
      ...defaultLicenseServerConfig,
      ...config
    });
  }
  
  if (config) {
    licenseServerClient.updateConfig(config);
  }
  
  return licenseServerClient;
}
