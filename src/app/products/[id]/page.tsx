"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import styles from "./page.module.css";
import type { ProductStatus } from "@/lib/product-meta";

type ProductDetail = {
    id: string;
    name: string;
    price: number;
    stock: number;
    type: string;
    status?: ProductStatus | null;
    statusDate?: string | null;
    imageUrl?: string | null;
    description?: string | null;
    storeSlug?: string;
    productSlug?: string;
    isPublic?: boolean;
};

const STATUS_OPTIONS: ProductStatus[] = ["Aktif", "Habis", "Hold", "Expired", "Tidak Aktif"];

function toDateInputValue(value?: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export default function ProductDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [form, setForm] = useState({
        name: "",
        price: "",
        stock: "",
        type: "Fisik",
        status: "Aktif" as ProductStatus,
        statusDate: "",
        imageUrl: "",
        description: "",
        storeSlug: "",
        productSlug: "",
        isPublic: true,
    });

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const res = await fetch(`/api/products/${params.id}`);
                if (!res.ok) throw new Error("Produk tidak ditemukan");
                const data = (await res.json()) as ProductDetail;
                setForm({
                    name: data.name || "",
                    price: String(data.price ?? ""),
                    stock: String(data.stock ?? ""),
                    type: data.type || "Fisik",
                    status: data.status || "Aktif",
                    statusDate: toDateInputValue(data.statusDate),
                    imageUrl: data.imageUrl || "",
                    description: data.description || "",
                    storeSlug: data.storeSlug || "",
                    productSlug: data.productSlug || "",
                    isPublic: data.isPublic ?? true,
                });
            } catch (error) {
                console.error(error);
                alert("Gagal memuat detail produk.");
                router.push("/products");
            } finally {
                setLoading(false);
            }
        };

        if (params.id) {
            fetchDetail();
        }
    }, [params.id, router]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            const res = await fetch(`/api/products/${params.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    price: Number(form.price),
                    stock: Number(form.stock),
                    type: form.type,
                    status: form.status,
                    statusDate: form.statusDate || null,
                    imageUrl: form.imageUrl || null,
                    description: form.description,
                    isPublic: form.isPublic,
                }),
            });

            if (!res.ok) throw new Error("Gagal menyimpan perubahan");
            alert("Produk berhasil diperbarui.");
            router.push("/products");
        } catch (error) {
            console.error(error);
            alert("Gagal menyimpan perubahan.");
        } finally {
            setSaving(false);
        }
    };

    const publicLink =
        typeof window !== "undefined"
            ? `${window.location.origin}/${form.storeSlug || "toko"}/${form.productSlug || params.id}`
            : "";

    if (loading) {
        return <div className={styles.container}><p className={styles.loading}>Memuat detail produk...</p></div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={() => router.push("/products")}>Kembali</button>
                <h1>Detail Produk</h1>
            </div>

            <div className={styles.previewWrap}>
                {form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.imageUrl} alt={form.name || "Preview produk"} className={styles.previewImage} />
                ) : (
                    <div className={styles.previewFallback}>Preview Gambar Produk</div>
                )}
            </div>

            <div className={styles.linkRow}>
                <a href={publicLink} target="_blank" rel="noreferrer">Open Link Publik</a>
                <button
                    type="button"
                    onClick={async () => {
                        if (!publicLink) return;
                        await navigator.clipboard.writeText(publicLink);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1200);
                    }}
                >
                    {copied ? "Tersalin" : "Copy Link"}
                </button>
            </div>

            <form className={styles.form} onSubmit={handleSave}>
                <label>
                    Nama Produk
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        required
                    />
                </label>

                <div className={styles.row}>
                    <label>
                        Harga
                        <input
                            type="number"
                            min="0"
                            value={form.price}
                            onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                            required
                        />
                    </label>
                    <label>
                        Stok
                        <input
                            type="number"
                            min="0"
                            value={form.stock}
                            onChange={(e) => setForm((prev) => ({ ...prev, stock: e.target.value }))}
                            required
                        />
                    </label>
                </div>

                <label>
                    Tipe Produk
                    <select
                        value={form.type}
                        onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                    >
                        <option value="Fisik">Barang Fisik</option>
                        <option value="Digital">Produk Digital</option>
                        <option value="Jasa">Layanan / Jasa</option>
                        <option value="Acara">Tiket Acara</option>
                    </select>
                </label>

                <label>
                    URL Gambar
                    <input
                        type="text"
                        value={form.imageUrl}
                        onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
                        placeholder="https://..."
                    />
                </label>

                <label>
                    Deskripsi
                    <textarea
                        value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        rows={4}
                    />
                </label>

                <label className={styles.toggleRow}>
                    Publik (bisa dibeli via link)
                    <input
                        type="checkbox"
                        checked={form.isPublic}
                        onChange={(e) => setForm((prev) => ({ ...prev, isPublic: e.target.checked }))}
                    />
                </label>

                <div className={styles.row}>
                    <label>
                        Status
                        <select
                            value={form.status}
                            onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as ProductStatus }))}
                        >
                            {STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>{status}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        Tanggal Status
                        <input
                            type="date"
                            value={form.statusDate}
                            onChange={(e) => setForm((prev) => ({ ...prev, statusDate: e.target.value }))}
                        />
                    </label>
                </div>

                <button type="submit" className={styles.saveBtn} disabled={saving}>
                    {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
            </form>
        </div>
    );
}
