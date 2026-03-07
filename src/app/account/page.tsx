"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bluetooth, LogOut, ShieldAlert, UserCircle } from "lucide-react";
import { clearSessionUser, getPurchaseHistory, getSalesHistory, getSessionUser, SessionUser } from "@/lib/local-auth";
import styles from "./page.module.css";

type BluetoothStatus = {
    supported: boolean;
    enabled: boolean;
    lastDeviceAddress?: string;
    connectedAddresses?: string[];
    appConnected?: boolean;
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

type ReceiptSettings = {
    storeName: string;
    storeAddress: string;
    footerText: string;
    cashierName: string;
    paperWidth: 32 | 48;
    feed: number;
    cut: boolean;
    showDate: boolean;
};

const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
    storeName: "JualinAja Store",
    storeAddress: "Jl. Contoh No. 1, Jakarta",
    footerText: "Terima kasih sudah berbelanja",
    cashierName: "Kasir",
    paperWidth: 32,
    feed: 3,
    cut: false,
    showDate: true
};

const RECEIPT_SETTINGS_KEY = "jualinaja_receipt_settings_v1";

const previewTwoCol = (left: string, right: string, width: number) => {
    if (!right) return left;
    const maxLeft = Math.max(1, width - right.length - 1);
    const safeLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
    const spaces = Math.max(1, width - safeLeft.length - right.length);
    return `${safeLeft}${" ".repeat(spaces)}${right}`;
};

