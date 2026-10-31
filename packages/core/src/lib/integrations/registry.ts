/**
 * Integration Registry
 * 
 * Manages both built-in integrations and marketplace integrations.
 * Provides a unified API for discovering and executing integrations.
 */

import type {
    IntegrationManifest,
    IntegrationConnection,
    MarketplaceEntry,
    IntegrationContext,
    IntegrationResult
} from './types';

// Built-in integrations that do not collect evidence automatically.
import { slackManifest, executeSlackAction } from './slack';
import { googleDriveManifest, executeGoogleDriveAction } from './google-drive';
import { isPremiumCollector } from './premiumCollectors';

type IntegrationExecutor = (
    actionId: string,
    context: IntegrationContext,
    params?: any
) => Promise<IntegrationResult>;

interface RegisteredIntegration {
    manifest: IntegrationManifest;
    executor: IntegrationExecutor;
    source: 'built-in' | 'marketplace' | 'custom';
}

class IntegrationRegistry {
    private integrations = new Map<string, RegisteredIntegration>();
    private connections = new Map<string, IntegrationConnection>();

    constructor() {
        this.registerBuiltIns();
    }

    /**
     * Register built-in integrations
     */
    private registerBuiltIns(): void {
        this.register(slackManifest, executeSlackAction, 'built-in');
        this.register(googleDriveManifest, executeGoogleDriveAction, 'built-in');

        console.log('[IntegrationRegistry] Registered built-in integrations');
    }

    /**
     * Register a new integration
     */
    register(
        manifest: IntegrationManifest,
        executor: IntegrationExecutor,
        source: 'built-in' | 'marketplace' | 'custom' = 'custom'
    ): void {
        if (isPremiumCollector(manifest.slug)) {
            console.warn(`[IntegrationRegistry] Refused collector integration: ${manifest.slug}`);
            return;
        }

        if (this.integrations.has(manifest.slug)) {
            console.warn(`[IntegrationRegistry] Integration ${manifest.slug} already registered, overwriting`);
        }

        this.integrations.set(manifest.slug, {
            manifest,
            executor,
            source
        });

        console.log(`[IntegrationRegistry] Registered integration: ${manifest.slug} (${source})`);
    }

    /**
     * Get integration manifest
     */
    get(slug: string): IntegrationManifest | undefined {
        return this.integrations.get(slug)?.manifest;
    }

    /**
     * Get all registered integrations
     */
    list(): IntegrationManifest[] {
        return Array.from(this.integrations.values()).map(i => i.manifest);
    }

    /**
     * Get integrations by category
     */
    listByCategory(category: string): IntegrationManifest[] {
        return this.list().filter(i => i.category === category);
    }

    /**
     * Get built-in integrations only
     */
    listBuiltIns(): IntegrationManifest[] {
        return Array.from(this.integrations.values())
            .filter(i => i.source === 'built-in')
            .map(i => i.manifest);
    }

    /**
     * Check if integration exists
     */
    has(slug: string): boolean {
        return this.integrations.has(slug);
    }

    /**
     * Execute an integration action
     */
    async execute(
        slug: string,
        actionId: string,
        context: IntegrationContext,
        params?: any
    ): Promise<IntegrationResult> {
        if (isPremiumCollector(slug)) {
            return {
                success: false,
                error: 'Automatic evidence collection is a Premium feature.',
                timestamp: new Date()
            };
        }

        const integration = this.integrations.get(slug);

        if (!integration) {
            return {
                success: false,
                error: `Integration not found: ${slug}`,
                timestamp: new Date()
            };
        }

        try {
            return await integration.executor(actionId, context, params);
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Unknown error',
                timestamp: new Date()
            };
        }
    }

    /**
     * Save a connection
     */
    saveConnection(connection: IntegrationConnection): void {
        this.connections.set(connection.id, connection);
    }

    /**
     * Get connection by ID
     */
    getConnection(id: string): IntegrationConnection | undefined {
        return this.connections.get(id);
    }

    /**
     * Get all connections for a user
     */
    getUserConnections(userId: string): IntegrationConnection[] {
        return Array.from(this.connections.values())
            .filter(c => c.userId === userId);
    }

    /**
     * Get all connections for an integration
     */
    getIntegrationConnections(slug: string): IntegrationConnection[] {
        return Array.from(this.connections.values())
            .filter(c => c.integrationSlug === slug);
    }

    /**
     * Delete a connection
     */
    deleteConnection(id: string): boolean {
        return this.connections.delete(id);
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(id: string, status: IntegrationConnection['status'], error?: string): void {
        const connection = this.connections.get(id);
        if (connection) {
            connection.status = status;
            connection.errorMessage = error;
            connection.updatedAt = new Date();
        }
    }
}

// Export singleton instance
export const integrationRegistry = new IntegrationRegistry();

// Helper functions
export function getIntegrations() {
    return integrationRegistry.list();
}

export function getIntegration(slug: string) {
    return integrationRegistry.get(slug);
}

export function getBuiltInIntegrations() {
    return integrationRegistry.listBuiltIns();
}

export async function executeIntegration(
    slug: string,
    actionId: string,
    context: IntegrationContext,
    params?: any
) {
    return integrationRegistry.execute(slug, actionId, context, params);
}

export default integrationRegistry;
