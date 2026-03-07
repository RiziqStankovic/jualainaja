"use client";

import Link from "next/link";
import styles from "./products.module.css";
import { Search, Filter, RefreshCw, Plus, PackageOpen, LayoutGrid, Tag, CalendarDays, Save, Share2, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { resolveProductStatus, type ProductStatus } from "@/lib/product-meta";
import { getSessionUser, getTenantContext } from "@/lib/local-auth";

type Product = {
    id: string;
    name: string;
    price: number;
    stock: number;
    type: string;
    createdAt: string;
    updatedAt: string;
    status?: ProductStatus | null;
    statusDate?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    storeSlug?: string;
    productSlug?: string;
    isPublic?: boolean;
};

const tabs: ProductStatus[] = ["Aktif", "Habis", "Hold", "Expired", "Tidak Aktif"];
const typeFilters = ["Semua", "Fisik", "Digital", "Jasa", "Acara"] as const;

const PRODUCT_CACHE_TTL_MS = 15_000;
const productsInFlight = new Map<string, Promise<Product[]>>();
const productsCache = new Map<string, { ts: number; data: Product[] }>();

async function fetchProductsWithDedupe(tenantId: string, tenantName?: string): Promise<Product[]> {
    const key = `${tenantId}::${tenantName ?? ""}`;
    const cached = productsCache.get(key);
    if (cached && Date.now() - cached.ts < PRODUCT_CACHE_TTL_MS) {
        return cached.data;
    }

    const inFlight = productsInFlight.get(key);
    if (inFlight) {
        return inFlight;
    }

    const query = new URLSearchParams();
    query.set("tenantId", tenantId);
    if (tenantName) query.set("tenantName", tenantName);

    const request = fetch(`/api/products?${query.toString()}`)
        .then(async (res) => {
            if (!res.ok) throw new Error("Failed to fetch products");
            const data = (await res.json()) as Product[];
            productsCache.set(key, { ts: Date.now(), data });
            return data;
        })
        .finally(() => {
            productsInFlight.delete(key);
        });

    productsInFlight.set(key, request);
    return request;
}

function getDerivedStatus(product: Product): ProductStatus {
    return resolveProductStatus(product.stock, product.status, product.statusDate);
}

function toDateInputValue(value?: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [activeTab, setActiveTab] = useState<ProductStatus>("Aktif");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [activeTypeFilter, setActiveTypeFilter] = useState<(typeof typeFilters)[number]>("Semua");
    const [isEditMode, setIsEditMode] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, { price: string; stock: string; status: ProductStatus; statusDate: string }>>({});
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [savingAdd, setSavingAdd] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [addForm, setAddForm] = useState({
        name: "",
        price: "",
        stock: "",
        type: "Fisik",
        status: "Aktif" as ProductStatus,
        statusDate: "",
        description: "",
        imageUrl: "",
        isPublic: true,
    });

    const buildPublicLink = (product: Product) => {
        if (typeof window === "undefined") return "";
        const sessionUser = getSessionUser();
        const storeFromUser = sessionUser?.name
            ?.toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        return `${window.location.origin}/${storeFromUser || product.storeSlug || "toko"}/${product.productSlug || product.id}`;
    };

    const shareProduct = async (product: Product) => {
        const link = buildPublicLink(product);
        if (!link) return;
        await navigator.clipboard.writeText(link);
        setCopiedId(product.id);
        setTimeout(() => setCopiedId((prev) => (prev === product.id ? null : prev)), 1200);
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const sessionUser = getSessionUser();
            const tenant = getTenantContext(sessionUser);
            if (!tenant) {
                setProducts([]);
                return;
            }
            const data = await fetchProductsWithDedupe(tenant.tenantId, sessionUser?.name);
            setProducts(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
    }, []);

    useEffect(() => {
        const handleLogout = () => {
            setProducts([]);
            setSearch("");
            setDrafts({});
            setIsAddOpen(false);
        };
        window.addEventListener("auth:logout", handleLogout);
        return () => window.removeEventListener("auth:logout", handleLogout);
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter((product) => {
            const statusMatch = getDerivedStatus(product) === activeTab;
            const searchMatch = product.name.toLowerCase().includes(search.toLowerCase());
            const typeMatch = activeTypeFilter === "Semua" ? true : product.type === activeTypeFilter;
            return statusMatch && searchMatch && typeMatch;
        });
    }, [products, activeTab, search, activeTypeFilter]);

    const cycleTypeFilter = () => {
        const currentIndex = typeFilters.indexOf(activeTypeFilter);
        const nextIndex = (currentIndex + 1) % typeFilters.length;
        setActiveTypeFilter(typeFilters[nextIndex]);
    };

    const toggleEditMode = () => {
        if (!isEditMode) {
            const nextDrafts: Record<string, { price: string; stock: string; status: ProductStatus; statusDate: string }> = {};
            for (const product of products) {
                nextDrafts[product.id] = {
                    price: String(product.price),
                    stock: String(product.stock),
                    status: getDerivedStatus(product),
                    statusDate: toDateInputValue(product.statusDate),
                };
            }
            setDrafts(nextDrafts);
        }
        setIsEditMode((prev) => !prev);
    };

    const saveProductDraft = async (id: string) => {
        const draft = drafts[id];
        if (!draft) return;
        const tenant = getTenantContext(getSessionUser());
        if (!tenant) {
            alert("Silakan login dulu.");
            return;
        }
        try {
            const res = await fetch(`/api/products/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    price: Number(draft.price),
                    stock: Number(draft.stock),
                    status: draft.status,
                    statusDate: draft.statusDate || null,
                    tenantId: tenant.tenantId,
                }),
            });
            if (!res.ok) throw new Error("Failed to update product");
            await fetchProducts();
        } catch (error) {
            console.error(error);
            alert("Gagal update produk.");
        }
    };

    const handleAddProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingAdd(true);
        try {
            const sessionUser = getSessionUser();
            const tenant = getTenantContext(sessionUser);
            if (!tenant) {
                alert("Silakan login dulu.");
                return;
            }
            const res = await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...addForm,
                    statusDate: addForm.statusDate || null,
                    tenantName: sessionUser?.name || undefined,
                    tenantEmail: sessionUser?.email || undefined,
                    tenantId: tenant.tenantId,
                }),
            });
            if (!res.ok) throw new Error("Failed to add product");
            setIsAddOpen(false);
            setAddForm({ name: "", price: "", stock: "", type: "Fisik", status: "Aktif", statusDate: "", description: "", imageUrl: "", isPublic: true });
            await fetchProducts();
        } catch (error) {
            console.error(error);
            alert("Gagal menambahkan produk.");
        } finally {
            setSavingAdd(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.tabsWrapper}>
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        className={`${styles.tabBtn} ${activeTab === tab ? styles.tabActive : ""}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            <div className={styles.controlsRow}>
                <div className={styles.searchBox}>
                    <Search className={styles.searchIcon} size={18} />
                    <input
                        type="text"
                        placeholder="Cari Produk"
                        className={styles.searchInput}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <button className={styles.filterBtn} onClick={cycleTypeFilter}>
                    <Filter size={18} />
                    <span>{activeTypeFilter}</span>
                </button>
            </div>

            <div className={styles.actionsRow}>
                <button className={`${styles.actionBtn} ${styles.updateBtn}`} onClick={toggleEditMode}>
                    <RefreshCw size={18} />
                    {isEditMode ? "Selesai Update" : "Update Semua"}
                </button>
                <button className={`${styles.actionBtn} ${styles.addBtn}`} onClick={() => setIsAddOpen(true)}>
                    <Plus size={18} strokeWidth={3} />
                    Tambah Produk
                </button>
            </div>

            {loading ? (
                <div className={styles.emptyState}>
                    <p className={styles.emptySubtitle}>Memuat produk...</p>
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.illustrationBlob}>
                        <PackageOpen size={80} className={styles.illustrationIcon} strokeWidth={1} />
                        <div style={{ position: "absolute", top: "40px", left: "20px", color: "#2563eb" }}>
                            <Tag size={24} />
                        </div>
                        <div style={{ position: "absolute", bottom: "40px", right: "20px", color: "#3b82f6" }}>
                            <LayoutGrid size={32} />
                        </div>
                    </div>
                    <h3 className={styles.emptyTitle}>Belum ada produk sesuai filter</h3>
                    <p className={styles.emptySubtitle}>
                        Silakan klik tombol tambah produk atau ubah filter status.
                    </p>
                </div>
            ) : (
                <div className={styles.listSection}>
                    {filteredProducts.map((product) => (
                        <div key={product.id} className={styles.productRow}>
                            <div className={styles.productMain}>
                                <div className={styles.productPreview}>
                                    {product.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={product.imageUrl} alt={product.name} className={styles.productPreviewImg} />
                                    ) : (
                                        <div className={styles.productPreviewFallback}>
                                            {product.type === "Fisik" ? "BX" : product.type === "Digital" ? "DG" : "SV"}
                                        </div>
                                    )}
                                </div>
                                <h4>{product.name}</h4>
                                <div className={styles.metaLine}>
                                    <span className={styles.typeTag}>{product.type}</span>
                                    <span className={styles.statusTag}>{getDerivedStatus(product)}</span>
                                </div>
                                <div className={styles.dateLine}>
                                    <CalendarDays size={14} />
                                    Tanggal: {product.statusDate ? new Date(product.statusDate).toLocaleDateString("id-ID") : "-"}
                                </div>
                            </div>

                            {isEditMode ? (
                                <div className={styles.editPanel}>
                                    <input
                                        type="number"
                                        value={drafts[product.id]?.price ?? product.price}
                                        onChange={(e) =>
                                            setDrafts((prev) => ({
                                                ...prev,
                                                [product.id]: {
                                                    ...(prev[product.id] || {
                                                        price: String(product.price),
                                                        stock: String(product.stock),
                                                        status: getDerivedStatus(product),
                                                        statusDate: toDateInputValue(product.statusDate),
                                                    }),
                                                    price: e.target.value,
                                                },
                                            }))
                                        }
                                    />
                                    <input
                                        type="number"
                                        value={drafts[product.id]?.stock ?? product.stock}
                                        onChange={(e) =>
                                            setDrafts((prev) => ({
                                                ...prev,
                                                [product.id]: {
                                                    ...(prev[product.id] || {
                                                        price: String(product.price),
                                                        stock: String(product.stock),
                                                        status: getDerivedStatus(product),
                                                        statusDate: toDateInputValue(product.statusDate),
                                                    }),
                                                    stock: e.target.value,
                                                },
                                            }))
                                        }
                                    />
                                    <select
                                        value={drafts[product.id]?.status ?? getDerivedStatus(product)}
                                        onChange={(e) =>
                                            setDrafts((prev) => ({
                                                ...prev,
                                                [product.id]: {
                                                    ...(prev[product.id] || {
                                                        price: String(product.price),
                                                        stock: String(product.stock),
                                                        status: getDerivedStatus(product),
                                                        statusDate: toDateInputValue(product.statusDate),
                                                    }),
                                                    status: e.target.value as ProductStatus,
                                                },
                                            }))
                                        }
                                    >
                                        {tabs.map((status) => (
                                            <option key={status} value={status}>{status}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="date"
                                        value={drafts[product.id]?.statusDate ?? toDateInputValue(product.statusDate)}
                                        onChange={(e) =>
                                            setDrafts((prev) => ({
                                                ...prev,
                                                [product.id]: {
                                                    ...(prev[product.id] || {
                                                        price: String(product.price),
                                                        stock: String(product.stock),
                                                        status: getDerivedStatus(product),
                                                        statusDate: toDateInputValue(product.statusDate),
                                                    }),
                                                    statusDate: e.target.value,
                                                },
                                            }))
                                        }
                                    />
                                    <button onClick={() => saveProductDraft(product.id)}>
                                        <Save size={14} /> Simpan
                                    </button>
                                </div>
                            ) : (
                                <div className={styles.priceBox}>
                                    <p>Stok: {product.stock}</p>
                                    <h5>Rp {product.price.toLocaleString("id-ID")}</h5>
                                    <div className={styles.productActions}>
                                        <Link href={`/products/${product.id}`} className={styles.detailLink}>Detail</Link>
                                        <button type="button" className={styles.detailLink} onClick={() => shareProduct(product)}>
                                            <Share2 size={13} /> {copiedId === product.id ? "Tersalin" : "Copy"}
                                        </button>
                                        <a href={buildPublicLink(product)} target="_blank" rel="noreferrer" className={styles.detailLink}>
                                            <ExternalLink size={13} /> Open
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {isAddOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsAddOpen(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <h3>Tambah Produk Baru</h3>
                        <form className={styles.modalForm} onSubmit={handleAddProduct}>
                            <input
                                type="text"
                                placeholder="Nama Produk"
                                value={addForm.name}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, name: e.target.value }))}
                                required
                            />
                            <div className={styles.modalRow}>
                                <input
                                    type="number"
                                    placeholder="Harga"
                                    value={addForm.price}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, price: e.target.value }))}
                                    required
                                />
                                <input
                                    type="number"
                                    placeholder="Stok"
                                    value={addForm.stock}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, stock: e.target.value }))}
                                    required
                                />
                            </div>
                            <select
                                value={addForm.type}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, type: e.target.value }))}
                            >
                                <option value="Fisik">Barang Fisik</option>
                                <option value="Digital">Produk Digital</option>
                                <option value="Jasa">Layanan / Jasa</option>
                                <option value="Acara">Tiket Acara</option>
                            </select>
                            <div className={styles.modalRow}>
                                <select
                                    value={addForm.status}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, status: e.target.value as ProductStatus }))}
                                >
                                    {tabs.map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                                <input
                                    type="date"
                                    value={addForm.statusDate}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, statusDate: e.target.value }))}
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="URL Gambar Produk (opsional)"
                                value={addForm.imageUrl}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                            />
                            <textarea
                                placeholder="Deskripsi produk (opsional)"
                                value={addForm.description}
                                onChange={(e) => setAddForm((prev) => ({ ...prev, description: e.target.value }))}
                                rows={3}
                            />
                            <label className={styles.inlineCheck}>
                                <input
                                    type="checkbox"
                                    checked={addForm.isPublic}
                                    onChange={(e) => setAddForm((prev) => ({ ...prev, isPublic: e.target.checked }))}
                                />
                                Produk publik (bisa dibeli dari link)
                            </label>
                            <button type="submit" className={styles.submitBtn} disabled={savingAdd}>
                                {savingAdd ? "Menyimpan..." : "Simpan Produk"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
