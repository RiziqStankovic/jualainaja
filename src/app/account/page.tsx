"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bluetooth, LogOut, ShieldAlert, UserCircle } from "lucide-react";
import { clearSessionUser, getPurchaseHistory, getSalesHistory, getSessionUser, SessionUser } from "@/lib/local-auth";
import styles from "./page.module.css";

type BluetoothStatus = {
    supported: boolean;
    enabled: boolean;
    lastDeviceAddress?: string;
    connected: boolean;
};

type PairedDevice = {
    name: string;
    address: string;
};

type AndroidResult<T = unknown> = {
    success: boolean;
    code?: string;
    message?: string;
    devices?: T;
} & Record<string, unknown>;

type AndroidBridge = Record<string, (...args: unknown[]) => string>;

declare global {
    interface Window {
        Android?: AndroidBridge;
    }
}

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

    // ---- State Bluetooth (untuk wrapper Android) ----
    const [hasAndroidBridge, setHasAndroidBridge] = useState(false);
    const [btStatus, setBtStatus] = useState<BluetoothStatus | null>(null);
    const [btDevices, setBtDevices] = useState<PairedDevice[]>([]);
    const [btConnectingAddress, setBtConnectingAddress] = useState<string | null>(null);
    const [btRefreshing, setBtRefreshing] = useState(false);
    const [btError, setBtError] = useState<string | null>(null);
    const [btInfo, setBtInfo] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const hasBridge = typeof window.Android !== "undefined";
        setHasAndroidBridge(hasBridge);

        if (!hasBridge) return;

        refreshBluetoothStatus();
        refreshPairedDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionUser?.email]);

    const callAndroid = (method: string, ...args: unknown[]): string | null => {
        if (typeof window === "undefined") return null;
        const android = window.Android;
        if (!android || typeof android[method] !== "function") return null;
        try {
            return (android as AndroidBridge)[method](...args);
        } catch {
            return null;
        }
    };

    const refreshBluetoothStatus = () => {
        setBtError(null);
        const raw = callAndroid("getBluetoothStatus");
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as BluetoothStatus;
            setBtStatus(parsed);
        } catch {
            setBtError("Gagal membaca status Bluetooth dari perangkat.");
        }
    };

    const refreshPairedDevices = () => {
        setBtError(null);
        const raw = callAndroid("listPairedDevices");
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as AndroidResult<PairedDevice[]>;
            if (!parsed.success) {
                setBtError(parsed.message ?? "Gagal memuat perangkat tersambung.");
                setBtDevices([]);
                return;
            }
            setBtDevices((parsed.devices as PairedDevice[]) ?? []);
        } catch {
            setBtError("Gagal membaca daftar perangkat dari perangkat Android.");
        }
    };

    const isBtBusy = btRefreshing || btConnectingAddress !== null;

    const handleRefreshAll = () => {
        if (isBtBusy) return;
        setBtRefreshing(true);
        setBtError(null);
        setBtInfo(null);
        try {
            refreshBluetoothStatus();
            refreshPairedDevices();
        } finally {
            setBtRefreshing(false);
        }
    };

    const handleConnectDevice = (address: string) => {
        if (isBtBusy) return;
        setBtConnectingAddress(address);
        setBtError(null);
        setBtInfo(null);
        try {
            const raw = callAndroid("connectToDevice", address);
            if (!raw) {
                setBtError("Tidak dapat menghubungi bridge Android.");
                return;
            }
            const parsed = JSON.parse(raw) as AndroidResult;
            if (!parsed.success) {
                setBtError(parsed.message ?? "Gagal menyambungkan ke perangkat.");
            } else {
                setBtInfo(parsed.message ?? "Berhasil tersambung ke perangkat.");
                refreshBluetoothStatus();
            }
        } catch {
            setBtError("Terjadi kesalahan saat menyambungkan ke perangkat.");
        } finally {
            setBtConnectingAddress(null);
        }
    };

    const handleDisconnect = () => {
        if (isBtBusy) return;
        setBtConnectingAddress("__disconnect__");
        setBtError(null);
        setBtInfo(null);
        try {
            const raw = callAndroid("disconnect");
            if (!raw) {
                setBtError("Tidak dapat menghubungi bridge Android.");
                return;
            }
            const parsed = JSON.parse(raw) as AndroidResult;
            if (!parsed.success) {
                setBtError(parsed.message ?? "Gagal memutus sambungan.");
            } else {
                setBtInfo(parsed.message ?? "Sambungan berhasil diputus.");
                refreshBluetoothStatus();
            }
        } catch {
            setBtError("Terjadi kesalahan saat memutus sambungan.");
        } finally {
            setBtConnectingAddress(null);
        }
    };

    const handleOpenBtSettings = () => {
        setBtError(null);
        setBtInfo(null);
        const raw = callAndroid("openBluetoothSettings");
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as AndroidResult;
            if (!parsed.success) {
                setBtError(parsed.message ?? "Gagal membuka pengaturan Bluetooth.");
            } else if (parsed.message) {
                setBtInfo(parsed.message);
            }
        } catch {
            // abaikan jika hanya gagal parse; pengguna tetap akan melihat halaman pengaturan terbuka
        }
    };

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

            {/* Pengaturan Bluetooth Printer (khusus aplikasi Android) */}
            <div className={styles.btSection}>
                <div className={styles.btHeader}>
                    <div className={styles.btHeaderTitle}>
                        <Bluetooth size={18} />
                        <h3>Pengaturan Bluetooth Printer</h3>
                    </div>
                    {hasAndroidBridge && (
                        <div className={styles.btHeaderActions}>
                            <button
                                type="button"
                                className={styles.btSecondaryBtn}
                                onClick={handleOpenBtSettings}
                                disabled={isBtBusy}
                            >
                                Pengaturan Bluetooth HP
                            </button>
                            <button
                                type="button"
                                className={`${styles.btRefreshBtn} ${btRefreshing ? styles.btNoAnim : ""}`}
                                onClick={handleRefreshAll}
                                disabled={isBtBusy}
                            >
                                {btRefreshing ? "Memuat..." : "Segarkan"}
                            </button>
                        </div>
                    )}
                </div>

                {!hasAndroidBridge ? (
                    <p className={styles.btHint}>
                        Pengaturan ini hanya tersedia ketika aplikasi dijalankan lewat Android wrapper. Jika Anda
                        membuka dari browser biasa, fitur Bluetooth printer tidak aktif.
                    </p>
                ) : (
                    <>
                        {btStatus && (
                            <div className={styles.btStatusRow}>
                                <span
                                    className={`${styles.btBadge} ${
                                        btStatus.supported ? styles.btBadgeOk : styles.btBadgeWarn
                                    }`}
                                >
                                    {btStatus.supported ? "Perangkat mendukung Bluetooth" : "Bluetooth tidak didukung"}
                                </span>
                                <span
                                    className={`${styles.btBadge} ${
                                        btStatus.enabled ? styles.btBadgeOk : styles.btBadgeWarn
                                    }`}
                                >
                                    {btStatus.enabled ? "Bluetooth aktif" : "Bluetooth mati"}
                                </span>
                                <span
                                    className={`${styles.btBadge} ${
                                        btStatus.connected ? styles.btBadgeOk : styles.btBadgeNeutral
                                    }`}
                                >
                                    {btStatus.connected ? "Sudah tersambung" : "Belum tersambung"}
                                </span>
                            </div>
                        )}

                        {btStatus?.connected && (
                            <button
                                type="button"
                                className={`${styles.btSecondaryBtn} ${
                                    btConnectingAddress === "__disconnect__" ? styles.btNoAnim : ""
                                }`}
                                onClick={handleDisconnect}
                                disabled={isBtBusy}
                            >
                                {btConnectingAddress === "__disconnect__" ? "Memutuskan..." : "Putuskan sambungan"}
                            </button>
                        )}

                        {btError && <p className={styles.btError}>{btError}</p>}
                        {btInfo && <p className={styles.btInfo}>{btInfo}</p>}

                        <div className={styles.btDevicesCard}>
                            <p className={styles.btDevicesTitle}>Perangkat yang pernah dipasangkan</p>
                            {btDevices.length === 0 ? (
                                <p className={styles.btDevicesEmpty}>
                                    Belum ada perangkat terpasang. Pastikan printer sudah di-pair di pengaturan
                                    Bluetooth HP Anda.
                                </p>
                            ) : (
                                <ul className={styles.btDevicesList}>
                                    {btDevices.map((device) => {
                                        const isActive =
                                            btStatus?.connected && btStatus.lastDeviceAddress === device.address;
                                        const isConnecting = btConnectingAddress === device.address;
                                        return (
                                            <li key={device.address} className={styles.btDeviceItem}>
                                                <div className={styles.btDeviceInfo}>
                                                    <div className={styles.btDeviceNameRow}>
                                                        <span className={styles.btDeviceName}>{device.name}</span>
                                                        {isActive && (
                                                            <span className={styles.btDeviceActiveBadge}>Aktif</span>
                                                        )}
                                                    </div>
                                                    <span className={styles.btDeviceAddress}>{device.address}</span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={`${styles.btConnectBtn} ${
                                                        isActive ? styles.btConnectBtnActive : ""
                                                    } ${isConnecting ? styles.btNoAnim : ""}`}
                                                    onClick={() => handleConnectDevice(device.address)}
                                                    disabled={isBtBusy || isActive}
                                                >
                                                    {isActive
                                                        ? "Terhubung"
                                                        : isConnecting
                                                          ? "Menyambungkan..."
                                                          : "Sambungkan"}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className={styles.historySection}>
                <h3>Report Penjualan</h3>
                {salesHistory.length === 0 ? (
                    <p className={styles.emptyHistory}>Belum ada transaksi.</p>
                ) : (
                    <div className={styles.historyList}>
                        {salesHistory.map((entry) => (
                            <div key={entry.id} className={styles.historyItem}>
                                <p className={styles.historyTitle}>
                                    {entry.channel === "pos" ? "Penjualan POS" : "Penjualan Link Publik"}
                                </p>
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
