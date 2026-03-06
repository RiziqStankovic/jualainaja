"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import styles from "./AddProductButton.module.css";
import type { ProductStatus } from "@/lib/product-meta";
import { getSessionUser, getTenantContext } from "@/lib/local-auth";

export default function AddProductButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        price: "",
        stock: "",
        type: "Fisik",
        status: "Aktif" as ProductStatus,
        statusDate: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
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
                    ...formData,
                    statusDate: formData.statusDate || null,
                    tenantName: sessionUser?.name || undefined,
                    tenantEmail: sessionUser?.email || undefined,
                    tenantId: tenant.tenantId,
                }),
            });
            if (res.ok) {
                setIsOpen(false);
                setFormData({ name: "", price: "", stock: "", type: "Fisik", status: "Aktif", statusDate: "" });
                alert("Produk berhasil ditambahkan!");
                window.dispatchEvent(new Event("products:updated"));
            } else {
                alert("Gagal menambahkan produk.");
            }
        } catch (err) {
            console.error(err);
            alert("Terjadi kesalahan.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className={styles.addButtonWrapper}>
                <button
                    className={styles.addButton}
                    aria-label="Add Product"
                    onClick={() => setIsOpen(true)}
                >
                    <Plus size={28} strokeWidth={3} />
                </button>
            </div>

            {isOpen && (
                <div className={styles.modalOverlay} onClick={() => setIsOpen(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>Tambah Produk Baru</h3>
                            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>x</button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label>Nama Produk</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Contoh: Kopi Susu Aren"
                                />
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Harga (Rp)</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: e.target.value })}
                                        placeholder="15000"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Stok</label>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        value={formData.stock}
                                        onChange={e => setFormData({ ...formData, stock: e.target.value })}
                                        placeholder="50"
                                    />
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label>Tipe Produk</label>
                                <select
                                    value={formData.type}
                                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                                >
                                    <option value="Fisik">Barang Fisik</option>
                                    <option value="Digital">Produk Digital</option>
                                    <option value="Jasa">Layanan / Jasa</option>
                                    <option value="Acara">Tiket Acara</option>
                                </select>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value as ProductStatus })}
                                    >
                                        <option value="Aktif">Aktif</option>
                                        <option value="Habis">Habis</option>
                                        <option value="Hold">Hold</option>
                                        <option value="Expired">Expired</option>
                                        <option value="Tidak Aktif">Tidak Aktif</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Tanggal Status</label>
                                    <input
                                        type="date"
                                        value={formData.statusDate}
                                        onChange={e => setFormData({ ...formData, statusDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <button type="submit" className={styles.submitBtn} disabled={loading}>
                                {loading ? "Menyimpan..." : "Simpan Produk"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
