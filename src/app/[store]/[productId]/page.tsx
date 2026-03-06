"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import styles from "./page.module.css";
import { addPurchaseHistory, addSalesHistory, getSessionUser } from "@/lib/local-auth";
import type { ProductStatus } from "@/lib/product-meta";

type PublicProduct = {
    id: string;
    name: string;
    price: number;
    stock: number;
    type: string;
    imageUrl?: string | null;
    description?: string | null;
    storeName: string;
    status?: ProductStatus | null;
    statusDate?: string | null;
    isPublic?: boolean;
    recommendations?: Array<{
        id: string;
        name: string;
        price: number;
        imageUrl?: string | null;
        stock: number;
        productSlug: string;
    }>;
};

export default function PublicProductPage() {
    const params = useParams<{ store: string; productId: string }>();
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState(false);
    const [qty, setQty] = useState(1);
    const [product, setProduct] = useState<PublicProduct | null>(null);
    const [guestEmail, setGuestEmail] = useState("");
    const [guestPhone, setGuestPhone] = useState("");

    const sessionUser = getSessionUser();

    useEffect(() => {
        const run = async () => {
            try {
                const res = await fetch(`/api/public/products/${params.productId}?store=${params.store}`);
                if (!res.ok) throw new Error("not-found");
                const data = (await res.json()) as PublicProduct;
                setProduct(data);
            } catch {
                setProduct(null);
            } finally {
                setLoading(false);
            }
        };
        run();
    }, [params.productId, params.store]);

    const total = useMemo(() => (product ? product.price * qty : 0), [product, qty]);
    const currentStatus = useMemo<ProductStatus>(() => {
        if (!product) return "Tidak Aktif";
        if (product.status) return product.status;
        if (product.stock <= 0) return "Habis";
        if (product.statusDate) {
            const date = new Date(product.statusDate);
            if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) return "Expired";
        }
        return "Aktif";
    }, [product]);
    const isSellable = currentStatus === "Aktif" && (product?.stock || 0) > 0;

    const buyNow = async () => {
        if (!product) return;

        const customerEmail = sessionUser?.email || guestEmail.trim().toLowerCase();
        const customerName = sessionUser?.name || guestEmail.trim().split("@")[0] || "Pelanggan";
        const customerPhone = guestPhone.trim();

        if (!sessionUser && (!customerEmail || !customerPhone)) {
            alert("Isi email dan no. telepon dulu, atau login/register.");
            return;
        }

        try {
            setBuying(true);
            const res = await fetch("/api/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: [{ id: product.id, quantity: qty }] }),
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data?.error || "Gagal checkout.");
                return;
            }

            addPurchaseHistory({
                customerName,
                customerEmail,
                customerPhone,
                storeName: product.storeName,
                productId: product.id,
                productName: product.name,
                quantity: qty,
                totalAmount: total,
            });

            addSalesHistory({
                merchantName: product.storeName,
                merchantEmail: undefined,
                channel: "public",
                itemsCount: qty,
                totalAmount: total,
                items: [
                    {
                        productId: product.id,
                        productName: product.name,
                        quantity: qty,
                        price: product.price,
                    },
                ],
            });

            alert("Pesanan berhasil dibuat dan masuk ke history akun.");
            setProduct((prev) => (prev ? { ...prev, stock: Math.max(0, prev.stock - qty) } : prev));
            setQty(1);
        } catch {
            alert("Gagal checkout.");
        } finally {
            setBuying(false);
        }
    };

    if (loading) return <div className={styles.container}><p>Memuat produk...</p></div>;
    if (!product) return <div className={styles.container}><p>Produk tidak ditemukan.</p></div>;

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <p className={styles.store}>{product.storeName}</p>
                <div className={styles.imageWrap}>
                    {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.name} className={styles.image} />
                    ) : (
                        <div className={styles.placeholder}>{product.type}</div>
                    )}
                </div>
                <h1>{product.name}</h1>
                <p className={styles.price}>Rp {product.price.toLocaleString("id-ID")}</p>
                <div className={styles.statusRow}>
                    <span className={`${styles.statusBadge} ${styles[`status${currentStatus.replace(/\s+/g, "")}`]}`}>
                        {currentStatus}
                    </span>
                    <p className={styles.stock}>Stok tersedia: {product.stock}</p>
                </div>
                {product.description ? <p className={styles.desc}>{product.description}</p> : null}

                {!sessionUser && (
                    <div className={styles.guestBox}>
                        <p>Belum login? Isi data cepat atau login/register.</p>
                        <input
                            type="email"
                            placeholder="Email"
                            value={guestEmail}
                            onChange={(e) => setGuestEmail(e.target.value)}
                        />
                        <input
                            type="tel"
                            placeholder="No. Telepon"
                            value={guestPhone}
                            onChange={(e) => setGuestPhone(e.target.value)}
                        />
                        <div className={styles.authActions}>
                            <Link href={`/?redirect=${encodeURIComponent(`/${params.store}/${params.productId}`)}`}>Login</Link>
                            <Link href={`/?redirect=${encodeURIComponent(`/${params.store}/${params.productId}`)}&mode=register`}>Register</Link>
                        </div>
                    </div>
                )}

                <div className={styles.qtyRow}>
                    <button disabled={!isSellable} onClick={() => setQty((prev) => Math.max(1, prev - 1))}>-</button>
                    <span>{qty}</span>
                    <button disabled={!isSellable} onClick={() => setQty((prev) => Math.min(product.stock || 1, prev + 1))}>+</button>
                </div>

                <button className={styles.buyBtn} onClick={buyNow} disabled={buying || !isSellable}>
                    {buying
                        ? "Memproses..."
                        : isSellable
                            ? `Beli Sekarang - Rp ${total.toLocaleString("id-ID")}`
                            : `Tidak Bisa Dibeli (${currentStatus})`}
                </button>
            </div>

            {product.recommendations && product.recommendations.length > 0 && (
                <div className={styles.recoSection}>
                    <h3>Rekomendasi Dari Toko Ini</h3>
                    <div className={styles.recoList}>
                        {product.recommendations.map((item) => (
                            <Link key={item.id} href={`/${params.store}/${item.productSlug}`} className={styles.recoItem}>
                                {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl} alt={item.name} className={styles.recoImage} />
                                ) : (
                                    <div className={styles.recoFallback}>PR</div>
                                )}
                                <div>
                                    <p className={styles.recoName}>{item.name}</p>
                                    <p className={styles.recoPrice}>Rp {item.price.toLocaleString("id-ID")}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