const wrapPreview = (text: string, width: number) => {
    const rows: string[] = [];
    for (const raw of text.replace(/\r/g, "").split("\n")) {
        if (raw.length <= width) {
            rows.push(raw);
            continue;
        }
        let current = "";
        for (const word of raw.split(" ")) {
            if (!word) continue;
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length <= width) {
                current = candidate;
            } else {
                if (current) rows.push(current);
                if (word.length <= width) {
                    current = word;
                } else {
                    for (let i = 0; i < word.length; i += width) {
                        rows.push(word.slice(i, i + width));
                    }
                    current = "";
                }
            }
        }
        if (current) rows.push(current);
    }
    return rows.length > 0 ? rows : [""];
};

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
    const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);
    const [receiptSavedInfo, setReceiptSavedInfo] = useState<string | null>(null);
    const [isPaperWidthOpen, setIsPaperWidthOpen] = useState(false);
    const paperWidthDropdownRef = useRef<HTMLDivElement | null>(null);
    const connectedAddressSet = useMemo(
        () => new Set((btStatus?.connectedAddresses ?? []).map((address) => address.toUpperCase())),
        [btStatus?.connectedAddresses]
    );
    const hasConnectedDevice = btStatus
        ? connectedAddressSet.size > 0 || btStatus.connected || btStatus.appConnected === true
        : false;

    useEffect(() => {
        if (typeof window === "undefined") return;
        const hasBridge = typeof window.Android !== "undefined";
        setHasAndroidBridge(hasBridge);

        if (!hasBridge) return;

        refreshBluetoothStatus();
        refreshPairedDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionUser?.email]);

    useEffect(() => {
        if (!hasAndroidBridge) return;

        const refreshOnFocus = () => {
            refreshBluetoothStatus();
            refreshPairedDevices();
        };

        window.addEventListener("focus", refreshOnFocus);
        document.addEventListener("visibilitychange", refreshOnFocus);

        return () => {
            window.removeEventListener("focus", refreshOnFocus);
            document.removeEventListener("visibilitychange", refreshOnFocus);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasAndroidBridge]);

    useEffect(() => {
        if (!sessionUser?.email) return;
        try {
            const raw = localStorage.getItem(`${RECEIPT_SETTINGS_KEY}:${sessionUser.email}`);
            if (!raw) {
                setReceiptSettings(DEFAULT_RECEIPT_SETTINGS);
                return;
            }
            const parsed = JSON.parse(raw) as Partial<ReceiptSettings>;
            setReceiptSettings({
                ...DEFAULT_RECEIPT_SETTINGS,
                ...parsed,
                paperWidth: parsed.paperWidth === 48 ? 48 : 32,
                feed: Math.max(0, Math.min(8, Number(parsed.feed ?? DEFAULT_RECEIPT_SETTINGS.feed)))
            });
        } catch {
            setReceiptSettings(DEFAULT_RECEIPT_SETTINGS);
        }
    }, [sessionUser?.email]);

    useEffect(() => {
        if (!isPaperWidthOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (!paperWidthDropdownRef.current) return;
            if (!paperWidthDropdownRef.current.contains(event.target as Node)) {
                setIsPaperWidthOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isPaperWidthOpen]);

    useEffect(() => {
        setIsPaperWidthOpen(false);
    }, [receiptSettings.paperWidth]);

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

    const handleReceiptChange =
        <K extends keyof ReceiptSettings>(key: K) =>
        (value: ReceiptSettings[K]) => {
            setReceiptSettings((prev) => ({ ...prev, [key]: value }));
            setReceiptSavedInfo(null);
        };

    const handleSaveReceiptSettings = () => {
        if (!sessionUser?.email) return;
        localStorage.setItem(`${RECEIPT_SETTINGS_KEY}:${sessionUser.email}`, JSON.stringify(receiptSettings));
        setReceiptSavedInfo("Pengaturan struk berhasil disimpan.");
    };

    const handleResetReceiptSettings = () => {
        setReceiptSettings(DEFAULT_RECEIPT_SETTINGS);
        setReceiptSavedInfo("Pengaturan struk direset ke default. Klik Simpan untuk menyimpan.");
    };

    const receiptPreviewLines = useMemo(() => {
        const width = receiptSettings.paperWidth;
        const now = new Date();
        const lines: string[] = [];
        lines.push(...wrapPreview(receiptSettings.storeName.toUpperCase(), width));
        lines.push(...wrapPreview(receiptSettings.storeAddress, width));
        if (receiptSettings.showDate) {
            lines.push(previewTwoCol("Tanggal", now.toLocaleString("id-ID"), width));
        }
        lines.push(previewTwoCol("Kasir", receiptSettings.cashierName, width));
        lines.push("-".repeat(width));
        lines.push(...wrapPreview("Es Kopi Susu", width));
        lines.push(previewTwoCol("2 x 15000", "30000", width));
        lines.push(...wrapPreview("Roti Bakar Coklat", width));
        lines.push(previewTwoCol("1 x 12000", "12000", width));
        lines.push("-".repeat(width));
        lines.push(previewTwoCol("TOTAL", "42000", width));
        lines.push(...wrapPreview(receiptSettings.footerText, width));
        return lines;
    }, [receiptSettings]);

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
                                        hasConnectedDevice ? styles.btBadgeOk : styles.btBadgeNeutral
                                    }`}
                                >
                                    {hasConnectedDevice
                                        ? connectedAddressSet.size > 1
                                            ? `${connectedAddressSet.size} perangkat tersambung`
                                            : "Sudah tersambung"
                                        : "Belum tersambung"}
                                </span>
                            </div>
                        )}

                        {btStatus?.appConnected && (
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
                                        const deviceAddress = device.address.toUpperCase();
                                        const isConnectedBySystem = connectedAddressSet.has(deviceAddress);
                                        const isConnectedByApp =
                                            btStatus?.appConnected && btStatus.lastDeviceAddress === device.address;
                                        const isActive = isConnectedBySystem || isConnectedByApp;
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

            <div className={styles.receiptSection}>
                <div className={styles.receiptHeader}>
                    <h3>Custom Setting Struk</h3>
                    <p>Atur format dasar struk lalu lihat preview langsung.</p>
                </div>

                <div className={styles.receiptGrid}>
                    <div className={styles.receiptForm}>
                        <label className={styles.receiptField}>
                            <span>Nama Toko</span>
                            <input
                                type="text"
                                value={receiptSettings.storeName}
                                onChange={(e) => handleReceiptChange("storeName")(e.target.value)}
                            />
                        </label>

                        <label className={styles.receiptField}>
                            <span>Alamat Toko</span>
                            <textarea
                                rows={2}
                                value={receiptSettings.storeAddress}
                                onChange={(e) => handleReceiptChange("storeAddress")(e.target.value)}
                            />
                        </label>

                        <label className={styles.receiptField}>
                            <span>Nama Kasir</span>
                            <input
                                type="text"
                                value={receiptSettings.cashierName}
                                onChange={(e) => handleReceiptChange("cashierName")(e.target.value)}
                            />
                        </label>

                        <label className={styles.receiptField}>
                            <span>Footer</span>
                            <textarea
                                rows={2}
                                value={receiptSettings.footerText}
                                onChange={(e) => handleReceiptChange("footerText")(e.target.value)}
                            />
                        </label>

                        <div className={styles.receiptInlineFields}>
                            <label className={styles.receiptField}>
                                <span>Lebar Kertas</span>
                                <div className={styles.receiptSelectWrap} ref={paperWidthDropdownRef}>
                                    <button
                                        type="button"
                                        className={`${styles.receiptSelectButton} ${
                                            isPaperWidthOpen ? styles.receiptSelectButtonOpen : ""
                                        }`}
                                        onClick={() => setIsPaperWidthOpen((prev) => !prev)}
                                    >
                                        <span>
                                            {receiptSettings.paperWidth === 48
                                                ? "80mm (48 kolom)"
                                                : "58mm (32 kolom)"}
                                        </span>
                                        <span
                                            className={`${styles.receiptSelectChevron} ${
                                                isPaperWidthOpen ? styles.receiptSelectChevronOpen : ""
                                            }`}
                                        />
                                    </button>
                                    {isPaperWidthOpen && (
                                        <div className={styles.receiptSelectMenu}>
                                            <button
                                                type="button"
                                                className={`${styles.receiptSelectOption} ${
                                                    receiptSettings.paperWidth === 32 ? styles.receiptSelectOptionActive : ""
                                                }`}
                                                onClick={() => {
                                                    handleReceiptChange("paperWidth")(32);
                                                    setIsPaperWidthOpen(false);
                                                }}
                                            >
                                                58mm (32 kolom)
                                            </button>
                                            <button
                                                type="button"
                                                className={`${styles.receiptSelectOption} ${
                                                    receiptSettings.paperWidth === 48 ? styles.receiptSelectOptionActive : ""
                                                }`}
                                                onClick={() => {
                                                    handleReceiptChange("paperWidth")(48);
                                                    setIsPaperWidthOpen(false);
                                                }}
                                            >
                                                80mm (48 kolom)
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </label>
                            <label className={styles.receiptField}>
                                <span>Feed Akhir</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={8}
                                    value={receiptSettings.feed}
                                    onChange={(e) =>
                                        handleReceiptChange("feed")(Math.max(0, Math.min(8, Number(e.target.value))))
                                    }
                                />
                            </label>
                        </div>

                        <label className={styles.receiptCheck}>
                            <input
                                type="checkbox"
                                checked={receiptSettings.showDate}
                                onChange={(e) => handleReceiptChange("showDate")(e.target.checked)}
                            />
                            Tampilkan tanggal di struk
                        </label>

                        <label className={styles.receiptCheck}>
                            <input
                                type="checkbox"
                                checked={receiptSettings.cut}
                                onChange={(e) => handleReceiptChange("cut")(e.target.checked)}
                            />
                            Gunakan perintah cut kertas
                        </label>

                        <div className={styles.receiptActions}>
                            <button type="button" className={styles.receiptSaveBtn} onClick={handleSaveReceiptSettings}>
                                Simpan Setting
                            </button>
                            <button
                                type="button"
                                className={styles.receiptResetBtn}
                                onClick={handleResetReceiptSettings}
                            >
                                Reset Default
                            </button>
                        </div>

                        {receiptSavedInfo && <p className={styles.receiptInfo}>{receiptSavedInfo}</p>}
                    </div>

                    <div className={styles.receiptPreviewCard}>
                        <p className={styles.receiptPreviewTitle}>Preview Struk</p>
                        <pre className={styles.receiptPreviewText}>{receiptPreviewLines.join("\n")}</pre>
                        <p className={styles.receiptPreviewMeta}>
                            Width: {receiptSettings.paperWidth} kolom | Feed: {receiptSettings.feed} | Cut:{" "}
                            {receiptSettings.cut ? "On" : "Off"}
                        </p>
                    </div>
                </div>
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
