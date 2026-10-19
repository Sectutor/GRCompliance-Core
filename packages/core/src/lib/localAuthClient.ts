const STORAGE_KEY = 'grc.local.session';

type LocalSession = {
    access_token: string;
    expires_at: number;
    user: {
        id: string;
        email: string | null;
        aud: string;
        role: string;
        app_metadata: Record<string, unknown>;
        user_metadata: Record<string, unknown>;
    };
};

type Listener = (event: string, session: LocalSession | null) => void;

const listeners = new Set<Listener>();

function readSession(): LocalSession | null {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
        const session = JSON.parse(raw) as LocalSession;
        if (!session?.access_token || !session.expires_at) return null;
        if (session.expires_at * 1000 < Date.now()) {
            window.localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return session;
    } catch {
        return null;
    }
}

function writeSession(session: LocalSession | null) {
    if (typeof window === 'undefined') return;
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
}

function emit(event: string, session: LocalSession | null) {
    listeners.forEach((listener) => listener(event, session));
}

const mfaApi = {
    async getAuthenticatorAssuranceLevel() {
        return { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null };
    },
    async listFactors() {
        return { data: { factors: [], all: [], totp: [] }, error: null };
    },
    async enroll() {
        return { data: null, error: { message: 'MFA is not available with local authentication' } };
    },
    async unenroll() {
        return { data: null, error: { message: 'MFA is not available with local authentication' } };
    },
    async challengeAndVerify() {
        return { data: null, error: { message: 'MFA is not available with local authentication' } };
    },
};

export function adoptLocalSession(body: {
    access_token: string;
    expires_at: number;
    user: LocalSession['user'];
}) {
    const session: LocalSession = {
        access_token: body.access_token,
        expires_at: body.expires_at,
        user: body.user,
    };
    writeSession(session);
    emit('SIGNED_IN', session);
}

export function createLocalAuthClient() {
    return {
        auth: {
            mfa: mfaApi,
            async getSession() {
                return { data: { session: readSession() }, error: null };
            },
            async getUser() {
                const session = readSession();
                return { data: { user: session?.user ?? null }, error: null };
            },
            onAuthStateChange(callback: Listener) {
                listeners.add(callback);
                return {
                    data: {
                        subscription: {
                            unsubscribe() {
                                listeners.delete(callback);
                            },
                        },
                    },
                };
            },
            async signInWithPassword({ email, password }: { email: string; password: string }) {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                    return { data: { session: null, user: null }, error: { message: body.error || 'Invalid email or password' } };
                }
                const session: LocalSession = {
                    access_token: body.access_token,
                    expires_at: body.expires_at,
                    user: body.user,
                };
                writeSession(session);
                emit('SIGNED_IN', session);
                return { data: { session, user: session.user }, error: null };
            },
            async signOut() {
                writeSession(null);
                emit('SIGNED_OUT', null);
                return { error: null };
            },
            async signUp() {
                return { data: { user: null, session: null }, error: { message: 'Create accounts from the administrator console. The first administrator is created on startup.' } };
            },
            async updateUser() {
                return { data: { user: readSession()?.user ?? null }, error: { message: 'Password changes are not available in this build.' } };
            },
            async resetPasswordForEmail() {
                return { data: {}, error: { message: 'Password reset email is not configured for local authentication.' } };
            },
            async refreshSession() {
                return { data: { session: readSession() }, error: null };
            },
        },
    };
}
