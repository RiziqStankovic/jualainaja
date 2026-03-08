export type PaperWidth = "58mm" | "80mm";

export const PAPER_WIDTH_CHARS: Record<PaperWidth, number> = {
    "58mm": 32,
    "80mm": 48,
};

export const DEFAULT_RECEIPT_TEMPLATE = [
    "{{STORE_NAME}}",
    "------------------------------",
    "Waktu: {{DATETIME}}",
    "Kasir: {{CASHIER}}",
    "Metode: {{PAYMENT_METHOD}}",
    "------------------------------",
    "{{ITEM_LINES}}",
    "------------------------------",
    "TOTAL: {{TOTAL}}",
    "{{CASH_PAID}}",
    "{{CHANGE}}",
    "",
    "Terima kasih",
].join("\n");

export type ReceiptItem = { name: string; quantity: number; price: number };

export type ReceiptRenderData = {
    storeName: string;
    cashier: string;
    datetime: string;
    paymentMethod: string;
    items: ReceiptItem[];
    totalAmount: number;
    cashPaid?: number;
    changeAmount?: number;
};

const safe = (v: unknown) => String(v ?? "");

const ellipsize = (s: string, max: number) => {
    if (max <= 0) return "";
    if (s.length <= max) return s;
    if (max <= 1) return s.slice(0, max);
    return `${s.slice(0, max - 1)}…`;
};

const padRight = (s: string, width: number) => (s.length >= width ? s : s + " ".repeat(width - s.length));
const padLeft = (s: string, width: number) => (s.length >= width ? s : " ".repeat(width - s.length) + s);

export const formatItemLines = (items: ReceiptItem[], widthChars: number) => {
    // Format: "<qty>x <name> .... <amount>"
    // Reserve a right column for amount; left column for qty+name.
    const amountMax = Math.min(14, Math.max(10, Math.floor(widthChars * 0.4)));
    const leftMax = Math.max(0, widthChars - 1 - amountMax);

    return items
        .map((it) => {
            const left = `${it.quantity}x ${it.name}`.replace(/\s+/g, " ").trim();
            const amount = `Rp ${(it.price * it.quantity).toLocaleString("id-ID")}`;

            const leftTxt = ellipsize(left, leftMax);
            const amountTxt = ellipsize(amount, amountMax);
            return `${padRight(leftTxt, leftMax)} ${padLeft(amountTxt, amountMax)}`;
        })
        .join("\n");
};

export const renderReceiptFromTemplate = (
    template: string,
    data: ReceiptRenderData,
    opts?: { widthChars?: number }
) => {
    const widthChars = opts?.widthChars ?? PAPER_WIDTH_CHARS["58mm"];

    const itemLines = formatItemLines(data.items, widthChars);
    const total = `Rp ${data.totalAmount.toLocaleString("id-ID")}`;
    const cashPaid = data.cashPaid != null ? `Tunai: Rp ${data.cashPaid.toLocaleString("id-ID")}` : "";
    const change = data.changeAmount != null ? `Kembali: Rp ${data.changeAmount.toLocaleString("id-ID")}` : "";

    return template
        .replaceAll("{{STORE_NAME}}", safe(data.storeName))
        .replaceAll("{{CASHIER}}", safe(data.cashier))
        .replaceAll("{{DATETIME}}", safe(data.datetime))
        .replaceAll("{{PAYMENT_METHOD}}", safe(data.paymentMethod))
        .replaceAll("{{ITEM_LINES}}", itemLines)
        .replaceAll("{{TOTAL}}", total)
        .replaceAll("{{CASH_PAID}}", cashPaid)
        .replaceAll("{{CHANGE}}", change);
};

