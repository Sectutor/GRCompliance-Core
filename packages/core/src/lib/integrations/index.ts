/**
 * GRCompliance Integrations
 * 
 * Main entry point for the integration marketplace system.
 * Exports all integration types and utilities.
 */

// Types
export * from './types';

// Registry
export { integrationRegistry, getIntegrations, getIntegration, getBuiltInIntegrations, executeIntegration } from './registry';

// Marketplace client. Collector slugs are dropped in github-marketplace.ts.
export { githubMarketplace, GitHubMarketplaceClient, createMarketplaceClient } from './github-marketplace';

// Built-in integrations that do not collect evidence automatically.
export { slackManifest, SlackClient, executeSlackAction } from './slack';
export { googleDriveManifest, GoogleDriveClient, executeGoogleDriveAction } from './google-drive';
export { isPremiumCollector, PREMIUM_COLLECTOR_SLUGS } from './premiumCollectors';
