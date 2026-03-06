"use client";

import { CSSProperties, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";
import cartStyles from "./pos.module.css";
import gridStyles from "./product-grid.module.css";
import {
    Search,
    ShoppingCart,
    ShoppingBag,
    Filter,
    MapPin,
    ArrowUpDown,
    PackageOpen,
    ArrowLeft,
    Wallet,
    CreditCard,
    LayoutGrid,
    List,
} from "lucide-react";
import { addSalesHistory, getSessionUser, getTenantContext } from "@/lib/local-auth";

interface Product {
    id: string;
    name: string;
    price: number;
    stock: number;
    type: string;
    imageUrl?: string | null;
    status?: "Aktif" | "Habis" | "Hold" | "Expired" | "Tidak Aktif" | null;
    statusDate?: string | null;
}

interface CartItem extends Product {
    quantity: number;
}

interface PaginatedProductsResponse {
    items: Product[];
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
}

interface ProductCacheEntry {
    pages: Product[][];
    total: number;
    hasMore: boolean;
    updatedAt: number;
}

interface CheckoutResponse {
    success: boolean;
    updatedProducts: Array<{ id: string; stock: number }>;
    error?: string;
}

const PAGE_SIZE = 8;
const CACHE_STALE_MS = 20_000;

const getQueryKey = (searchValue: string, filterValue: string, sortValue: string) =>
    JSON.stringify({
        search: searchValue.trim().toLowerCase(),
        filter: filterValue,
        sort: sortValue,
    });

const queryCacheStore = new Map<string, ProductCacheEntry>();
let persistedPosUiState: {
    activeFilter: string;
    activeSort: string;
    search: string;
    viewMode: "grid" | "list";
} = {
    activeFilter: "Semua",
    activeSort: "Nama: A-Z",
    search: "",
    viewMode: "grid",
};

const SORT_PARAM_MAP: Record<string, string> = {
    Terbaru: "newest",
    Terlama: "oldest",
    "Harga: Rendah ke Tinggi": "price_asc",
    "Harga: Tinggi ke Rendah": "price_desc",
    "Nama: A-Z": "name_asc",
    "Nama: Z-A": "name_desc",
};
const CASH_SUGGESTIONS = [2000, 5000, 10000, 20000, 50000];

export default function POSPage() {
    const initialFilter = persistedPosUiState.activeFilter;
    const initialSort = persistedPosUiState.activeSort;
    const initialSearch = persistedPosUiState.search;
    const initialViewMode = persistedPosUiState.viewMode;
    const initialQueryKey = getQueryKey(initialSearch, initialFilter, initialSort);
    const initialCachedEntry = queryCacheStore.get(initialQueryKey);

    const [products, setProducts] = useState<Product[]>(initialCachedEntry ? initialCachedEntry.pages.flat() : []);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [loading, setLoading] = useState(!initialCachedEntry);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(initialCachedEntry ? initialCachedEntry.hasMore : false);
    const [activeFilter, setActiveFilter] = useState(initialFilter);
    const [activeLocation, setActiveLocation] = useState("Semua Lokasi");
    const [activeSort, setActiveSort] = useState(initialSort);
    const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
    const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const [locationSearch, setLocationSearch] = useState("");
    const [search, setSearch] = useState(initialSearch);
    const [checkoutStep, setCheckoutStep] = useState<"cart" | "payment">("cart");
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
    const [cashPaid, setCashPaid] = useState("");
    const [processingPayment, setProcessingPayment] = useState(false);
    const [storeName, setStoreName] = useState("Toko");
    const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);

    const locationOptions = ["Semua Lokasi", "Jakarta", "Bandung", "Surabaya", "Yogyakarta", "Denpasar", "Medan"];
    const filteredLocations = locationOptions.filter((loc) =>
        loc.toLowerCase().includes(locationSearch.toLowerCase())
    );

    const categoryBtnRef = useRef<HTMLButtonElement>(null);
    const locationBtnRef = useRef<HTMLButtonElement>(null);
    const sortBtnRef = useRef<HTMLButtonElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const activeQueryRef = useRef("");
    const queryVersionRef = useRef(0);
    const nextPageRef = useRef(initialCachedEntry ? initialCachedEntry.pages.length + 1 : 1);
    const cacheRef = useRef<Map<string, ProductCacheEntry>>(queryCacheStore);

    const queryKey = useMemo(() => getQueryKey(search, activeFilter, activeSort), [search, activeFilter, activeSort]);

    const getProductStatus = (product: Product) => {
        if (product.status) return product.status;
        if (product.stock <= 0) return "Habis";
        if (product.statusDate) {
            const statusDate = new Date(product.statusDate);
            if (!Number.isNaN(statusDate.getTime()) && statusDate.getTime() < Date.now()) {
                return "Expired";
            }
        }
        return "Aktif";
    };

    const sellableProducts = useMemo(
        () => products.filter((product) => getProductStatus(product) === "Aktif" && product.stock > 0),
        [products]
    );

    const getDropdownStyle = (
        ref: RefObject<HTMLButtonElement | null>,
        width = 200,
        align: "left" | "right" = "left"
    ): CSSProperties => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return { position: "fixed", top: 0, left: 0, width, visibility: "hidden" };

        const top = rect.bottom + 8;
        const style: CSSProperties = {
            position: "fixed",
            top,
            width,
            zIndex: 220,
        };

        if (align === "right") {
            style.left = Math.max(12, rect.right - width);
        } else {
            style.left = Math.max(12, rect.left);
        }

        return style;
    };

    const fetchProductsPage = useCallback(async (pageToLoad: number, replace: boolean, version: number, silent = false) => {
        if (!replace && !silent) setLoadingMore(true);
        if (replace && !silent) setLoading(true);

        try {
            const sessionUser = getSessionUser();
            const tenant = getTenantContext(sessionUser);
            if (!tenant) {
                setProducts([]);
                setHasMore(false);
                return;
            }
            const q = new URLSearchParams();
            if (search.trim()) q.append("search", search.trim());
            if (activeFilter !== "Semua") q.append("type", activeFilter);
            q.append("tenantId", tenant.tenantId);
            if (sessionUser?.name) q.append("tenantName", sessionUser.name);
            q.append("sort", SORT_PARAM_MAP[activeSort] || "name_asc");
            q.append("page", String(pageToLoad));
            q.append("perPage", String(PAGE_SIZE));

            const res = await fetch(`/api/products?${q.toString()}`);
            if (!res.ok) return;
            const data = (await res.json()) as PaginatedProductsResponse;

            if (version !== queryVersionRef.current || activeQueryRef.current !== queryKey) {
                return;
            }

            setProducts((prev) => (replace ? data.items : [...prev, ...data.items]));
            setHasMore(data.hasMore);
            nextPageRef.current = data.page + 1;

            const currentEntry = cacheRef.current.get(queryKey) || { pages: [], total: 0, hasMore: true, updatedAt: 0 };
            const nextPages = replace
                ? [data.items]
                : [...currentEntry.pages, data.items];

            cacheRef.current.set(queryKey, {
                pages: nextPages,
                total: data.total,
                hasMore: data.hasMore,
                updatedAt: Date.now(),
            });
        } catch (err) {
            console.error(err);
        } finally {
            if (version === queryVersionRef.current && !silent) {
                setLoading(false);
                setLoadingMore(false);
            }
        }
    }, [activeFilter, activeSort, queryKey, search]);

    useEffect(() => {
        persistedPosUiState = {
            activeFilter,
            activeSort,
            search,
            viewMode,
        };
    }, [activeFilter, activeSort, search, viewMode]);

    useEffect(() => {
        const user = getSessionUser();
        if (user?.name) setStoreName(user.name);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            queryVersionRef.current += 1;
            const currentVersion = queryVersionRef.current;
            activeQueryRef.current = queryKey;

            const cache = cacheRef.current.get(queryKey);
            if (cache) {
                setProducts(cache.pages.flat());
                setHasMore(cache.hasMore);
                nextPageRef.current = cache.pages.length + 1;
                setLoading(false);
                const isStale = Date.now() - cache.updatedAt > CACHE_STALE_MS;
                if (isStale) {
                    fetchProductsPage(1, true, currentVersion, true);
                }
                return;
            }

            setProducts([]);
            setHasMore(true);
            nextPageRef.current = 1;
            fetchProductsPage(1, true, currentVersion);
        }, 300);

        return () => clearTimeout(timer);
    }, [fetchProductsPage, queryKey]);

    useEffect(() => {
        const target = sentinelRef.current;
        if (!target) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const first = entries[0];
                if (!first?.isIntersecting) return;
                if (loading || loadingMore || !hasMore) return;
                fetchProductsPage(nextPageRef.current, false, queryVersionRef.current);
            },
            { rootMargin: "120px" }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [fetchProductsPage, loading, loadingMore, hasMore]);

    useEffect(() => {
        const handleProductsUpdated = () => {
            cacheRef.current.delete(queryKey);
            queryVersionRef.current += 1;
            const currentVersion = queryVersionRef.current;
            activeQueryRef.current = queryKey;
            nextPageRef.current = 1;
            fetchProductsPage(1, true, currentVersion);
        };

        window.addEventListener("products:updated", handleProductsUpdated);
        return () => window.removeEventListener("products:updated", handleProductsUpdated);
    }, [fetchProductsPage, queryKey]);

    useEffect(() => {
        const handleLogout = () => {
            cacheRef.current.clear();
            queryCacheStore.clear();
            persistedPosUiState = {
                activeFilter: "Semua",
                activeSort: "Nama: A-Z",
                search: "",
                viewMode: "grid",
            };
            setCart([]);
            setSearch("");
            setActiveFilter("Semua");
            setActiveSort("Nama: A-Z");
        };

        window.addEventListener("auth:logout", handleLogout);
        return () => window.removeEventListener("auth:logout", handleLogout);
    }, [cacheRef]);

    const addToCart = (product: Product) => {
        setCart((prev) => {
            const exists = prev.find((item) => item.id === product.id);
            const currentQty = exists?.quantity || 0;
            if (currentQty >= product.stock) {
                alert("Stok produk tidak mencukupi.");
                return prev;
            }
            if (exists) {
                return prev.map((item) =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };

    const updateQuantity = (id: string, delta: number) => {
        setCart((prev) =>
            prev
                .map((item) => {
                    if (item.id === id) {
                        const availableStock = products.find((product) => product.id === id)?.stock ?? item.stock;
                        const maxQty = Math.max(0, availableStock);
                        const newQuantity = Math.max(0, Math.min(maxQty, item.quantity + delta));
                        return { ...item, quantity: newQuantity };
                    }
                    return item;
                })
                .filter((item) => item.quantity > 0)
        );
    };

    const getCartQuantity = (id: string) => cart.find((item) => item.id === id)?.quantity || 0;

    const applyStockUpdates = useCallback((updates: Array<{ id: string; stock: number }>) => {
        if (updates.length === 0) return;

        const stockMap = new Map(updates.map((item) => [item.id, item.stock]));

        setProducts((prev) =>
            prev.map((product) => {
                const nextStock = stockMap.get(product.id);
                return typeof nextStock === "number" ? { ...product, stock: nextStock } : product;
            })
        );

        for (const [key, entry] of cacheRef.current.entries()) {
            cacheRef.current.set(key, {
                ...entry,
                pages: entry.pages.map((page) =>
                    page.map((product) => {
                        const nextStock = stockMap.get(product.id);
                        return typeof nextStock === "number" ? { ...product, stock: nextStock } : product;
                    })
                ),
                updatedAt: Date.now(),
            });
        }
    }, []);

    const clearCart = () => setCart([]);
    const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const cashPaidNumber = Number(cashPaid || 0);
    const changeAmount = Math.max(0, cashPaidNumber - totalAmount);
    const isCashEnough = cashPaidNumber >= totalAmount;
    const addCashAmount = (amount: number) => {
        const current = Number(cashPaid || 0);
        const next = Math.max(0, current + amount);
        setCashPaid(String(next));
    };

    const closeCartModal = () => {
        setIsCartOpen(false);
        setCheckoutStep("cart");
        setPaymentMethod("cash");
        setCashPaid("");
    };

    const processPayment = async () => {
        if (paymentMethod === "cash" && !isCashEnough) {
            alert("Uang tunai belum mencukupi.");
            return;
        }
        if (cart.length === 0) {
            alert("Keranjang masih kosong.");
            return;
        }

        try {
            setProcessingPayment(true);
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    items: cart.map((item) => ({ id: item.id, quantity: item.quantity })),
                }),
            });

            const data = (await res.json()) as CheckoutResponse;
            if (!res.ok || !data.success) {
                alert(data.error || "Pembayaran gagal diproses.");
                return;
            }

            const sessionUser = getSessionUser();
            addSalesHistory({
                merchantName: sessionUser?.name || storeName,
                merchantEmail: sessionUser?.email || undefined,
                channel: "pos",
                itemsCount: cart.reduce((sum, item) => sum + item.quantity, 0),
                totalAmount,
                items: cart.map((item) => ({
                    productId: item.id,
                    productName: item.name,
                    quantity: item.quantity,
                    price: item.price,
                })),
            });

            applyStockUpdates(data.updatedProducts || []);
            alert(`Pembayaran ${paymentMethod === "cash" ? "tunai" : "online"} berhasil.`);
            clearCart();
            closeCartModal();
        } catch (error) {
            console.error(error);
            alert("Pembayaran gagal diproses.");
        } finally {
            setProcessingPayment(false);
        }
    };

    return (
        <div className={styles.posContainer}>
            <header className={styles.header}>
                <h1 className={styles.title}>{storeName}</h1>
                <button
                    className={styles.cartBtn}
                    aria-label="Cart"
                    onClick={() => {
                        setIsCartOpen(true);
                        setCheckoutStep("cart");
                    }}
                >
                    <ShoppingCart size={20} />
                    {totalCartItems > 0 && <span className={styles.cartBadge}>{totalCartItems}</span>}
                </button>
            </header>

            <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} size={18} />
                <input
                    type="text"
                    placeholder="Cari produk, toko atau lokasi..."
                    className={styles.searchInput}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className={styles.filtersWrapper}>
                <div className={`${styles.dropdownContainer} ${isCategoryMenuOpen ? styles.dropdownOpen : ""}`}>
                    <button
                        ref={categoryBtnRef}
                        className={`${styles.filterChip} ${activeFilter !== "Semua" ? styles.filterActive : ""}`}
                        onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                    >
                        <Filter size={16} strokeWidth={1.5} />
                        <span>{activeFilter}</span>
                    </button>
                    {isCategoryMenuOpen && (
                        <>
                            <div className={styles.dropdownMenu} style={getDropdownStyle(categoryBtnRef)}>
                                <div className={styles.dropdownHeader}>KATEGORI</div>
                                {["Semua", "Fisik", "Digital", "Jasa", "Acara"].map((cat) => (
                                    <div
                                        key={cat}
                                        className={`${styles.dropdownItem} ${activeFilter === cat ? styles.dropdownItemActive : ""}`}
                                        onClick={() => {
                                            setActiveFilter(cat);
                                            setIsCategoryMenuOpen(false);
                                        }}
                                    >
                                        <span>{cat}</span>
                                        {activeFilter === cat && <div className={styles.activeIndicator} />}
                                    </div>
                                ))}
                            </div>
                            <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setIsCategoryMenuOpen(false)} />
                        </>
                    )}
                </div>

                <div className={`${styles.dropdownContainer} ${isLocationMenuOpen ? styles.dropdownOpen : ""}`}>
                    <button
                        ref={locationBtnRef}
                        className={`${styles.filterChip} ${activeLocation !== "Semua Lokasi" ? styles.filterActive : ""}`}
                        onClick={() => {
                            setIsLocationMenuOpen(!isLocationMenuOpen);
                            setLocationSearch("");
                        }}
                    >
                        <MapPin size={16} strokeWidth={1.5} />
                        <span>{activeLocation}</span>
                    </button>
                    {isLocationMenuOpen && (
                        <>
                            <div className={styles.dropdownMenu} style={getDropdownStyle(locationBtnRef)}>
                                <div className={styles.dropdownHeader}>LOKASI</div>
                                <div className={styles.dropdownSearchWrap}>
                                    <input
                                        className={styles.dropdownSearchInput}
                                        placeholder="Cari lokasi..."
                                        value={locationSearch}
                                        onChange={(e) => setLocationSearch(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                {filteredLocations.length > 0 ? (
                                    filteredLocations.map((loc) => (
                                        <div
                                            key={loc}
                                            className={`${styles.dropdownItem} ${activeLocation === loc ? styles.dropdownItemActive : ""}`}
                                            onClick={() => {
                                                setActiveLocation(loc);
                                                setIsLocationMenuOpen(false);
                                            }}
                                        >
                                            <span>{loc}</span>
                                            {activeLocation === loc && <div className={styles.activeIndicator} />}
                                        </div>
                                    ))
                                ) : (
                                    <div className={styles.dropdownEmpty}>Data tidak ditemukan</div>
                                )}
                            </div>
                            <div
                                style={{ position: "fixed", inset: 0, zIndex: 200 }}
                                onClick={() => {
                                    setIsLocationMenuOpen(false);
                                    setLocationSearch("");
                                }}
                            />
                        </>
                    )}
                </div>

                <div className={`${styles.dropdownContainer} ${isSortMenuOpen ? styles.dropdownOpen : ""}`}>
                    <button
                        ref={sortBtnRef}
                        className={`${styles.filterChip} ${styles.filterSort}`}
                        onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                    >
                        <ArrowUpDown size={16} strokeWidth={1.5} />
                        <span>{activeSort}</span>
                    </button>
                    {isSortMenuOpen && (
                        <>
                            <div className={styles.dropdownMenu} style={getDropdownStyle(sortBtnRef, 220, "right")}>
                                <div className={styles.dropdownHeader}>URUTKAN</div>
                                {["Terbaru", "Terlama", "Harga: Rendah ke Tinggi", "Harga: Tinggi ke Rendah", "Nama: A-Z", "Nama: Z-A"].map((sort) => (
                                    <div
                                        key={sort}
                                        className={`${styles.dropdownItem} ${activeSort === sort ? styles.dropdownItemActive : ""}`}
                                        onClick={() => {
                                            setActiveSort(sort);
                                            setIsSortMenuOpen(false);
                                        }}
                                    >
                                        <span>{sort}</span>
                                        {activeSort === sort && <div className={styles.activeIndicator} />}
                                    </div>
                                ))}
                            </div>
                            <div style={{ position: "fixed", inset: 0, zIndex: 200 }} onClick={() => setIsSortMenuOpen(false)} />
                        </>
                    )}
                </div>
            </div>

            <div className={styles.catalogArea}>
                <div className={styles.catalogHeader}>
                    <p className={styles.productCount}>{sellableProducts.length} Produk Aktif</p>
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.viewBtn} ${viewMode === "grid" ? styles.viewBtnActive : ""}`}
                            onClick={() => setViewMode("grid")}
                            aria-label="Tampilan grid"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            className={`${styles.viewBtn} ${viewMode === "list" ? styles.viewBtnActive : ""}`}
                            onClick={() => setViewMode("list")}
                            aria-label="Tampilan list"
                        >
                            <List size={16} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className={styles.emptyState}>
                        <p>Memuat produk...</p>
                    </div>
                ) : sellableProducts.length > 0 ? (
                    <>
                        <div className={`${styles.productGrid} ${viewMode === "list" ? styles.productList : ""}`}>
                            {sellableProducts.map((p) => (
                                <div key={p.id} className={`${styles.productCard} ${viewMode === "list" ? styles.productCardList : ""}`}>
                                    {p.imageUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={p.imageUrl} alt={p.name} className={styles.productImageThumb} />
                                    ) : (
                                        <div className={styles.productImagePlaceholder}>
                                            {p.type === "Fisik" ? "BX" : p.type === "Digital" ? "DG" : "SV"}
                                        </div>
                                    )}
                                    <div className={styles.productInfo}>
                                        <h3 className={styles.productName}>{p.name}</h3>
                                        <p className={styles.productPrice}>Rp {p.price.toLocaleString("id-ID")}</p>
                                        <p className={styles.productStock}>Stok sekarang: {p.stock}</p>
                                    </div>
                                    {getCartQuantity(p.id) > 0 ? (
                                        <div className={styles.cardQtyControls}>
                                            <button className={styles.cardQtyBtn} onClick={() => updateQuantity(p.id, -1)}>-</button>
                                            <span className={styles.cardQtyText}>{getCartQuantity(p.id)}</span>
                                            <button className={styles.cardQtyBtn} onClick={() => addToCart(p)}>+</button>
                                        </div>
                                    ) : (
                                        <button className={gridStyles.addCartBtn} onClick={() => addToCart(p)}>+</button>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div ref={sentinelRef} className={styles.loadSentinel}>
                            {loadingMore ? "Memuat produk berikutnya..." : hasMore ? "Scroll untuk memuat lagi" : "Semua produk sudah tampil"}
                        </div>
                    </>
                ) : (
                    <div className={styles.emptyState}>
                        <PackageOpen size={48} className={styles.emptyIcon} strokeWidth={1.5} />
                        <p>Tidak ada produk di katalog ini.</p>
                    </div>
                )}
            </div>

            {totalCartItems > 0 && (
                <div className={styles.bottomCheckoutBar}>
                    <div className={styles.bottomCheckoutInfo}>
                        <p>{totalCartItems} Item</p>
                        <h3>Rp {totalAmount.toLocaleString("id-ID")}</h3>
                    </div>
                    <button
                        className={styles.bottomCheckoutBtn}
                        onClick={() => {
                            setIsCartOpen(true);
                            setCheckoutStep("cart");
                        }}
                    >
                        Lanjut
                    </button>
                </div>
            )}

            {isCartOpen && (
                <div className={cartStyles.cartOverlay} onClick={closeCartModal}>
                    <div className={cartStyles.cartModal} onClick={(e) => e.stopPropagation()}>
                        <div className={cartStyles.cartHeader}>
                            <div className={cartStyles.cartHeaderLeft}>
                                <div className={cartStyles.cartIconWrapper}>
                                    {checkoutStep === "payment" ? <CreditCard size={18} strokeWidth={2} /> : <ShoppingBag size={18} strokeWidth={2} />}
                                </div>
                                <h3 className={cartStyles.cartTitleText}>{checkoutStep === "payment" ? "Pembayaran" : "Keranjang Anda"}</h3>
                                {checkoutStep === "cart" && <span className={cartStyles.cartCountTag}>{cart.length} produk</span>}
                            </div>
                            <button className={cartStyles.closeCartBtn} onClick={closeCartModal}>
                                x
                            </button>
                        </div>

                        <div className={cartStyles.cartBody}>
                            {cart.length === 0 ? (
                                <div className={cartStyles.emptyCartBox}>
                                    <div className={cartStyles.emptyBagIcon}>
                                        <ShoppingBag size={48} strokeWidth={1.5} />
                                    </div>
                                    <p className={cartStyles.emptyCartText}>Keranjang Anda kosong</p>
                                    <button className={cartStyles.startShoppingBtn} onClick={closeCartModal}>
                                        Mulai Belanja
                                    </button>
                                </div>
                            ) : checkoutStep === "payment" ? (
                                <div className={cartStyles.paymentPanel}>
                                    <p className={cartStyles.paymentLabel}>Pilih Metode Pembayaran</p>
                                    <div className={cartStyles.paymentMethodRow}>
                                        <button
                                            className={`${cartStyles.methodBtn} ${paymentMethod === "cash" ? cartStyles.methodBtnActive : ""}`}
                                            onClick={() => setPaymentMethod("cash")}
                                        >
                                            <Wallet size={16} />
                                            Tunai
                                        </button>
                                        <button
                                            className={`${cartStyles.methodBtn} ${paymentMethod === "online" ? cartStyles.methodBtnActive : ""}`}
                                            onClick={() => setPaymentMethod("online")}
                                        >
                                            <CreditCard size={16} />
                                            Online
                                        </button>
                                    </div>

                                    {paymentMethod === "cash" ? (
                                        <div className={cartStyles.cashForm}>
                                            <label>Nominal Dibayar</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={cashPaid}
                                                onChange={(e) => setCashPaid(e.target.value)}
                                                placeholder={`Minimal Rp ${totalAmount.toLocaleString("id-ID")}`}
                                            />
                                            <div className={cartStyles.quickCashRow}>
                                                {CASH_SUGGESTIONS.map((amount) => (
                                                    <button
                                                        key={amount}
                                                        type="button"
                                                        className={cartStyles.quickCashBtn}
                                                        onClick={() => addCashAmount(amount)}
                                                    >
                                                        +{amount >= 1000 ? `${amount / 1000}rb` : amount}
                                                    </button>
                                                ))}
                                                <button
                                                    type="button"
                                                    className={`${cartStyles.quickCashBtn} ${cartStyles.quickCashBtnPrimary}`}
                                                    onClick={() => setCashPaid(String(totalAmount))}
                                                >
                                                    Uang Pas
                                                </button>
                                            </div>
                                            <div className={cartStyles.paymentInfoRow}>
                                                <span>Total</span>
                                                <strong>Rp {totalAmount.toLocaleString("id-ID")}</strong>
                                            </div>
                                            <div className={cartStyles.paymentInfoRow}>
                                                <span>Kembalian</span>
                                                <strong>Rp {changeAmount.toLocaleString("id-ID")}</strong>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={cartStyles.onlineBox}>
                                            <p>Pembayaran online akan diproses via QRIS/Transfer.</p>
                                        </div>
                                    )}

                                    <div className={cartStyles.paymentActions}>
                                        <button className={cartStyles.backBtn} onClick={() => setCheckoutStep("cart")}>
                                            <ArrowLeft size={15} />
                                            Kembali
                                        </button>
                                        <button className={cartStyles.payBtn} onClick={processPayment} disabled={processingPayment}>
                                            {processingPayment
                                                ? "Memproses..."
                                                : `Bayar ${paymentMethod === "cash" ? "Tunai" : "Online"}`}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className={cartStyles.cartList}>
                                    {cart.map((item) => (
                                        <div key={item.id} className={cartStyles.cartItem}>
                                            <div className={cartStyles.cartItemInfo}>
                                                <h4>{item.name}</h4>
                                                <p>Rp {item.price.toLocaleString("id-ID")}</p>
                                            </div>
                                            <div className={cartStyles.cartItemControls}>
                                                <button className={cartStyles.qtyBtn} onClick={() => updateQuantity(item.id, -1)}>-</button>
                                                <span className={cartStyles.qtyText}>{item.quantity}</span>
                                                <button className={cartStyles.qtyBtn} onClick={() => updateQuantity(item.id, 1)}>+</button>
                                            </div>
                                        </div>
                                    ))}

                                    <div style={{ marginTop: "auto" }}>
                                        <div className={cartStyles.cartSummary}>
                                            <div className={cartStyles.cartTotalLabel}>
                                                <p>Total Pembayaran</p>
                                                <h2>Rp {totalAmount.toLocaleString("id-ID")}</h2>
                                            </div>
                                            <button className={cartStyles.checkoutBtn} onClick={() => setCheckoutStep("payment")}>
                                                Checkout
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
