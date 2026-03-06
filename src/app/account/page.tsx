"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldAlert, UserCircle } from "lucide-react";
import { clearSessionUser, getPurchaseHistory, getSalesHistory, getSessionUser, SessionUser } from "@/lib/local-auth";
import styles from "./page.module.css";

export default function AccountPage() {
    const router = useRouter();
    const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => getSessionUser());
    const purchaseHistory = useMemo(
        () => (sessionUser ? getPurchaseHistory(sessionUser.email) : []),
        [sessionUser]
    );
    const salesHistory = useMemo(
        () => (sessionUser ? getSalesHistory({ email: sessionUser.email, name: sessionUser.name }) : []),
        [sessionUser]
    );

    const handleLogout = () => {
        clearSessionUser();
        setSessionUser(null);
        router.push("/");
    };

    if (!sessionUser) {
        return (
            <div className={styles.container}>
                <h1 className={styles.title}>Akun Saya</h1>
                <div className={styles.emptyCard}>
                    <ShieldAlert size={44} strokeWidth={1.6} className={styles.emptyIcon} />
                    <h2>Belum login</h2>
                    <p>Silakan login terlebih dahulu untuk melihat data akun Anda.</p>
                    <button className={styles.primaryBtn} onClick={() => router.push("/")}>
                        Ke Halaman Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1 className={styles.title}>Akun Saya</h1>

            <div className={styles.profileCard}>
                <UserCircle size={72} strokeWidth={1.5} className={styles.avatar} />
                <h2>{sessionUser.name}</h2>
                <p>{sessionUser.email}</p>
                <span className={styles.roleTag}>
                    {sessionUser.role === "merchant" ? "Merchant" : "Customer"}
                </span>
            </div>

            <button className={styles.logoutBtn} onClick={handleLogout}>
                <LogOut size={18} />
                Logout
            </button>

            <div className={styles.historySection}>
                <h3>Report Penjualan</h3>
                {salesHistory.length === 0 ? (
                    <p className={styles.emptyHistory}>Belum ada transaksi.</p>
                ) : (
                    <div className={styles.historyList}>
                        {salesHistory.map((entry) => (
                            <div key={entry.id} className={styles.historyItem}>
                                <p className={styles.historyTitle}>{entry.channel === "pos" ? "Penjualan POS" : "Penjualan Link Publik"}</p>
                                <p>{entry.itemsCount} item</p>
                                <p>Rp {entry.totalAmount.toLocaleString("id-ID")}</p>
                                <p>{new Date(entry.createdAt).toLocaleString("id-ID")}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className={styles.historySection}>
                <h3>Report Pembelian</h3>
                {purchaseHistory.length === 0 ? (
                    <p className={styles.emptyHistory}>Belum ada transaksi.</p>
                ) : (
                    <div className={styles.historyList}>
                        {purchaseHistory.map((entry) => (
                            <div key={entry.id} className={styles.historyItem}>
                                <p className={styles.historyTitle}>{entry.productName}</p>
                                <p>{entry.storeName}</p>
                                <p>{entry.quantity} x item</p>
                                <p>Rp {entry.totalAmount.toLocaleString("id-ID")}</p>
                                <p>{new Date(entry.createdAt).toLocaleString("id-ID")}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
