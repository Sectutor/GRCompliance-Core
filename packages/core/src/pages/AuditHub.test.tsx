
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import '@testing-library/jest-dom';

vi.mock('@/lib/trpc', () => {
    const useQuery = vi.fn(() => ({ data: [], isLoading: false, refetch: vi.fn() }));
    const useMutation = vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));
    const procedure = { useQuery, useMutation };
    const router = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'then' || typeof prop === 'symbol') return undefined;
            return procedure;
        },
    });
    const utils: any = new Proxy({}, {
        get(_target, prop) {
            if (prop === 'then' || prop === 'toJSON' || typeof prop === 'symbol') return undefined;
            if (prop === 'invalidate' || prop === 'fetch' || prop === 'setData') return vi.fn();
            return utils;
        },
    });
    return {
        trpc: new Proxy(
            {
                useContext: () => utils,
                useUtils: () => utils,
            },
            {
                get(target, prop) {
                    if (prop === 'useContext') return target.useContext;
                    if (prop === 'useUtils') return target.useUtils;
                    if (prop === 'then' || typeof prop === 'symbol') return undefined;
                    return router;
                },
            }
        ),
    };
});

vi.mock('@/contexts/AuthContext', () => ({
    AuthProvider: ({ children }: any) => <div>{children}</div>,
    useAuth: () => ({ user: { email: 'test@example.com' }, loading: false }),
}));

vi.mock('@/contexts/ClientContext', () => ({
    ClientContextProvider: ({ children }: any) => <div>{children}</div>,
    useClientContext: () => ({ selectedClientId: 3, setSelectedClientId: vi.fn() }),
}));

vi.mock('wouter', () => ({
    useRoute: vi.fn().mockReturnValue([true, { clientId: '3' }]),
    useLocation: vi.fn().mockReturnValue(['/', vi.fn()]),
    useParams: vi.fn().mockReturnValue({ id: '3', clientId: '3' }),
    Link: ({ children }: any) => <a data-testid="link">{children}</a>,
    Redirect: () => null,
}));

vi.mock('@/components/PageGuide', () => ({
    PageGuide: () => null,
}));

// Mock the DashboardLayout using the alias as used in AuditHub.tsx
vi.mock('@/components/DashboardLayout', () => ({
    default: ({ children, title }: any) => (
        <div data-testid="dashboard-layout">
            <h1 data-testid="layout-title">{title}</h1>
            {children}
        </div>
    ),
}));

// Mock the core components that might be problematic
vi.mock('@complianceos/ui/ui/tooltip', () => ({
    TooltipProvider: ({ children }: any) => <div>{children}</div>,
}));

// We need a very basic version of AuditHub for testing if the real one has too many dependencies
import AuditHub from './AuditHub';

describe('AuditHub Smoke Test', () => {
    it('renders without crashing with mocked dependencies', () => {
        // Just check if it renders anything
        render(<AuditHub />);
        expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
        expect(screen.getByText(/AuditWorkspace™/i)).toBeInTheDocument();
        expect(screen.getByText(/Secure Clean Room/i)).toBeInTheDocument();
        expect(screen.getByText(/PBC Inbox/i)).toBeInTheDocument();
    });
});
