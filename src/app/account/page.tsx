"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bluetooth, LogOut, ShieldAlert, UserCircle } from "lucide-react";
import { clearSessionUser, getPurchaseHistory, getSalesHistory, getSessionUser, SessionUser } from "@/lib/local-auth";
import {
    buildReceiptTemplateFromForm,
    DEFAULT_RECEIPT_TEMPLATE,
    DEFAULT_RECEIPT_TEMPLATE_FORM,
    PAPER_WIDTH_CHARS,
    PaperWidth,
    parseReceiptTemplateToForm,
    renderReceiptFromTemplate,
    type ReceiptTemplateForm,
} from "@/lib/receipt-template";
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

type AndroidBridge = {
    [method: string]: ((...args: unknown[]) => string) | undefined;
};

type PrintSettingsResponse = {
    printTemplate: string;
    paperWidth: PaperWidth;
};

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
    const [btLoading, setBtLoading] = useState(false);
    const [btRefreshing, setBtRefreshing] = useState(false);
    const [btPrinting, setBtPrinting] = useState(false);
    const [btError, setBtError] = useState<string | null>(null);
    const [btInfo, setBtInfo] = useState<string | null>(null);
    const [paperWidth, setPaperWidth] = useState<PaperWidth>("58mm");
    const [sampleNow, setSampleNow] = useState(() => new Date());
    const [templateForm, setTemplateForm] = useState<ReceiptTemplateForm>(() => DEFAULT_RECEIPT_TEMPLATE_FORM);
    const [useManualTemplate, setUseManualTemplate] = useState(false);
    const [manualTemplate, setManualTemplate] = useState(() => DEFAULT_RECEIPT_TEMPLATE);
    const printTemplate = useMemo(
        () => (useManualTemplate ? manualTemplate : buildReceiptTemplateFromForm(templateForm)),
        [manualTemplate, templateForm, useManualTemplate]
    );
    const templateStorageKey = useMemo(() => {
        const email = sessionUser?.email || "anon";
        return `jualinaja.printTemplate.v1:${email}`;
    }, [sessionUser?.email]);
    const paperWidthStorageKey = useMemo(() => {
        const email = sessionUser?.email || "anon";
        return `jualinaja.printPaperWidth.v1:${email}`;
    }, [sessionUser?.email]);

    const [templateSavedInfo, setTemplateSavedInfo] = useState<string | null>(null);
    const [settingsHydrated, setSettingsHydrated] = useState(false);
    const normalizeTemplate = (value: string) => value.replaceAll("\r\n", "\n").trimEnd();

    useEffect(() => {
        if (typeof window === "undefined") return;
        const hasBridge = typeof (window as Window & { Android?: AndroidBridge }).Android !== "undefined";
        setHasAndroidBridge(hasBridge);

        if (!hasBridge) return;

        refreshBluetoothStatus();
        refreshPairedDevices();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionUser?.email]);

    // Load template + paper width (prioritas: DB -> localStorage -> Android bridge)
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!sessionUser) return;
        let cancelled = false;
        setSettingsHydrated(false);

        const loadSettings = async () => {
            let nextTemplate: string | null = null;
            let nextPaperWidth: PaperWidth | null = null;

            try {
                const res = await fetch(`/api/account/print-settings?email=${encodeURIComponent(sessionUser.email)}`, {
                    cache: "no-store",
                });
                if (res.ok) {
                    const data = (await res.json()) as PrintSettingsResponse;
                    if (typeof data.printTemplate === "string" && data.printTemplate.trim().length > 0) {
                        nextTemplate = data.printTemplate;
                    }
                    if (data.paperWidth === "58mm" || data.paperWidth === "80mm") {
                        nextPaperWidth = data.paperWidth;
                    }
                }
            } catch {
                // ignore, fallback next source
            }

            if (!nextTemplate) {
                try {
                    const savedTemplate = window.localStorage.getItem(templateStorageKey);
                    if (savedTemplate && savedTemplate.trim().length > 0) {
                        nextTemplate = savedTemplate;
                    }
                } catch {
                    // ignore
                }
            }

            if (!nextPaperWidth) {
                try {
                    const savedWidth = window.localStorage.getItem(paperWidthStorageKey);
                    if (savedWidth === "58mm" || savedWidth === "80mm") {
                        nextPaperWidth = savedWidth;
                    }
                } catch {
                    // ignore
                }
            }

            if (!nextTemplate) {
                const raw = callAndroid("getPrintTemplate");
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw) as AndroidResult & { template?: string };
                        const tpl = parsed.template;
                        if (parsed.success && typeof tpl === "string" && tpl.trim().length > 0) {
                            nextTemplate = tpl;
                        }
                    } catch {
                        // ignore
                    }
                }
            }

            if (cancelled) return;

            if (nextTemplate) {
                const parsedForm = parseReceiptTemplateToForm(nextTemplate);
                const generated = buildReceiptTemplateFromForm(parsedForm);
                const manualMode = normalizeTemplate(nextTemplate) !== normalizeTemplate(generated);

                setTemplateForm(parsedForm);
                setManualTemplate(nextTemplate);
                setUseManualTemplate(manualMode);
                try {
                    window.localStorage.setItem(templateStorageKey, nextTemplate);
                } catch {
                    // ignore
                }
            }
            if (nextPaperWidth) {
                setPaperWidth(nextPaperWidth);
                try {
                    window.localStorage.setItem(paperWidthStorageKey, nextPaperWidth);
                } catch {
                    // ignore
                }
            }

            setTemplateSavedInfo("Tersimpan");
            setSettingsHydrated(true);
        };

        loadSettings();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionUser?.email, templateStorageKey, paperWidthStorageKey, hasAndroidBridge]);

    // Auto-save template + paper width ke localStorage, Android, dan DB (debounce)
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!sessionUser || !settingsHydrated) return;

        const t = window.setTimeout(() => {
            try {
                window.localStorage.setItem(templateStorageKey, printTemplate);
                window.localStorage.setItem(paperWidthStorageKey, paperWidth);
            } catch {
                // ignore
            }
            callAndroid("setPrintTemplate", printTemplate);

            void (async () => {
                try {
                    const res = await fetch("/api/account/print-settings", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            email: sessionUser.email,
                            printTemplate,
                            paperWidth,
                        }),
                    });
                    if (res.ok) {
                        setTemplateSavedInfo("Tersimpan ke cloud");
                    } else {
                        setTemplateSavedInfo("Tersimpan lokal (offline)");
                    }
                } catch {
                    setTemplateSavedInfo("Tersimpan lokal (offline)");
                }
            })();
        }, 400);

        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionUser?.email, settingsHydrated, printTemplate, paperWidth, templateStorageKey, paperWidthStorageKey]);

    const updateTemplateField = (field: keyof ReceiptTemplateForm, value: string) => {
        setTemplateForm((prev) => ({ ...prev, [field]: value }));
    };

    useEffect(() => {
        if (useManualTemplate) return;
        setManualTemplate(buildReceiptTemplateFromForm(templateForm));
    }, [templateForm, useManualTemplate]);

    const renderedPreview = useMemo(() => {
        const widthChars = PAPER_WIDTH_CHARS[paperWidth] ?? PAPER_WIDTH_CHARS["58mm"];
        return renderReceiptFromTemplate(
            printTemplate,
            {
                storeName: sessionUser?.name || "Toko",
                cashier: sessionUser?.name || "Kasir",
                datetime: sampleNow.toLocaleString("id-ID"),
                paymentMethod: "Tunai",
                items: [
                    { name: "Kopi Susu", quantity: 1, price: 18000 },
                    { name: "Roti Bakar Coklat Keju", quantity: 2, price: 15000 },
                ],
                totalAmount: 48000,
                cashPaid: 50000,
                changeAmount: 2000,
            },
            { widthChars }
        );
    }, [paperWidth, printTemplate, sampleNow, sessionUser?.name]);

    const callAndroid = (method: string, ...args: unknown[]): string | null => {
        if (typeof window === "undefined") return null;
        const android = (window as Window & { Android?: AndroidBridge }).Android;
        if (!android) return null;
        const target = android[method];
        if (typeof target !== "function") return null;
        try {
            return target(...args);
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

    const handleRefreshAll = () => {
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
        setBtLoading(true);
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
            setBtLoading(false);
        }
    };

    const handleDisconnect = () => {
        setBtLoading(true);
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
            setBtLoading(false);
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

    const handleTestPrint = () => {
        setBtPrinting(true);
        setBtError(null);
        setBtInfo(null);
        try {
            const payload = JSON.stringify({ type: "text", text: renderedPreview });
            const raw = callAndroid("print", payload);
            if (!raw) {
                setBtError("Tidak dapat menghubungi bridge Android.");
                return;
            }
            const parsed = JSON.parse(raw) as AndroidResult;
            if (!parsed.success) {
                setBtError(parsed.message ?? "Gagal print test.");
            } else {
                setBtInfo(parsed.message ?? "Print test berhasil dikirim.");
            }
        } catch {
            setBtError("Terjadi kesalahan saat melakukan test print.");
        } finally {
            setBtPrinting(false);
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
                            >
                                Pengaturan Bluetooth HP
                            </button>
                            <button
                                type="button"
                                className={styles.btRefreshBtn}
                                onClick={handleRefreshAll}
                                disabled={btRefreshing || btLoading}
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
                                className={styles.btSecondaryBtn}
                                onClick={handleDisconnect}
                                disabled={btLoading || btRefreshing}
                            >
                                Putuskan sambungan
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
                                                    }`}
                                                    onClick={() => handleConnectDevice(device.address)}
                                                    disabled={btLoading || isActive}
                                                >
                                                    {isActive
                                                        ? "Terhubung"
                                                        : btLoading
                                                          ? "Menyambungkan..."
                                                          : "Sambungkan"}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <div className={styles.printCard}>
                            <p className={styles.printTitle}>Template Struk</p>
                            <p className={styles.printHint}>
                                Atur format struk pakai form. Template tetap disimpan sebagai token dan akan disamakan
                                ke Android wrapper.
                            </p>
                            <div className={styles.printMetaRow}>
                                <span className={styles.printMeta}>
                                    Template: <b>{templateSavedInfo ?? "Belum tersimpan"}</b>
                                </span>
                                <div className={styles.printMetaActions}>
                                    <button
                                        type="button"
                                        className={`${styles.printChip} ${
                                            paperWidth === "58mm" ? styles.printChipActive : ""
                                        }`}
                                        onClick={() => setPaperWidth("58mm")}
                                        disabled={btPrinting}
                                    >
                                        58mm
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.printChip} ${
                                            paperWidth === "80mm" ? styles.printChipActive : ""
                                        }`}
                                        onClick={() => setPaperWidth("80mm")}
                                        disabled={btPrinting}
                                    >
                                        80mm
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.printResetBtn}
                                        onClick={() => {
                                            window.localStorage.removeItem(templateStorageKey);
                                            setTemplateForm(DEFAULT_RECEIPT_TEMPLATE_FORM);
                                            setManualTemplate(DEFAULT_RECEIPT_TEMPLATE);
                                            setUseManualTemplate(false);
                                        }}
                                        disabled={btPrinting}
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>

                            <div className={styles.templateFormGrid}>
                                <label className={styles.templateField}>
                                    <span>Label Waktu</span>
                                    <input
                                        type="text"
                                        value={templateForm.datetimeLabel}
                                        onChange={(e) => updateTemplateField("datetimeLabel", e.target.value)}
                                        placeholder="Waktu"
                                        disabled={useManualTemplate}
                                    />
                                </label>
                                <label className={styles.templateField}>
                                    <span>Label Kasir</span>
                                    <input
                                        type="text"
                                        value={templateForm.cashierLabel}
                                        onChange={(e) => updateTemplateField("cashierLabel", e.target.value)}
                                        placeholder="Kasir"
                                        disabled={useManualTemplate}
                                    />
                                </label>
                                <label className={styles.templateField}>
                                    <span>Label Metode Bayar</span>
                                    <input
                                        type="text"
                                        value={templateForm.paymentMethodLabel}
                                        onChange={(e) => updateTemplateField("paymentMethodLabel", e.target.value)}
                                        placeholder="Metode"
                                        disabled={useManualTemplate}
                                    />
                                </label>
                                <label className={styles.templateField}>
                                    <span>Label Total</span>
                                    <input
                                        type="text"
                                        value={templateForm.totalLabel}
                                        onChange={(e) => updateTemplateField("totalLabel", e.target.value)}
                                        placeholder="TOTAL"
                                        disabled={useManualTemplate}
                                    />
                                </label>
                                <label className={styles.templateFieldWide}>
                                    <span>Teks Penutup</span>
                                    <input
                                        type="text"
                                        value={templateForm.closingText}
                                        onChange={(e) => updateTemplateField("closingText", e.target.value)}
                                        placeholder="Terima kasih"
                                        disabled={useManualTemplate}
                                    />
                                </label>
                            </div>

                            <label className={styles.customTemplateToggle}>
                                <input
                                    type="checkbox"
                                    checked={useManualTemplate}
                                    onChange={(e) => setUseManualTemplate(e.target.checked)}
                                />
                                <span>Gunakan Template Manual (Custom Bebas)</span>
                            </label>
                            {useManualTemplate && (
                                <label className={styles.customTemplateField}>
                                    <span>Template Manual</span>
                                    <textarea
                                        value={manualTemplate}
                                        onChange={(e) => setManualTemplate(e.target.value)}
                                        rows={10}
                                        placeholder="{{STORE_NAME}}\n{{DIVIDER}}\n..."
                                    />
                                </label>
                            )}

                            <p className={styles.printTitle} style={{ marginTop: 12 }}>
                                Preview Hasil
                            </p>
                            <pre
                                className={`${styles.printPreviewBox} ${
                                    paperWidth === "58mm" ? styles.printPreview58 : styles.printPreview80
                                }`}
                            >
                                {renderedPreview}
                            </pre>

                            <div className={styles.printActions}>
                                <button
                                    type="button"
                                    className={styles.printBtn}
                                    onClick={handleTestPrint}
                                    disabled={!btStatus?.connected || btPrinting || btLoading || btRefreshing}
                                >
                                    {btPrinting ? "Mengirim..." : "Test Print"}
                                </button>
                                <button
                                    type="button"
                                    className={styles.btSecondaryBtn}
                                    onClick={() => {
                                        setSampleNow(new Date());
                                    }}
                                    disabled={btPrinting}
                                >
                                    Update Waktu
                                </button>
                            </div>
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
