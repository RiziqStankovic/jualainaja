"use client";

export type LocalUser = {
    name: string;
    email: string;
    password: string;
    role: "merchant" | "customer";
};

export type SessionUser = Omit<LocalUser, "password">;
export type PurchaseHistory = {
    id: string;
    createdAt: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    storeName: string;
    productId: string;
    productName: string;
    quantity: number;
    totalAmount: number;
};

export type SalesHistory = {
    id: string;
    createdAt: string;
    merchantName: string;
    merchantEmail?: string;
    channel: "pos" | "public";
    itemsCount: number;
    totalAmount: number;
    items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        price: number;
    }>;
};

const USERS_KEY = "jualinaja_users";
const SESSION_KEY = "jualinaja_current_user";
const HISTORY_KEY = "jualinaja_purchase_history";
const SALES_HISTORY_KEY = "jualinaja_sales_history";

function isBrowser() {
    return typeof window !== "undefined";
}

function toSlug(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function getUsers(): LocalUser[] {
    if (!isBrowser()) return [];
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    try {
        return JSON.parse(raw) as LocalUser[];
    } catch {
        return [];
    }
}

export function saveUsers(users: LocalUser[]) {
    if (!isBrowser()) return;
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getSessionUser(): SessionUser | null {
    if (!isBrowser()) return null;
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as SessionUser;
    } catch {
        return null;
    }
}

export function setSessionUser(user: SessionUser) {
    if (!isBrowser()) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSessionUser() {
    if (!isBrowser()) return;
    localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new Event("auth:logout"));
}

export function getTenantContext(user?: SessionUser | null) {
    const current = user ?? getSessionUser();
    if (!current) {
        return null;
    }

    const emailPart = toSlug(current.email) || "user";
    return {
        tenantId: `tenant-${emailPart}`,
        tenantName: current.name || current.email,
        tenantEmail: current.email,
    };
}

export function getPurchaseHistory(email?: string): PurchaseHistory[] {
    if (!isBrowser()) return [];
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    try {
        const entries = JSON.parse(raw) as PurchaseHistory[];
        if (!email) return entries;
        return entries.filter((entry) => entry.customerEmail.toLowerCase() === email.toLowerCase());
    } catch {
        return [];
    }
}

export function addPurchaseHistory(entry: Omit<PurchaseHistory, "id" | "createdAt">) {
    if (!isBrowser()) return;
    const current = getPurchaseHistory();
    const next: PurchaseHistory = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        ...entry,
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify([next, ...current]));
}

export function getSalesHistory(user?: { email?: string; name?: string } | null): SalesHistory[] {
    if (!isBrowser()) return [];
    const raw = localStorage.getItem(SALES_HISTORY_KEY);
    if (!raw) return [];
    try {
        const entries = JSON.parse(raw) as SalesHistory[];
        if (!user) return entries;
        return entries.filter((entry) => {
            const byEmail =
                !!user.email &&
                !!entry.merchantEmail &&
                entry.merchantEmail.toLowerCase() === user.email.toLowerCase();
            const byName =
                !!user.name &&
                entry.merchantName.toLowerCase() === user.name.toLowerCase();
            return byEmail || byName;
        });
    } catch {
        return [];
    }
}

export function addSalesHistory(entry: Omit<SalesHistory, "id" | "createdAt">) {
    if (!isBrowser()) return;
    const current = getSalesHistory();
    const next: SalesHistory = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
        ...entry,
    };
    localStorage.setItem(SALES_HISTORY_KEY, JSON.stringify([next, ...current]));
}

export function findMerchantByName(name: string) {
    const users = getUsers();
    const normalized = name.trim().toLowerCase();
    return users.find((user) => user.role === "merchant" && user.name.trim().toLowerCase() === normalized) || null;
}
